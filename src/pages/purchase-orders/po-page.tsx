import * as React from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { format } from "date-fns";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  Plus,
  Printer,
  Save,
  Send,
  Trash2,
  Undo2,
  X,
} from "lucide-react";

import {
  Button,
  ConfirmationModal,
  ContainerCard,
  DatePicker,
  DepartmentChip,
  ErrorState,
  Field,
  IconButton,
  Input,
  PageTransition,
  SelectField,
  Skeleton,
  SkeletonText,
  StatusBadge,
  toast,
} from "@/components";
import { useAuth } from "@/features/auth/auth-context";
import { can } from "@/features/auth/types";
import { useConfigOptions } from "@/features/config/use-module-config";
import {
  acknowledgePurchaseOrder,
  issuePurchaseOrder,
  listPurchaseOrders,
  setPurchaseOrderStatus,
  updatePurchaseOrderDetails,
  type PODetailsInput,
} from "@/features/purchase-orders/api";
import { usePurchaseOrder } from "@/features/purchase-orders/hooks";
import {
  buildPOTimeline,
  canAcknowledgePO,
  canIssuePO,
  compareWithPR,
  formatDate,
} from "@/features/purchase-orders/lib";
import { supplierById, type PurchaseOrder } from "@/features/purchase-orders/types";
import { POPrintSheet } from "@/features/shared/procurement-sheets";
import { getPurchaseRequest } from "@/features/purchase-requests/api";
import { departmentByCode, prTotal, type PurchaseRequest } from "@/features/purchase-requests/types";
import { reportLoadFailure } from "@/features/shared/load-guard";
import { HistoryTabs } from "@/features/shared/record-history";
import { formatPHP } from "@/lib/format";

/**
 * A purchase order (21 Oct 2026). The order is created when its request is
 * approved, already authorized by that approval; here an Administrator
 * completes its document details, corrects it if needed, and prints the
 * official form. Every document field is optional: what is blank prints as a
 * line to fill in by hand. Every save is kept in History → Changes: what was
 * filled in, and items added, removed or changed, with the before and after
 * values. Since 30 Oct 2026 no reason is asked for.
 *
 * Orders from the earlier workflow (Draft, Pending Approval, Released) keep
 * their own actions here: submit, approve, return, issue, acknowledge,
 * complete.
 */

const peso = (n: number) => formatPHP(n, { decimals: 2 });
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

interface ItemRow {
  id: string;
  stockNo: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
}

interface DetailsForm {
  supplierName: string;
  supplierAddress: string;
  supplierTin: string;
  supplierContact: string;
  modeOfProcurement: string;
  bacResolutionNo: string;
  bacResolutionSeries: string;
  deliveryAddress: string;
  expectedDelivery?: Date;
  deliveryTerm: string;
  paymentTerm: string;
  items: ItemRow[];
}

/** The document fields, as the form and the stored order name them. */
const FIELDS: { name: Exclude<keyof DetailsForm, "items" | "expectedDelivery">; label: string; of: (po: PurchaseOrder) => string | undefined }[] = [
  { name: "supplierName", label: "Supplier", of: (po) => po.supplierName || supplierById(po.supplierId)?.name },
  { name: "supplierAddress", label: "Address", of: (po) => po.supplierAddress },
  { name: "supplierTin", label: "TIN", of: (po) => po.supplierTin },
  { name: "supplierContact", label: "Contact number", of: (po) => po.supplierContact },
  { name: "modeOfProcurement", label: "Mode of procurement", of: (po) => po.modeOfProcurement },
  { name: "bacResolutionNo", label: "BAC resolution no.", of: (po) => po.bacResolutionNo },
  { name: "bacResolutionSeries", label: "BAC resolution series", of: (po) => po.bacResolutionSeries },
  { name: "deliveryAddress", label: "Place of delivery", of: (po) => po.deliveryAddress },
  { name: "deliveryTerm", label: "Delivery term", of: (po) => po.deliveryTerm },
  { name: "paymentTerm", label: "Payment term", of: (po) => po.paymentTerm },
];

const toForm = (po: PurchaseOrder): DetailsForm => ({
  ...(Object.fromEntries(FIELDS.map((f) => [f.name, str(f.of(po))])) as Omit<DetailsForm, "items" | "expectedDelivery">),
  expectedDelivery: po.expectedDelivery ? new Date(`${po.expectedDelivery}T00:00:00`) : undefined,
  items: po.items.map((it) => ({
    id: it.id,
    stockNo: str(it.stockNo),
    description: it.description,
    quantity: it.quantity,
    unit: it.unit,
    unitCost: it.unitCost,
  })),
});

const dateValue = (d?: Date) => (d ? format(d, "yyyy-MM-dd") : "");

const itemError = (it: ItemRow) =>
  !str(it.description) || str(it.description).length < 3
    ? "Describe the item"
    : !(Number(it.quantity) > 0)
      ? "Quantity must be more than 0"
      : !str(it.unit)
        ? "Choose the unit"
        : !(Number(it.unitCost) > 0)
          ? "Unit cost must be more than 0"
          : null;

export function POPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: po, loading, setData } = usePurchaseOrder(id);
  const [source, setSource] = React.useState<PurchaseRequest | null>(null);

  React.useEffect(() => {
    if (!po?.prNumber) return;
    void getPurchaseRequest(po.prNumber)
      .then(setSource)
      .catch((e) => reportLoadFailure(e, "the source purchase request"));
  }, [po?.prNumber]);

  if (loading && !po) {
    return (
      <PageTransition className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <ContainerCard padded>
          <SkeletonText lines={10} />
        </ContainerCard>
      </PageTransition>
    );
  }
  if (!po) {
    return (
      <PageTransition>
        <ContainerCard className="mx-auto w-full max-w-3xl">
          <ErrorState
            title="Purchase order not found"
            description="The link may be out of date. Purchase orders are created when their purchase request is approved."
            action={{ label: "Back to purchase orders", onClick: () => navigate("/purchase-orders") }}
          />
        </ContainerCard>
      </PageTransition>
    );
  }
  return (
    <POPageBody
      key={po.id}
      po={po}
      source={source}
      admin={can(user, "manage:purchase-orders")}
      userName={user?.name ?? "Administrator"}
      onUpdated={setData}
    />
  );
}

function POPageBody({
  po,
  source,
  admin,
  userName,
  onUpdated,
}: {
  po: PurchaseOrder;
  source: PurchaseRequest | null;
  admin: boolean;
  userName: string;
  onUpdated: (po: PurchaseOrder) => void;
}) {
  const editable = admin && ["Draft", "Pending Approval", "Approved"].includes(po.status) && !po.issuedAt;
  const form = useForm<DetailsForm>({ defaultValues: toForm(po) });
  const { control, register, reset, handleSubmit, formState } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "items", keyName: "key" });
  const values = useWatch({ control }) as DetailsForm;
  const items = values.items ?? [];
  const dirty = formState.isDirty;
  const [saving, setSaving] = React.useState(false);
  const [pastOrders, setPastOrders] = React.useState<PurchaseOrder[]>([]);
  const { options: modes } = useConfigOptions("Procurement", "po_procurement_modes");
  const { options: units } = useConfigOptions(
    "Procurement",
    "item_units",
    items.map((it) => it?.unit ?? "").filter(Boolean),
  );

  React.useEffect(() => {
    if (!editable) return;
    void listPurchaseOrders()
      .then(setPastOrders)
      .catch((e) => reportLoadFailure(e, "earlier purchase orders"));
  }, [editable]);

  // Suppliers already ordered from, newest first, for suggestions and their details.
  const suppliers = React.useMemo(() => {
    const seen = new Map<string, PurchaseOrder>();
    for (const o of pastOrders) {
      const name = str(o.supplierName);
      if (name && o.id !== po.id && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), o);
    }
    return [...seen.values()];
  }, [pastOrders, po.id]);
  const modeOptions = [...new Set([...modes, ...pastOrders.map((o) => str(o.modeOfProcurement)).filter(Boolean)])];

  /** A known supplier fills in its address, TIN and contact, where still blank. */
  const fillSupplier = (name: string) => {
    const known = suppliers.find((o) => str(o.supplierName).toLowerCase() === name.trim().toLowerCase());
    if (!known) return;
    for (const [field, value] of [
      ["supplierAddress", known.supplierAddress],
      ["supplierTin", known.supplierTin],
      ["supplierContact", known.supplierContact],
    ] as const) {
      if (value && !str(form.getValues(field))) form.setValue(field, value, { shouldDirty: true });
    }
  };

  const total = items.reduce((s, it) => s + (Number(it?.quantity) || 0) * (Number(it?.unitCost) || 0), 0);
  const authorized = po.authorizedItems ?? source?.items.map((it) => ({ ...it, unitCost: it.estimatedCost }));
  const comparison = compareWithPR(
    (authorized ?? []).map((it) => ({
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      estimatedCost: "unitCost" in it ? Number(it.unitCost) : 0,
    })),
    items.map((it) => ({ description: it.description, quantity: Number(it.quantity), unit: it.unit, unitCost: Number(it.unitCost) })),
  );
  const blankCount =
    FIELDS.filter((f) => !str(values[f.name]) && !f.name.startsWith("bac")).length + (values.expectedDelivery ? 0 : 1);
  const firstItemError = items.map(itemError).findIndex(Boolean);

  const save = handleSubmit(async (v) => {
    if (firstItemError !== -1) {
      toast.error(`Item ${firstItemError + 1}: ${itemError(items[firstItemError])}`);
      return;
    }
    setSaving(true);
    try {
      const details: PODetailsInput = {
        ...Object.fromEntries(FIELDS.map((f) => [f.name, str(v[f.name])])),
        expectedDelivery: dateValue(v.expectedDelivery),
        items: v.items.map((it) => ({
          id: it.id || undefined,
          description: str(it.description),
          quantity: Number(it.quantity),
          unit: str(it.unit),
          unitCost: Number(it.unitCost),
          stockNo: str(it.stockNo) || undefined,
        })),
      };
      // No reason is asked for (30 Oct 2026): what was added, removed or changed is kept in History → Changes.
      const updated = await updatePurchaseOrderDetails(po.id, details, { by: userName });
      onUpdated(updated);
      reset(toForm(updated));
      toast.success(`${po.poNumber} saved`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The purchase order could not be saved");
    }
    setSaving(false);
  });

  const print = () => {
    toast.info(`Preparing ${po.poNumber} for printing`);
    const title = document.title;
    document.title = `Purchase Order ${po.poNumber}`;
    window.print();
    document.title = title;
  };

  const dept = departmentByCode(po.departmentCode);
  const ro = !editable;

  return (
    <PageTransition className="@container w-full max-w-[1400px] space-y-5 pb-10">
      {/* The official order, as saved, is what prints. */}
      <POPrintSheet po={po} />

      <div>
        <Link
          to="/purchase-orders"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md text-[13px] text-[#5b606b] hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a6323b]"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Purchase orders
        </Link>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-['Geist_Mono',ui-monospace,monospace] text-[24px] font-semibold tracking-[-0.02em] text-neutral-900">
                {po.poNumber}
              </h1>
              <StatusBadge status={po.status} />
            </div>
            <p className="mt-1 text-[13.5px] text-[#5b606b]">
              {po.authorization === "pr-approval"
                ? `Authorized by the approval of ${po.prOfficialNumber ?? po.prNumber}${po.approvedAt ? ` on ${formatDate(po.approvedAt)}` : ""}. Not a record of delivery, inspection or payment.`
                : `Purchase order from ${po.prOfficialNumber ?? po.prNumber}.`}
            </p>
          </div>
          <LegacyActions po={po} admin={admin} userName={userName} onUpdated={onUpdated} />
        </div>
      </div>

      {/* Side by side only when the page has the width: beside the sidebar a 1024px window
          squeezed the order's columns until the office ran into the requester (30 Oct 2026). */}
      <div className="grid grid-cols-1 items-start gap-5 @min-[900px]:grid-cols-[minmax(0,1fr)_320px]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="min-w-0 space-y-5 rounded-[14px] border border-[#e6e6e3] bg-white px-5 py-5"
        >
          <Section title="Source purchase request" description="Copied from the approved request; it is not changed here.">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
              <Fact label="Official PR No.">{po.prOfficialNumber ?? source?.officialPrNumber ?? "—"}</Fact>
              <Fact label="PR reference">
                <span className="font-['Geist_Mono',ui-monospace,monospace] text-[13px]">{po.prNumber}</span>
              </Fact>
              <Fact label="PR total">{source ? peso(prTotal(source)) : "—"}</Fact>
              <Fact label="Requesting office">
                <DepartmentChip code={dept.name} color={dept.color} className="text-neutral-800" />
              </Fact>
              <Fact label="Requested by">{po.requester}</Fact>
              <Fact label="Purpose">{po.purpose}</Fact>
            </dl>
          </Section>

          <Section
            title="Supplier and procurement"
            description="All optional. Anything left blank prints as a line to fill in by hand."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Supplier" className="sm:col-span-2">
                <Input
                  list="po-suppliers"
                  placeholder="Not set — prints as a line"
                  disabled={ro}
                  {...register("supplierName", { onBlur: (e) => fillSupplier(e.target.value) })}
                />
              </Field>
              <datalist id="po-suppliers">
                {suppliers.map((o) => (
                  <option key={o.id} value={str(o.supplierName)} />
                ))}
              </datalist>
              <Field label="Address" className="sm:col-span-2">
                <Input placeholder="Not set" disabled={ro} {...register("supplierAddress")} />
              </Field>
              <Field label="TIN">
                <Input placeholder="Not set" disabled={ro} {...register("supplierTin")} />
              </Field>
              <Field label="Contact number">
                <Input placeholder="Not set" disabled={ro} {...register("supplierContact")} />
              </Field>
              <Field label="Mode of procurement" className="sm:col-span-2">
                <Input list="po-modes" placeholder="Not set" disabled={ro} {...register("modeOfProcurement")} />
              </Field>
              <datalist id="po-modes">
                {modeOptions.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <Field label="BAC Resolution No." helper="Negotiated purchase only (Section 369 (a), RA 7160).">
                <Input placeholder="Not set" disabled={ro} {...register("bacResolutionNo")} />
              </Field>
              <Field label="Series of">
                <Input inputMode="numeric" placeholder="e.g. 2026" disabled={ro} {...register("bacResolutionSeries")} />
              </Field>
            </div>
          </Section>

          <Section title="Delivery and payment" description="All optional.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Place of delivery" className="sm:col-span-2">
                <Input placeholder="Not set" disabled={ro} {...register("deliveryAddress")} />
              </Field>
              <Field label="Date of delivery">
                <div className="flex items-center gap-2">
                  <Controller
                    control={control}
                    name="expectedDelivery"
                    render={({ field }) => (
                      <DatePicker value={field.value} onChange={field.onChange} placeholder="Not set" disabled={ro} />
                    )}
                  />
                  {values.expectedDelivery && !ro && (
                    <IconButton
                      aria-label="Clear the date of delivery"
                      variant="ghost"
                      className="h-10 w-10 shrink-0"
                      onClick={() => form.setValue("expectedDelivery", undefined, { shouldDirty: true })}
                    >
                      <X />
                    </IconButton>
                  )}
                </div>
              </Field>
              <div className="hidden sm:block" />
              <Field label="Delivery term">
                <Input placeholder="Not set" disabled={ro} {...register("deliveryTerm")} />
              </Field>
              <Field label="Payment term">
                <Input placeholder="Not set" disabled={ro} {...register("paymentTerm")} />
              </Field>
            </div>
          </Section>

          <Section
            title="Items"
            description={
              po.authorization === "pr-approval"
                ? "As authorized with the request. Items added, removed or changed here are kept in the history; the request is not changed."
                : "The items on this order."
            }
          >
            {comparison.changes.length > 0 && (
              <div role="status" className="mb-3 rounded-[12px] border border-[#ecd2d5] bg-[#fcf6f7] px-4 py-3 text-[13px] text-[#4a4f59]">
                <p className="flex items-center gap-1.5 font-medium text-neutral-900">
                  <AlertTriangle aria-hidden="true" className="h-4 w-4 text-[#a6323b]" />
                  {comparison.changes.length} {comparison.changes.length === 1 ? "difference" : "differences"} from the items as
                  authorized
                </p>
                <p className="mt-1">
                  Authorized total {peso(comparison.prTotal)} · now {peso(comparison.poTotal)}
                </p>
              </div>
            )}
            <div className="relative overflow-x-auto rounded-[12px] border border-[#ececea]">
              <table className="w-full min-w-[720px] text-[13px]">
                <thead>
                  <tr className="border-b border-[#ececea] bg-[#fafaf9] text-left text-[12px] text-[#6b707a]">
                    <th className="w-10 px-3 py-2 text-right font-normal">#</th>
                    <th className="w-[120px] py-2 pr-2 font-normal">Stock/Property No.</th>
                    <th className="py-2 pr-2 font-normal">Description</th>
                    <th className="w-[84px] py-2 pr-2 text-right font-normal">Qty</th>
                    <th className="w-[104px] py-2 pr-2 font-normal">Unit</th>
                    <th className="w-[120px] py-2 pr-2 text-right font-normal">Unit cost</th>
                    <th className="w-[124px] py-2 pr-3 text-right font-normal">Amount</th>
                    {!ro && <th className="w-12 py-2 pr-2"><span className="sr-only">Remove</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {fields.map((row, i) => {
                    const it = items[i];
                    const err = it ? itemError(it) : null;
                    return (
                      <tr key={row.key} className="border-b border-[#f0f0ee] align-top last:border-b-0">
                        <td className="px-3 pt-4 text-right text-[12.5px] tabular-nums text-[#6b707a]">{i + 1}</td>
                        <td className="py-2 pr-2">
                          <Input aria-label={`Item ${i + 1} stock or property number`} placeholder="—" className="h-9" disabled={ro} {...register(`items.${i}.stockNo`)} />
                        </td>
                        <td className="py-2 pr-2">
                          <Input aria-label={`Item ${i + 1} description`} className="h-9" invalid={!!err && err.startsWith("Describe")} disabled={ro} {...register(`items.${i}.description`)} />
                          {err && <p className="mt-1 text-[12px] text-red-700">{err}</p>}
                        </td>
                        <td className="py-2 pr-2">
                          <Input aria-label={`Item ${i + 1} quantity`} type="number" min={0} step="any" className="h-9 text-right tabular-nums" disabled={ro} {...register(`items.${i}.quantity`, { valueAsNumber: true })} />
                        </td>
                        <td className="py-2 pr-2">
                          <Controller
                            control={control}
                            name={`items.${i}.unit`}
                            render={({ field }) => (
                              <SelectField
                                aria-label={`Item ${i + 1} unit`}
                                options={units.map((u) => ({ value: u, label: u }))}
                                value={field.value}
                                onChange={field.onChange}
                                disabled={ro}
                                className="h-9"
                              />
                            )}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Input aria-label={`Item ${i + 1} unit cost in pesos`} type="number" min={0} step="0.01" className="h-9 text-right tabular-nums" disabled={ro} {...register(`items.${i}.unitCost`, { valueAsNumber: true })} />
                        </td>
                        <td className="py-2 pr-3 pt-4 text-right font-medium tabular-nums text-neutral-900">
                          {peso((Number(it?.quantity) || 0) * (Number(it?.unitCost) || 0))}
                        </td>
                        {!ro && (
                          <td className="py-2 pr-2">
                            <IconButton
                              aria-label={`Remove item ${i + 1}`}
                              variant="ghost"
                              className="h-9 w-9 text-[#7c818b] hover:text-red-700"
                              onClick={() => remove(i)}
                              disabled={fields.length === 1}
                            >
                              <Trash2 />
                            </IconButton>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[#ececea]">
                    <td colSpan={6} className="px-3 py-2.5 text-right text-[13px] text-[#5b606b]">
                      Total
                    </td>
                    <td className="py-2.5 pr-3 text-right text-[15px] font-semibold tabular-nums text-neutral-900">{peso(total)}</td>
                    {!ro && <td />}
                  </tr>
                </tfoot>
              </table>
            </div>
            {!ro && (
              <Button
                variant="secondary"
                className="mt-3"
                onClick={() => append({ id: "", stockNo: "", description: "", quantity: 1, unit: "pc", unitCost: 0 })}
              >
                <Plus />
                Add item
              </Button>
            )}
          </Section>

          <section id="history" className="border-t border-[#f0f0ee] pt-5">
            <h2 className="text-[15px] font-semibold text-neutral-900">History</h2>
            <div className="mt-3">
              <HistoryTabs steps={buildPOTimeline(po)} changes={po.history} />
            </div>
          </section>
        </form>

        {/* One place to act: the total, what will print blank, and save or print. */}
        <aside aria-label="Order summary" className="rounded-[14px] border border-[#e6e6e3] bg-white @min-[900px]:sticky @min-[900px]:top-4">
          <div className="px-5 pb-4 pt-5">
            <div className="text-[12.5px] text-[#5b606b]">Order total</div>
            <div className="text-[28px] font-semibold tabular-nums tracking-[-0.02em] text-neutral-900">{peso(total)}</div>
            <div className="mt-0.5 text-[12.5px] text-[#5b606b]">
              {items.length} {items.length === 1 ? "item" : "items"}
              {po.poDate && <> · dated {formatDate(po.poDate)}</>}
            </div>
          </div>
          <ul className="space-y-2 border-t border-[#f0f0ee] px-5 py-4 text-[13px]">
            <li className="flex items-start gap-2">
              <CheckCircle2 aria-hidden="true" className="mt-px h-4 w-4 shrink-0 text-[#1f7a45]" />
              <span>
                {po.authorization === "pr-approval" ? "Authorized with the purchase request" : `Status: ${po.status}`}
              </span>
            </li>
            <li className="flex items-start gap-2">
              {blankCount === 0 ? (
                <CheckCircle2 aria-hidden="true" className="mt-px h-4 w-4 shrink-0 text-[#1f7a45]" />
              ) : (
                <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#a3a7ae] mx-[5px]" />
              )}
              <span className="text-[#4a4f59]">
                {blankCount === 0
                  ? "All document details entered"
                  : `${blankCount} ${blankCount === 1 ? "detail" : "details"} blank — ${blankCount === 1 ? "prints as a line" : "print as lines"} to fill in by hand`}
              </span>
            </li>
            <li className="text-[12.5px] text-[#5b606b]">
              Signatories:{" "}
              {po.signatories?.approvedBy?.name ?? (po.signatories ? "not set when authorized — prints a blank line" : "from Settings")}
            </li>
          </ul>

          <div className="space-y-2 border-t border-[#f0f0ee] px-5 py-4">
            {editable && (
              <Button className="h-11 w-full" onClick={() => void save()} loading={saving} disabled={!dirty}>
                <Save />
                Save changes
              </Button>
            )}
            <Button variant="secondary" className="h-11 w-full" onClick={print} disabled={dirty}>
              <Printer />
              Print PO
            </Button>
            {dirty && <p className="text-[12px] text-[#5b606b]">Save or undo your changes to print the order.</p>}
            {dirty && (
              <Button variant="ghost" className="h-10 w-full" onClick={() => reset(toForm(po))}>
                Undo changes
              </Button>
            )}
            <a
              href="#history"
              className="block rounded-md py-1 text-center text-[13px] font-medium text-[#a6323b] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a6323b]"
            >
              View history
            </a>
          </div>
        </aside>
      </div>
    </PageTransition>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-[#f0f0ee] pt-5 first:border-t-0 first:pt-0">
      <h2 className="text-[15px] font-semibold text-neutral-900">{title}</h2>
      {description && <p className="mt-0.5 text-[12.5px] text-[#5b606b]">{description}</p>}
      <div className="mt-3.5">{children}</div>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] text-[#6b707a]">{label}</dt>
      <dd className="mt-0.5 text-[13.5px] text-neutral-900">{children}</dd>
    </div>
  );
}

/**
 * Orders from the earlier workflow keep their steps: a draft is submitted,
 * an order pending approval is approved or returned, a released one is
 * issued, acknowledged and completed. An order authorized with its request
 * shows none of these.
 */
function LegacyActions({
  po,
  admin,
  userName,
  onUpdated,
}: {
  po: PurchaseOrder;
  admin: boolean;
  userName: string;
  onUpdated: (po: PurchaseOrder) => void;
}) {
  const [confirm, setConfirm] = React.useState<null | {
    title: string;
    description: string;
    label: string;
    run: () => Promise<PurchaseOrder>;
  }>(null);
  const [acting, setActing] = React.useState(false);
  if (!admin || po.authorization === "pr-approval" || po.status === "Cancelled") return null;
  const by = { by: userName, office: "General Services Office" };

  const actions: { label: string; icon: React.ComponentType; primary?: boolean; confirm: NonNullable<typeof confirm> }[] = [];
  if (po.status === "Draft") {
    actions.push({
      label: "Submit for approval",
      icon: Send,
      primary: true,
      confirm: { title: `Submit ${po.poNumber}?`, description: "It goes to an Administrator for approval.", label: "Submit", run: () => setPurchaseOrderStatus(po.id, "Pending Approval", by) },
    });
  }
  if (po.status === "Pending Approval") {
    actions.push({
      label: "Return to draft",
      icon: Undo2,
      confirm: { title: `Return ${po.poNumber} to draft?`, description: "It can be corrected and submitted again.", label: "Return to draft", run: () => setPurchaseOrderStatus(po.id, "Draft", { ...by, remarks: "Returned for correction" }) },
    });
    actions.push({
      label: "Approve",
      icon: CheckCircle2,
      primary: true,
      confirm: { title: `Approve ${po.poNumber}?`, description: "It is dated today and the signatories in Settings are fixed on it. Approval does not record delivery, inspection or payment.", label: "Approve", run: () => setPurchaseOrderStatus(po.id, "Approved", by) },
    });
  }
  if (po.status === "Approved" && !po.issuedAt) {
    actions.push({
      label: "Return to draft",
      icon: Undo2,
      confirm: { title: `Return ${po.poNumber} to draft?`, description: "It keeps its number, date and signatories and must be approved again.", label: "Return to draft", run: () => setPurchaseOrderStatus(po.id, "Draft", { ...by, remarks: "Returned for correction" }) },
    });
  }
  if (canIssuePO(po)) {
    actions.push({
      label: "Issue PO",
      icon: Send,
      confirm: { title: `Issue ${po.poNumber}?`, description: "Recorded as issued to the supplier (earlier workflow).", label: "Issue PO", run: () => issuePurchaseOrder(po.id, { by: userName }) },
    });
  }
  if (canAcknowledgePO(po)) {
    actions.push({
      label: "Acknowledge PO",
      icon: BadgeCheck,
      confirm: { title: "Record the supplier's acknowledgement?", description: "Recorded on the order (earlier workflow).", label: "Acknowledge PO", run: () => acknowledgePurchaseOrder(po.id) },
    });
  }
  if (po.status === "Released") {
    actions.push({
      label: "Mark Completed",
      icon: CheckCircle2,
      confirm: { title: `Mark ${po.poNumber} completed?`, description: "Released under the earlier workflow; recorded in its timeline.", label: "Mark Completed", run: () => setPurchaseOrderStatus(po.id, "Completed", by) },
    });
  }
  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((a) => {
        const Icon = a.icon;
        return (
          <Button key={a.label} variant={a.primary ? "primary" : "secondary"} onClick={() => setConfirm(a.confirm)}>
            <Icon />
            {a.label}
          </Button>
        );
      })}
      {confirm && (
        <ConfirmationModal
          open
          onOpenChange={(open) => !open && setConfirm(null)}
          title={confirm.title}
          description={confirm.description}
          confirmLabel={confirm.label}
          loading={acting}
          onConfirm={async () => {
            setActing(true);
            try {
              onUpdated(await confirm.run());
              toast.success(`${po.poNumber} updated`);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Unable to update the order");
            }
            setActing(false);
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
}
