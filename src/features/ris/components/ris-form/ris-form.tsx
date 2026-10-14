import * as React from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Check, Plus, Trash2 } from "lucide-react";

import { Combobox, Input, SelectField, Spinner, Textarea } from "@/components";
import { useConfigOptions } from "@/features/config/use-module-config";
import { listInventoryItems } from "@/features/inventory/api";
import type { InventoryItem } from "@/features/inventory/types";
import type { RISDraftInput } from "@/features/ris/api";
import type { RequestForIssuance } from "@/features/ris/types";
import { listPurchaseRequests } from "@/features/purchase-requests/api";
import { listPurchaseOrders } from "@/features/purchase-orders/api";
import { canRaisePO } from "@/features/purchase-requests/lib";
import type { PurchaseRequest } from "@/features/purchase-requests/types";
import { risFormSchema, type RISFormValues } from "@/features/ris/components/ris-form/schema";
import { reportLoadFailure } from "@/features/shared/load-guard";
import { OfficeField } from "@/features/shared/office-field";
import { StockNameInput } from "@/features/ris/components/ris-form/stock-name-input";
import { LeaveGuard } from "@/features/shared/leave-guard";
import { cn } from "@/lib/utils";

/**
 * The Requisition and Issue Slip form: one page, approved 15 Oct 2026 (canvas
 * "Portal Home Redesign", RIS form). It replaced a four-step wizard, and
 * attachments were dropped as on the PR form. The portal and the admin's
 * create and edit pages share it.
 *
 * The portal asks only for what the requester knows: who, why, and the items
 * with quantity and unit. Anonymous visitors cannot read the stock register
 * (migration 034), so items are typed by hand and GSO matches them to stock.
 * The admin adds the source purchase request and, per item, what is available
 * and how much to issue.
 */

const emptyItem = {
  name: "",
  inventoryItemId: undefined,
  unit: "pc",
  requestedQty: 1,
  issuedQty: 1,
};

const MONO = "font-['Geist_Mono',ui-monospace,monospace]";

/** The approved field look, layered over the shared Input's classes. */
const FIELD = "h-11 rounded-[10px] border-[#d4d5d2] px-3.5 text-[15px] text-neutral-900";
const CELL = "h-10 rounded-lg border-[#d4d5d2] px-3 text-[14px] text-neutral-900";

export interface RISFormProps {
  /** Existing slip when editing; omit for create. */
  initial?: RequestForIssuance;
  /**
   * `admin` adds the source purchase request, stock on hand and the issue
   * quantity. `portal` is the requester's view and reads no stock.
   */
  variant: "portal" | "admin";
  /** PR to issue against, handed over from a released purchase order. */
  initialPrNumber?: string;
  /** The order that supplied the stock, recorded on the slip. */
  initialPoNumber?: string;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (input: RISDraftInput) => void | Promise<void>;
  onCancel: () => void;
}

type FormApi = ReturnType<typeof useForm<RISFormValues>>;

export function RISForm({
  initial,
  variant,
  initialPrNumber,
  initialPoNumber,
  submitLabel,
  submitting,
  onSubmit,
  onCancel,
}: RISFormProps) {
  const admin = variant === "admin";
  const [approvedPRs, setApprovedPRs] = React.useState<PurchaseRequest[]>([]);
  const [inventory, setInventory] = React.useState<InventoryItem[]>([]);

  React.useEffect(() => {
    if (!admin) return;
    void listPurchaseRequests()
      .then((rows) => setApprovedPRs(rows.filter((p) => canRaisePO(p.status))))
      .catch((e) => reportLoadFailure(e, "approved purchase requests"));
    void listInventoryItems()
      .then(setInventory)
      .catch((e) => reportLoadFailure(e, "the inventory"));
  }, [admin]);

  const form = useForm<RISFormValues>({
    resolver: zodResolver(risFormSchema),
    mode: "onTouched",
    defaultValues: initial
      ? {
          prNumber: initial.prNumber ?? "",
          poNumber: initial.poNumber,
          departmentCode: initial.departmentCode,
          requester: initial.requester,
          fund: initial.fund ?? "",
          division: initial.division ?? "",
          fppCode: initial.fppCode ?? "",
          purpose: initial.purpose,
          items: initial.items.map(({ name, inventoryItemId, unit, requestedQty, issuedQty }) => ({
            name,
            inventoryItemId,
            unit: unit || "pc",
            requestedQty,
            issuedQty,
          })),
        }
      : {
          prNumber: "",
          poNumber: undefined,
          departmentCode: "",
          requester: "",
          fund: "",
          division: "",
          fppCode: "",
          purpose: "",
          items: [{ ...emptyItem }],
        },
  });

  /** Fill office, requester, purpose and stock-matched items from the PR. */
  const applyPR = async (pr: PurchaseRequest) => {
    form.setValue("prNumber", pr.prNumber, { shouldValidate: true });
    form.setValue("departmentCode", pr.departmentCode, { shouldValidate: true });
    form.setValue("requester", pr.requester, { shouldValidate: true });
    form.setValue("purpose", pr.purpose, { shouldValidate: true });

    const usable = pr.items.flatMap((it) => {
      const d = it.description.toLowerCase();
      const match = inventory.find((inv) => {
        const n = inv.name.toLowerCase();
        return n === d || n.includes(d) || d.includes(n);
      });
      return match
        ? [
            {
              name: match.name,
              inventoryItemId: match.id,
              unit: match.unit,
              requestedQty: it.quantity,
              issuedQty: Math.min(it.quantity, match.onHand),
            },
          ]
        : [];
    });
    form.setValue("items", usable.length > 0 ? usable : [{ ...emptyItem }]);

    // Attach the related PO when one exists for this PR.
    const pos = await listPurchaseOrders({ search: pr.prNumber });
    form.setValue("poNumber", pos[0]?.poNumber);
  };

  // Seeding waits for both source lists: applyPR maps the request's lines onto
  // stock items, so an empty inventory would map nothing. It runs once, or a
  // re-run would discard the quantities the storekeeper adjusted.
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (initial || seeded.current || !initialPrNumber) return;
    if (approvedPRs.length === 0 || inventory.length === 0) return;
    const pr = approvedPRs.find((p) => p.prNumber === initialPrNumber);
    if (!pr) return;
    seeded.current = true;
    void applyPR(pr).then(() => {
      if (initialPoNumber) form.setValue("poNumber", initialPoNumber);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, initialPrNumber, initialPoNumber, approvedPRs, inventory]);

  /** Admin gate on top of the schema: an issue quantity, within stock. */
  const checkIssue = (values: RISFormValues) => {
    let valid = true;
    values.items.forEach((row, i) => {
      const issued = row.issuedQty;
      if (issued === undefined || !(issued > 0)) {
        form.setError(`items.${i}.issuedQty`, { message: "Enter the quantity to issue" });
        valid = false;
        return;
      }
      const inv = inventory.find((s) => s.id === row.inventoryItemId);
      if (inv && issued > inv.onHand) {
        form.setError(`items.${i}.issuedQty`, {
          message: `Only ${inv.onHand} ${inv.unit} available`,
        });
        valid = false;
      }
    });
    return valid;
  };

  const submit = form.handleSubmit(async (values) => {
    if (admin && !checkIssue(values)) return;
    await onSubmit({
      prNumber: values.prNumber || undefined,
      poNumber: values.poNumber,
      departmentCode: values.departmentCode,
      requester: values.requester,
      fund: values.fund,
      division: values.division,
      fppCode: values.fppCode,
      purpose: values.purpose,
      receivedBy: values.requester,
      items: values.items.map((row) => {
        const inv = inventory.find((s) => s.id === row.inventoryItemId);
        return {
          inventoryItemId: inv?.id,
          stockNo: inv?.itemCode,
          name: row.name.trim(),
          unit: inv?.unit ?? row.unit,
          requestedQty: row.requestedQty,
          // The requester does not decide the issue; GSO starts from what was
          // asked and adjusts it when approving.
          issuedQty: admin ? (row.issuedQty ?? row.requestedQty) : row.requestedQty,
        };
      }),
      // Attachments were removed from the form. On an edit an empty list keeps
      // whatever the slip already has (see updateRequest).
      attachments: [],
    });
  });

  const err = form.formState.errors;
  const prNumber = useWatch({ control: form.control, name: "prNumber" });

  return (
    <form
      onSubmit={submit}
      noValidate
      className="grid w-full items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8"
    >
      <div className="flex min-w-0 flex-col gap-5">
        {admin && (
          <Section title="Source">
            <SourcePR form={form} approvedPRs={approvedPRs} onSelectPR={applyPR} />
          </Section>
        )}

        <Section title="Who is asking">
          <div className="grid gap-4 sm:grid-cols-2">
            <LabelledField id="ris-office" label="Requesting office" error={err.departmentCode?.message}>
              <Controller
                control={form.control}
                name="departmentCode"
                render={({ field }) => (
                  <OfficeField
                    // A source PR replaces the office, so the field remounts
                    // and re-reads whether it is a listed one.
                    key={prNumber || "none"}
                    id="ris-office"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={!!err.departmentCode}
                    describedBy={err.departmentCode ? "ris-office-error" : undefined}
                  />
                )}
              />
            </LabelledField>
            <LabelledField id="ris-requester" label="Requested by" error={err.requester?.message}>
              <Input
                id="ris-requester"
                placeholder="e.g. Nurse Joel Aquino"
                autoComplete="name"
                invalid={!!err.requester}
                aria-describedby={err.requester ? "ris-requester-error" : undefined}
                className={FIELD}
                {...form.register("requester")}
              />
            </LabelledField>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <LabelledField id="ris-fund" label="Fund" optional>
              <Input
                id="ris-fund"
                placeholder="e.g. General Fund"
                className={FIELD}
                {...form.register("fund")}
              />
            </LabelledField>
            <LabelledField id="ris-division" label="Division" optional>
              <Input
                id="ris-division"
                placeholder="e.g. Rural Health Unit"
                className={FIELD}
                {...form.register("division")}
              />
            </LabelledField>
            <LabelledField id="ris-fpp" label="FPP Code" optional>
              <Input
                id="ris-fpp"
                placeholder="e.g. 4410"
                className={FIELD}
                {...form.register("fppCode")}
              />
            </LabelledField>
          </div>
        </Section>

        <Section title="What it is for">
          <LabelledField
            id="ris-purpose"
            label="Purpose"
            error={err.purpose?.message}
            helper="Say what the supplies are for and where they will be used."
          >
            <Textarea
              id="ris-purpose"
              rows={3}
              placeholder="e.g. Ward supplies for the July immunisation drive"
              invalid={!!err.purpose}
              aria-describedby={err.purpose ? "ris-purpose-error" : "ris-purpose-helper"}
              className="rounded-[10px] border-[#d4d5d2] px-3.5 py-3 text-[15px] text-neutral-900"
              {...form.register("purpose")}
            />
          </LabelledField>
        </Section>

        <ItemsSection form={form} admin={admin} inventory={inventory} />
      </div>

      <SummaryPanel
        form={form}
        admin={admin}
        submitLabel={submitLabel}
        submitting={submitting}
        onCancel={onCancel}
      />
      <LeaveGuard active={form.formState.isDirty && !submitting} />
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = React.useId();
  return (
    <section
      aria-labelledby={id}
      className="rounded-[14px] border border-[#e4e4e1] bg-white p-5 sm:p-6"
    >
      <h2 id={id} className="mb-4 text-[15px] font-semibold text-neutral-900">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Label, control, then the error or the helper, at the approved sizes. */
function LabelledField({
  id,
  label,
  optional,
  error,
  helper,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  error?: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 flex items-baseline justify-between gap-2 text-[14px] font-medium text-neutral-900"
      >
        <span>
          {label}
          {!optional && <span className="sr-only"> (required)</span>}
        </span>
        {optional && <span className="text-[13px] font-normal text-[#5b606b]">Optional</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-[13px] text-red-700">
          {error}
        </p>
      ) : helper ? (
        <p id={`${id}-helper`} className="mt-1.5 text-[13px] text-[#5b606b]">
          {helper}
        </p>
      ) : null}
    </div>
  );
}

function SourcePR({
  form,
  approvedPRs,
  onSelectPR,
}: {
  form: FormApi;
  approvedPRs: PurchaseRequest[];
  onSelectPR: (pr: PurchaseRequest) => void;
}) {
  const prNumber = useWatch({ control: form.control, name: "prNumber" });
  const poNumber = useWatch({ control: form.control, name: "poNumber" });
  return (
    <LabelledField
      id="ris-source-pr"
      label="Source Purchase Request"
      optional
      helper={
        poNumber
          ? `Related Purchase Order: ${poNumber}`
          : "Link the approved purchase request this is issued against. It fills in the rest."
      }
    >
      <Combobox
        id="ris-source-pr"
        placeholder="Select an approved PR…"
        searchPlaceholder="Search PR number or purpose…"
        options={approvedPRs.map((pr) => ({
          value: pr.prNumber,
          label: `${pr.prNumber} — ${pr.purpose}`,
        }))}
        value={prNumber || undefined}
        onChange={(v) => {
          const pr = approvedPRs.find((p) => p.prNumber === v);
          if (pr) void onSelectPR(pr);
        }}
        className="h-11 rounded-[10px] border-[#d4d5d2] px-3.5 text-[15px]"
      />
    </LabelledField>
  );
}

function ItemsSection({
  form,
  admin,
  inventory,
}: {
  form: FormApi;
  admin: boolean;
  inventory: InventoryItem[];
}) {
  const { register, control, setValue, formState } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const items = useWatch({ control, name: "items" });
  // Units as the office set them in Settings → Procurement, plus any already
  // on the slip, so an edit or a stock unit is never missing from the list.
  const { options: itemUnits } = useConfigOptions(
    "Procurement",
    "item_units",
    (items ?? []).map((it) => it?.unit ?? "").filter(Boolean),
  );
  const itemsError = formState.errors.items;
  // The name takes every spare pixel; the rest are sized to their values.
  const cols = admin
    ? "sm:grid-cols-[minmax(0,1fr)_96px_80px_80px_100px_40px]"
    : "sm:grid-cols-[minmax(0,1fr)_96px_112px_40px]";
  const span = admin ? "sm:col-span-6" : "sm:col-span-4";

  return (
    <section
      aria-labelledby="ris-items-title"
      className="rounded-[14px] border border-[#e4e4e1] bg-white p-5 sm:p-6"
    >
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 id="ris-items-title" className="text-[15px] font-semibold text-neutral-900">
          Items
        </h2>
        <span className="text-[13px] text-[#5b606b]">
          {fields.length === 1 ? "1 item" : `${fields.length} items`}
        </span>
      </div>

      <div className={cn("hidden gap-2 pb-2 text-[12px] font-medium text-[#5b606b] sm:grid", cols)}>
        <span>Item</span>
        {admin ? (
          <>
            <span>Available</span>
            <span>Requested</span>
            <span>Issue qty</span>
          </>
        ) : (
          <span>Qty</span>
        )}
        <span>Unit</span>
        <span />
      </div>

      <ul className="list-none space-y-2 sm:space-y-0">
        {fields.map((row, i) => {
          const rowErr = itemsError?.[i];
          const inv = inventory.find((s) => s.id === items?.[i]?.inventoryItemId);
          const issued = Number(items?.[i]?.issuedQty) || 0;
          const short = !!inv && issued > inv.onHand;
          const message =
            rowErr?.name?.message ??
            rowErr?.requestedQty?.message ??
            rowErr?.issuedQty?.message ??
            rowErr?.unit?.message ??
            (short ? `Only ${inv.onHand} ${inv.unit} available` : undefined);
          return (
            // On a phone each item is its own bordered block; from sm it is a table row.
            <li
              key={row.id}
              className={cn(
                "grid grid-cols-2 items-start gap-2 rounded-[10px] border border-[#e4e4e1] p-3 sm:items-center sm:rounded-none sm:border-0 sm:border-t sm:border-[#f0f0ee] sm:px-0 sm:py-1.5",
                cols,
              )}
            >
              <div className="col-span-2 sm:col-span-1">
                {admin ? (
                  <Controller
                    control={control}
                    name={`items.${i}.name`}
                    render={({ field }) => (
                      <Combobox
                        allowCustomValue
                        placeholder="Type or pick the item…"
                        searchPlaceholder="Search stock…"
                        emptyText="Not in stock — type to request it anyway."
                        options={inventory.map((s) => ({
                          value: s.name,
                          label: s.name,
                          description: `${s.onHand} ${s.unit} on hand`,
                        }))}
                        value={field.value || undefined}
                        onChange={(v) => {
                          field.onChange(v);
                          // Matching stock links the line, which drives
                          // availability and the deduction on release.
                          const match = inventory.find(
                            (s) => s.name.toLowerCase() === v.trim().toLowerCase(),
                          );
                          setValue(`items.${i}.inventoryItemId`, match?.id);
                          if (match) setValue(`items.${i}.unit`, match.unit);
                        }}
                        invalid={!!rowErr?.name}
                        className="h-10 rounded-lg border-[#d4d5d2] text-[14px]"
                      />
                    )}
                  />
                ) : (
                  <Controller
                    control={control}
                    name={`items.${i}.name`}
                    render={({ field }) => (
                      <StockNameInput
                        id={`ris-item-${row.id}`}
                        label={`Item ${i + 1} name`}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        onPick={(s) => {
                          setValue(`items.${i}.name`, s.name, { shouldValidate: true });
                          setValue(`items.${i}.unit`, s.unit);
                        }}
                        invalid={!!rowErr?.name}
                        className={CELL}
                      />
                    )}
                  />
                )}
              </div>
              {admin && (
                <span className={cn("self-center text-[14px] text-[#5b606b]", MONO)}>
                  <span className="sr-only">Available: </span>
                  {inv ? `${inv.onHand} ${inv.unit}` : "—"}
                </span>
              )}
              <Input
                type="number"
                min={1}
                inputMode="numeric"
                aria-label={`Item ${i + 1} quantity${admin ? " requested" : ""}`}
                placeholder="Qty"
                invalid={!!rowErr?.requestedQty}
                className={cn(CELL, MONO, "placeholder:font-['Geist',ui-sans-serif,system-ui,sans-serif]")}
                {...register(`items.${i}.requestedQty`, { valueAsNumber: true })}
              />
              {admin && (
                <Input
                  type="number"
                  min={1}
                  max={inv?.onHand}
                  inputMode="numeric"
                  aria-label={`Item ${i + 1} quantity to issue`}
                  placeholder="Issue"
                  invalid={!!rowErr?.issuedQty || short}
                  className={cn(CELL, MONO, "placeholder:font-['Geist',ui-sans-serif,system-ui,sans-serif]")}
                  {...register(`items.${i}.issuedQty`, { valueAsNumber: true })}
                />
              )}
              <Controller
                control={control}
                name={`items.${i}.unit`}
                render={({ field }) => (
                  <SelectField
                    aria-label={`Item ${i + 1} unit`}
                    options={itemUnits.map((u) => ({ value: u, label: u }))}
                    value={field.value}
                    onChange={field.onChange}
                    invalid={!!rowErr?.unit}
                    disabled={!!inv}
                    size="lg"
                    className="h-10 rounded-lg border-[#d4d5d2] px-3 text-[14px] text-neutral-900 focus-visible:border-neutral-900 focus-visible:ring-4 focus-visible:ring-neutral-900/10"
                  />
                )}
              />
              <button
                type="button"
                aria-label={`Remove item ${i + 1}`}
                onClick={() => remove(i)}
                disabled={fields.length === 1}
                className="grid h-10 w-10 place-items-center justify-self-end rounded-lg text-[#5b606b] transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 disabled:pointer-events-none disabled:opacity-40"
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </button>
              {message && (
                <p role="alert" className={cn("col-span-2 text-[13px] text-red-700", span)}>
                  Item {i + 1}: {message}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {typeof itemsError?.message === "string" && (
        <p role="alert" className="mt-2 text-[13px] text-red-700">
          {itemsError.message}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#ececea] pt-4">
        <button
          type="button"
          onClick={() => append({ ...emptyItem })}
          className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-dashed border-[#c9cac6] bg-white px-3.5 text-[14px] font-medium text-neutral-900 transition-colors hover:border-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          Add item
        </button>
        <span className="text-[13px] text-[#5b606b]">
          {admin
            ? "Pick from stock to see what is available."
            : "Start typing to see items GSO keeps in stock."}
        </span>
      </div>
    </section>
  );
}

function SummaryPanel({
  form,
  admin,
  submitLabel,
  submitting,
  onCancel,
}: {
  form: FormApi;
  admin: boolean;
  submitLabel: string;
  submitting: boolean;
  onCancel: () => void;
}) {
  const values = useWatch({ control: form.control });
  const items = values.items ?? [];
  const named = items.filter((it) => (it?.name ?? "").trim().length > 0);
  const complete = items.filter(
    (it) => (it?.name ?? "").trim().length >= 2 && Number(it?.requestedQty) > 0,
  ).length;

  // The same thresholds the schema enforces, so a tick means it will pass.
  const checks = [
    { label: "Requesting office", done: (values.departmentCode ?? "").trim().length >= 2 },
    { label: "Requested by", done: (values.requester ?? "").trim().length >= 3 },
    { label: "Purpose", done: (values.purpose ?? "").trim().length >= 3 },
    {
      label: items.length === 1 ? "1 item with quantity" : `${items.length} items with quantity`,
      done: items.length > 0 && complete === items.length,
    },
  ];

  return (
    <aside
      aria-label="Summary"
      className="rounded-[14px] border border-[#e4e4e1] bg-white p-5 shadow-[0_1px_2px_rgba(22,24,29,0.04),0_16px_40px_-24px_rgba(22,24,29,0.18)] sm:p-6 lg:sticky lg:top-6"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-neutral-900">Summary</h2>
        {/* How far along, at a glance; the list below says what is left. */}
        <span className={cn("text-[13px] text-[#5b606b]", MONO)}>
          {checks.filter((c) => c.done).length} of {checks.length}
        </span>
      </div>
      <p className="mt-4 text-[13px] text-[#5b606b]">Items requested</p>
      <p className={cn("mt-1 text-[28px] font-semibold leading-tight tracking-[-0.01em]", MONO)}>
        {items.length}
      </p>

      {named.length > 0 ? (
        <ul className="mt-3 list-none space-y-1.5">
          {named.map((it, i) => (
            <li key={i} className="flex justify-between gap-3 text-[14px] text-neutral-900">
              <span className="min-w-0 truncate">{it?.name}</span>
              <span className={cn("shrink-0 text-[13px] text-[#5b606b]", MONO)}>
                {Number(it?.requestedQty) > 0 ? it?.requestedQty : "—"} {it?.unit}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[14px] text-[#5b606b]">No items yet. Add what you need on the left.</p>
      )}

      <ul className="mt-5 list-none space-y-2.5 border-t border-[#ececea] pt-5">
        {checks.map((c) => (
          <li key={c.label} className="flex items-center gap-2.5 text-[14px]">
            {c.done ? (
              <span className="tick-in grid h-5 w-5 shrink-0 place-items-center rounded-full bg-neutral-900 text-white">
                <Check aria-hidden="true" className="h-3 w-3" strokeWidth={3} />
              </span>
            ) : (
              <span
                aria-hidden="true"
                className="h-5 w-5 shrink-0 rounded-full border-[1.5px] border-[#c9cac6]"
              />
            )}
            <span className={c.done ? "text-neutral-900" : "text-[#5b606b]"}>
              {c.label}
              <span className="sr-only">{c.done ? ", done" : ", still needed"}</span>
            </span>
          </li>
        ))}
      </ul>

      <button
        type="submit"
        disabled={submitting}
        className="group mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-neutral-900 text-[15px] font-medium text-white transition-[background-color,transform] duration-150 hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-70"
      >
        {submitLabel}
        {submitting ? (
          <Spinner size="sm" label="Submitting" />
        ) : (
          <ArrowRight
            aria-hidden="true"
            className="h-4 w-4 transition-transform duration-150 ease-out group-hover:translate-x-[3px]"
          />
        )}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={submitting}
        className="mt-2 h-11 w-full rounded-[10px] text-[14px] text-[#5b606b] transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
      >
        Cancel
      </button>
      <p className="mt-3 text-[13px] leading-relaxed text-[#5b606b]">
        {admin
          ? "Stock is deducted only when the slip is released."
          : "You get a reference number right away. Stock is released only after GSO approves the slip."}
      </p>
    </aside>
  );
}
