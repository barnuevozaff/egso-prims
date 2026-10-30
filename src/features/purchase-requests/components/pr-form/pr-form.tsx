import * as React from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { ArrowRight, Plus, Trash2 } from "lucide-react";

import { Input, SelectField, Spinner, Textarea } from "@/components";
import { useConfigOptions, useConfigText } from "@/features/config/use-module-config";
import type { PRDraftInput } from "@/features/purchase-requests/api";
import {
  capitalizeFirstLetter,
  departmentByCode,
  FUNDING_SOURCES,
  type PurchaseRequest,
} from "@/features/purchase-requests/types";
import { prEditSchema, prFormSchema, type PRFormValues } from "@/features/purchase-requests/components/pr-form/schema";
import { OfficeField } from "@/features/shared/office-field";
import { LeaveGuard } from "@/features/shared/leave-guard";
import { cn } from "@/lib/utils";

/**
 * The Purchase Request form: one page, approved 15 Oct 2026 (canvas "Portal
 * Home Redesign", PR form). It replaced a four-step wizard, and attachments
 * were dropped at the owner's request. The portal and the admin's create and
 * edit pages share it.
 *
 * The right column is the summary: the running total, a checklist of what is
 * still missing, and the one submit button. There is no preview of the
 * printed form; the admin prints the official format from the saved request.
 */

// The cost starts blank, not 0, so the filer types a price instead of first
// deleting a zero. Blank fails the schema ("Required") as 0 did.
const emptyItem = {
  description: "",
  quantity: 1,
  unit: "pc",
  estimatedCost: undefined as unknown as number,
};

const peso = (n: number) =>
  `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MONO = "font-['Geist_Mono',ui-monospace,monospace]";

/** The approved field look, layered over the shared Input's classes. */
const FIELD = "h-11 rounded-[10px] border-[#d4d5d2] px-3.5 text-[15px] text-neutral-900";
const CELL = "h-10 rounded-lg border-[#d4d5d2] px-3 text-[14px] text-neutral-900";

export interface PRFormProps {
  /** Existing request when editing; omit for create. */
  initial?: PurchaseRequest;
  /**
   * Who fills it in. The public portal asks only for what the requester
   * knows (approved 21 Oct 2026); staff also see the purpose, which the GSO
   * completes before approval, and always see the fund.
   */
  audience?: "public" | "staff";
  submitLabel: string;
  submitting: boolean;
  onSubmit: (input: PRDraftInput) => void | Promise<void>;
  onCancel: () => void;
  /** Told when the form gains or loses unsaved changes: the record's page holds its actions until they are saved (30 Oct 2026). */
  onDirtyChange?: (dirty: boolean) => void;
}

type FormApi = ReturnType<typeof useForm<PRFormValues>>;

const NO_FUND = "__none__";

const isFund = (v: string): v is PRDraftInput["fundingSource"] & string =>
  (FUNDING_SOURCES as readonly string[]).includes(v);

export function PRForm({ initial, audience = "staff", submitLabel, submitting, onSubmit, onCancel, onDirtyChange }: PRFormProps) {
  const isPublic = audience === "public";
  // The fund chosen in Settings → Procurement. Only a value an Administrator
  // has set counts: there is no built-in fallback any more (21 Oct 2026).
  const configuredFund = useConfigText("Procurement", "default_funding_source");
  const defaultFund = isFund(configuredFund) ? configuredFund : undefined;
  // A new public request takes the configured fund without asking; with none
  // configured, the requester may choose one, or leave it to the GSO.
  const askFund = !isPublic || !!initial || !defaultFund;

  const form = useForm<PRFormValues>({
    resolver: zodResolver(initial ? prEditSchema : prFormSchema),
    mode: "onTouched",
    defaultValues: initial
      ? {
          departmentCode: initial.departmentCode,
          requester: initial.requester,
          purpose: initial.purpose ?? "",
          requestDate: new Date(initial.requestDate),
          fundingSource: initial.fundingSource ?? "",
          section: initial.section ?? "",
          fpp: initial.fpp ?? "",
          items: initial.items.map(({ description, quantity, unit, estimatedCost }) => ({
            description,
            quantity,
            unit,
            estimatedCost,
          })),
        }
      : {
          departmentCode: "",
          requester: "",
          purpose: "",
          requestDate: new Date(),
          fundingSource: "",
          section: "",
          fpp: "",
          items: [{ ...emptyItem }],
        },
  });

  const submit = form.handleSubmit(async (values) => {
    const chosenFund = values.fundingSource || undefined;
    await onSubmit({
      departmentCode: values.departmentCode,
      requester: values.requester.trim(),
      purpose: values.purpose.trim(),
      // Settings applies on submit, once configuration has loaded; a default
      // in the form would be captured before it arrives. Only a new public
      // request takes the configured fund; staff choose one or leave it
      // blank, and nothing is filled in for them (22 Oct 2026).
      fundingSource: initial || !isPublic ? chosenFund : (chosenFund ?? defaultFund),
      section: values.section.trim() || undefined,
      fpp: values.fpp.trim() || undefined,
      requestDate: format(values.requestDate, "yyyy-MM-dd"),
      items: values.items.map((it) => ({ ...it, description: capitalizeFirstLetter(it.description.trim()) })),
      // Attachments were removed from the form. On an edit an empty list keeps
      // whatever the request already has (see updatePurchaseRequest).
      attachments: [],
    });
  });

  const err = form.formState.errors;
  const dirty = form.formState.isDirty;
  React.useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  return (
    <form
      onSubmit={submit}
      noValidate
      className="grid w-full items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8"
    >
      <div className="flex min-w-0 flex-col gap-5">
        <Section title="Request details">
          <div className="grid gap-4 sm:grid-cols-2">
            <LabelledField id="pr-office" label="Requesting office" error={err.departmentCode?.message}>
              <Controller
                control={form.control}
                name="departmentCode"
                render={({ field }) => (
                  <OfficeField
                    id="pr-office"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    invalid={!!err.departmentCode}
                    describedBy={err.departmentCode ? "pr-office-error" : undefined}
                  />
                )}
              />
            </LabelledField>
            <LabelledField id="pr-requester" label="Requested by" error={err.requester?.message}>
              <Input
                id="pr-requester"
                placeholder="e.g. Juan Dela Cruz"
                autoComplete="name"
                invalid={!!err.requester}
                aria-describedby={err.requester ? "pr-requester-error" : undefined}
                className={FIELD}
                {...form.register("requester")}
              />
            </LabelledField>
          </div>

          {/* The optional lines of the official form, in its order. */}
          <div className={cn("mt-4 grid gap-4 border-t border-[#f0f0ee] pt-4", askFund ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
            {askFund && (
              <LabelledField id="pr-fund" label="Fund" optional error={err.fundingSource?.message}>
                <Controller
                  control={form.control}
                  name="fundingSource"
                  render={({ field }) => (
                    <SelectField
                      id="pr-fund"
                      aria-label="Fund"
                      placeholder="Not specified"
                      // Radix Select cannot hold "" as an option, so "Not
                      // specified" travels as a sentinel and is stored blank.
                      options={[
                        { value: NO_FUND, label: "Not specified" },
                        ...FUNDING_SOURCES.map((s) => ({ value: s, label: s })),
                      ]}
                      value={field.value || NO_FUND}
                      onChange={(v) => field.onChange(v === NO_FUND ? "" : v)}
                      size="lg"
                      className="h-11 rounded-[10px] border-[#d4d5d2] px-3.5 text-[15px] text-neutral-900"
                    />
                  )}
                />
              </LabelledField>
            )}
            <LabelledField id="pr-section" label="Section" optional error={err.section?.message}>
              <Input id="pr-section" autoComplete="off" className={FIELD} {...form.register("section")} />
            </LabelledField>
            <LabelledField id="pr-fpp" label="FPP" optional error={err.fpp?.message}>
              <Input id="pr-fpp" autoComplete="off" className={FIELD} {...form.register("fpp")} />
            </LabelledField>
          </div>

          {/* Required on a new request (restored 21 Oct 2026); on an edit it
              may still be blank, and the request is not approved without it. */}
          <div className="mt-4 border-t border-[#f0f0ee] pt-4">
            <LabelledField
              id="pr-purpose"
              label="Purpose"
              optional={!!initial}
              error={err.purpose?.message}
              helper={
                initial
                  ? "Printed on the official request. Required before the request can be approved."
                  : "Printed on the official request. Say what the items are for."
              }
            >
              <Textarea
                id="pr-purpose"
                rows={2}
                placeholder="e.g. Office supplies for daily administrative operations"
                invalid={!!err.purpose}
                aria-describedby={err.purpose ? "pr-purpose-error" : "pr-purpose-helper"}
                className="rounded-[10px] border-[#d4d5d2] px-3.5 py-3 text-[15px] text-neutral-900"
                {...form.register("purpose")}
              />
            </LabelledField>
          </div>
        </Section>

        <ItemsSection form={form} />
      </div>

      <SummaryPanel
        form={form}
        isNew={!initial}
        reviewing={!isPublic && !!initial}
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
  optional = false,
  error,
  helper,
  children,
}: {
  id: string;
  label: string;
  /** Shown as a quiet "Optional" beside the label; required fields carry nothing. */
  optional?: boolean;
  error?: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between gap-2 text-[14px] font-medium text-neutral-900">
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

/** A cell's name on a phone, where the column headings are hidden. Screen readers use the aria-label. */
function CellLabel({ children }: { children: React.ReactNode }) {
  return (
    <span aria-hidden="true" className="mb-1 block text-[12px] font-medium text-[#5b606b] @min-[37rem]:hidden">
      {children}
    </span>
  );
}

function ItemsSection({ form }: { form: FormApi }) {
  const { register, control, formState, setValue } = form;
  // Units of measure, as the office set them in Settings → Procurement.
  const { options: itemUnits } = useConfigOptions("Procurement", "item_units");
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const items = useWatch({ control, name: "items" });
  const total = (items ?? []).reduce(
    (sum, it) => sum + (Number(it?.quantity) || 0) * (Number(it?.estimatedCost) || 0),
    0,
  );
  const itemsError = formState.errors.items;
  // Description takes every spare pixel; the numeric columns are sized to
  // their longest likely value. The rows become a table only when this card
  // is wide enough (30 Oct 2026): beside the admin sidebar the card is 240px
  // narrower than the window, and the fixed columns ran under the Summary.
  const cols = "@min-[37rem]:grid-cols-[20px_minmax(0,1fr)_64px_92px_104px_100px_36px]";

  return (
    <section
      aria-labelledby="pr-items-title"
      className="@container rounded-[14px] border border-[#e4e4e1] bg-white p-5 sm:p-6"
    >
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 id="pr-items-title" className="text-[15px] font-semibold text-neutral-900">
          Requested items
        </h2>
        <span className="text-[13px] text-[#5b606b]">
          {fields.length === 1 ? "1 item" : `${fields.length} items`}
        </span>
      </div>

      <div className={cn(fields.length > 10 && "max-h-[620px] overflow-y-auto pr-1")}>
      <div className={cn("sticky top-0 z-10 hidden gap-x-2 bg-white pb-2 text-[12px] font-medium text-[#5b606b] @min-[37rem]:grid", cols)}>
        <span>No.</span>
        <span>Item description</span>
        <span>Quantity</span>
        <span>Unit</span>
        <span>Unit cost (₱)</span>
        <span className="text-right">Total cost</span>
        <span />
      </div>

      <ul className="list-none space-y-2 @min-[37rem]:space-y-0">
        {fields.map((row, i) => {
          const rowErr = itemsError?.[i];
          const amount =
            (Number(items?.[i]?.quantity) || 0) * (Number(items?.[i]?.estimatedCost) || 0);
          return (
            // In a narrow card each item is its own bordered block; in a wide one it is a table row.
            <li
              key={row.id}
              className={cn(
                "grid grid-cols-2 items-start gap-x-2 gap-y-2.5 rounded-[10px] border border-[#e4e4e1] p-3 @min-[37rem]:items-center @min-[37rem]:rounded-none @min-[37rem]:border-0 @min-[37rem]:border-t @min-[37rem]:border-[#f0f0ee] @min-[37rem]:px-0 @min-[37rem]:py-1.5",
                cols,
              )}
            >
              <span
                aria-hidden="true"
                className={cn("col-span-2 text-[13px] font-medium text-[#5b606b] @min-[37rem]:col-span-1 @min-[37rem]:self-center", MONO)}
              >
                <span className="@min-[37rem]:hidden">Item </span>
                {i + 1}
              </span>
              <div className="col-span-2 @min-[37rem]:col-span-1">
                <CellLabel>Item description</CellLabel>
                <Input
                  aria-label={`Item ${i + 1} description`}
                  placeholder="e.g. Bond paper, A4, 70 gsm"
                  invalid={!!rowErr?.description}
                  className={CELL}
                  {...register(`items.${i}.description`, {
                    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
                      const next = capitalizeFirstLetter(e.target.value);
                      if (next !== e.target.value) setValue(`items.${i}.description`, next, { shouldDirty: true });
                    },
                  })}
                />
              </div>
              <div>
                <CellLabel>Quantity</CellLabel>
                <Input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  aria-label={`Item ${i + 1} quantity`}
                  placeholder="Qty"
                  invalid={!!rowErr?.quantity}
                  className={cn(CELL, MONO, "placeholder:font-['Geist',ui-sans-serif,system-ui,sans-serif]")}
                  {...register(`items.${i}.quantity`, { valueAsNumber: true })}
                />
              </div>
              <div>
                <CellLabel>Unit</CellLabel>
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
                      size="lg"
                      className="h-10 rounded-lg border-[#d4d5d2] px-3 text-[14px] text-neutral-900 focus-visible:border-neutral-900 focus-visible:ring-4 focus-visible:ring-neutral-900/10"
                    />
                  )}
                />
              </div>
              <div>
                <CellLabel>Unit cost (₱)</CellLabel>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  aria-label={`Item ${i + 1} unit cost in pesos`}
                  placeholder="0.00"
                  invalid={!!rowErr?.estimatedCost}
                  className={cn(CELL, MONO, "text-right")}
                  {...register(`items.${i}.estimatedCost`, { valueAsNumber: true })}
                />
              </div>
              {/* In a narrow card the total and the remove button share a row;
                  in a wide one they are the row's last two cells. */}
              <div className="flex items-end justify-between gap-2 @min-[37rem]:contents">
                <div className="@min-[37rem]:self-center @min-[37rem]:text-right">
                  <CellLabel>Total cost</CellLabel>
                  <span className={cn("block h-10 text-[14px] font-medium leading-10 text-neutral-900", MONO)}>
                    {peso(amount)}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label={`Remove item ${i + 1}`}
                  onClick={() => remove(i)}
                  disabled={fields.length === 1}
                  className="grid h-10 w-10 place-items-center justify-self-end rounded-lg text-[#5b606b] transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 disabled:pointer-events-none disabled:opacity-40 @min-[37rem]:w-9"
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
              {rowErr && (
                <p role="alert" className="col-span-2 text-[13px] text-red-700 @min-[37rem]:col-span-7">
                  Item {i + 1}: {rowErr.description?.message ?? rowErr.quantity?.message ?? rowErr.estimatedCost?.message ?? rowErr.unit?.message}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      </div>

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
          Add another item
        </button>
        <span className="text-[14px] text-[#5b606b]">
          Total
          <span className={cn("ml-2 text-[18px] font-semibold text-neutral-900", MONO)}>
            {peso(total)}
          </span>
        </span>
      </div>
    </section>
  );
}

/** The messages of every invalid field, with where each one is, for the summary's list. */
function problemsOf(form: FormApi): { label: string; field: Parameters<FormApi["setFocus"]>[0] }[] {
  const e = form.formState.errors;
  const out: { label: string; field: Parameters<FormApi["setFocus"]>[0] }[] = [];
  if (e.departmentCode?.message) out.push({ label: e.departmentCode.message, field: "departmentCode" });
  if (e.requester?.message) out.push({ label: e.requester.message, field: "requester" });
  if (e.purpose?.message) out.push({ label: e.purpose.message, field: "purpose" });
  if (typeof e.items?.message === "string") out.push({ label: e.items.message, field: "items" });
  (Array.isArray(e.items) ? e.items : []).forEach((row, i) => {
    if (!row) return;
    const which = row.description ? "description" : row.quantity ? "quantity" : row.estimatedCost ? "estimatedCost" : "unit";
    const message = row.description?.message ?? row.quantity?.message ?? row.estimatedCost?.message ?? row.unit?.message;
    if (message) out.push({ label: `Item ${i + 1}: ${message}`, field: `items.${i}.${which}` as Parameters<FormApi["setFocus"]>[0] });
  });
  return out;
}

function SummaryPanel({
  form,
  isNew,
  reviewing,
  submitLabel,
  submitting,
  onCancel,
}: {
  form: FormApi;
  /** A new request gets the note on what happens next; an edit does not. */
  isNew: boolean;
  /** The GSO editing a request: say what approval will still need. */
  reviewing?: boolean;
  submitLabel: string;
  submitting: boolean;
  onCancel: () => void;
}) {
  const values = useWatch({ control: form.control });
  const items = values.items ?? [];
  const total = items.reduce(
    (sum, it) => sum + (Number(it?.quantity) || 0) * (Number(it?.estimatedCost) || 0),
    0,
  );
  const office = values.departmentCode ? departmentByCode(values.departmentCode) : null;
  const purpose = (values.purpose ?? "").trim();
  // After a save is tried: each problem, one click from its field.
  const problems = form.formState.submitCount > 0 ? problemsOf(form) : [];
  const beforeApproval = reviewing
    ? [!purpose && "the purpose"].filter(Boolean)
    : [];

  return (
    <aside
      aria-label="Summary"
      className="rounded-[14px] border border-[#e4e4e1] bg-white p-5 shadow-[0_1px_2px_rgba(22,24,29,0.04),0_16px_40px_-24px_rgba(22,24,29,0.18)] sm:p-6 lg:sticky lg:top-6"
    >
      <h2 className="text-[15px] font-semibold text-neutral-900">Summary</h2>
      <dl className="mt-4 space-y-3 text-[14px]">
        <div>
          <dt className="text-[13px] text-[#5b606b]">Requesting office</dt>
          <dd className={cn("mt-0.5 font-medium", office ? "text-neutral-900" : "text-[#5b606b]")}>
            {office ? `${office.name} (${office.code})` : "Not selected yet"}
          </dd>
        </div>
        <div>
          <dt className="text-[13px] text-[#5b606b]">Purpose</dt>
          <dd className={cn("mt-0.5 line-clamp-2 font-medium", purpose ? "text-neutral-900" : "text-[#5b606b]")}>
            {purpose || "Not entered yet"}
          </dd>
        </div>
        <div>
          <dt className="text-[13px] text-[#5b606b]">Items</dt>
          <dd className="mt-0.5 font-medium text-neutral-900">{items.length}</dd>
        </div>
        <div className="border-t border-[#ececea] pt-3">
          <dt className="text-[13px] text-[#5b606b]">Estimated total</dt>
          <dd className={cn("mt-1 text-[26px] font-semibold leading-tight tracking-[-0.01em] text-neutral-900", MONO)}>
            {peso(total)}
          </dd>
        </div>
      </dl>

      {problems.length > 0 && (
        <div role="alert" className="mt-5 rounded-[10px] border border-[#f1c9c9] bg-[#fdf5f5] px-3.5 py-3">
          <p className="text-[13px] font-medium text-red-800">
            Fix {problems.length === 1 ? "this" : `these ${problems.length}`} before saving
          </p>
          <ul className="mt-1.5 space-y-1">
            {problems.slice(0, 6).map((p) => (
              <li key={p.label}>
                <button
                  type="button"
                  onClick={() => form.setFocus(p.field)}
                  className="text-left text-[13px] text-red-800 underline underline-offset-2 hover:text-red-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700"
                >
                  {p.label}
                </button>
              </li>
            ))}
            {problems.length > 6 && <li className="text-[13px] text-red-800">and {problems.length - 6} more</li>}
          </ul>
        </div>
      )}
      {beforeApproval.length > 0 && (
        <p className="mt-4 rounded-[10px] border border-[#f2d6c2] bg-[#fdf6f0] px-3.5 py-2.5 text-[13px] text-[#7c2d12]">
          Can be saved now. Before approval, add {beforeApproval.join(" and ")}.
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="group mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-neutral-900 text-[15px] font-medium text-white transition-[background-color,transform] duration-150 hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-70 [[data-portal]_&]:bg-(--accent-solid) [[data-portal]_&]:hover:bg-(--accent-solid-hover) [[data-portal]_&]:focus-visible:ring-(--accent-ring)"
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
      {isNew && (
        <p className="mt-3 text-[13px] leading-relaxed text-[#5b606b]">
          A reference number is issued upon submission. The GSO reviews the request next.
        </p>
      )}
    </aside>
  );
}
