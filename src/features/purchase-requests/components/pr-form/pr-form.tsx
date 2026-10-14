import * as React from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { ArrowRight, Check, Plus, Trash2 } from "lucide-react";

import { Input, SelectField, Spinner, Textarea } from "@/components";
import { useConfigOptions, useConfigText } from "@/features/config/use-module-config";
import type { PRDraftInput } from "@/features/purchase-requests/api";
import { FUNDING_SOURCES, type PurchaseRequest } from "@/features/purchase-requests/types";
import { prFormSchema, type PRFormValues } from "@/features/purchase-requests/components/pr-form/schema";
import { OfficeField } from "@/features/shared/office-field";
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
  submitLabel: string;
  submitting: boolean;
  onSubmit: (input: PRDraftInput) => void | Promise<void>;
  onCancel: () => void;
}

type FormApi = ReturnType<typeof useForm<PRFormValues>>;

export function PRForm({ initial, submitLabel, submitting, onSubmit, onCancel }: PRFormProps) {
  // The fund a new request is recorded against. The form does not ask, so
  // Settings is the only place it is chosen; an unrecognised value falls back
  // rather than reaching the column, which accepts a fixed set.
  const configuredFund = useConfigText("Procurement", "default_funding_source");

  const form = useForm<PRFormValues>({
    resolver: zodResolver(prFormSchema),
    mode: "onTouched",
    defaultValues: initial
      ? {
          departmentCode: initial.departmentCode,
          requester: initial.requester,
          purpose: initial.purpose,
          requestDate: new Date(initial.requestDate),
          fundingSource: initial.fundingSource,
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
          // Applied on submit from Settings → Procurement, once configuration
          // has loaded; a default here would be captured before it arrives.
          fundingSource: "General Fund",
          items: [{ ...emptyItem }],
        },
  });

  const submit = form.handleSubmit(async (values) => {
    await onSubmit({
      departmentCode: values.departmentCode,
      requester: values.requester,
      purpose: values.purpose,
      fundingSource: initial
        ? values.fundingSource
        : (FUNDING_SOURCES as readonly string[]).includes(configuredFund)
          ? (configuredFund as PRDraftInput["fundingSource"])
          : values.fundingSource,
      requestDate: format(values.requestDate, "yyyy-MM-dd"),
      items: values.items,
      // Attachments were removed from the form. On an edit an empty list keeps
      // whatever the request already has (see updatePurchaseRequest).
      attachments: [],
    });
  });

  const err = form.formState.errors;

  return (
    <form
      onSubmit={submit}
      noValidate
      className="grid w-full items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8"
    >
      <div className="flex min-w-0 flex-col gap-5">
        <Section title="Who is asking">
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
                placeholder="e.g. Engr. Jerome Cruz"
                autoComplete="name"
                invalid={!!err.requester}
                aria-describedby={err.requester ? "pr-requester-error" : undefined}
                className={FIELD}
                {...form.register("requester")}
              />
            </LabelledField>
          </div>
        </Section>

        <Section title="What it is for">
          <LabelledField
            id="pr-purpose"
            label="Purpose"
            error={err.purpose?.message}
            helper="Say what the items are for and where they will be used."
          >
            <Textarea
              id="pr-purpose"
              rows={3}
              placeholder="e.g. Road maintenance materials for the Brgy. San Roque farm-to-market road"
              invalid={!!err.purpose}
              aria-describedby={err.purpose ? "pr-purpose-error" : "pr-purpose-helper"}
              className="rounded-[10px] border-[#d4d5d2] px-3.5 py-3 text-[15px] text-neutral-900"
              {...form.register("purpose")}
            />
          </LabelledField>
        </Section>

        <ItemsSection form={form} />
      </div>

      <SummaryPanel
        form={form}
        submitLabel={submitLabel}
        submitting={submitting}
        onCancel={onCancel}
      />
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
  error,
  helper,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[14px] font-medium text-neutral-900">
        {label}
        <span className="sr-only"> (required)</span>
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

function ItemsSection({ form }: { form: FormApi }) {
  const { register, control, formState } = form;
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
  // their longest likely value.
  const cols = "sm:grid-cols-[minmax(0,1fr)_64px_112px_112px_104px_40px]";

  return (
    <section
      aria-labelledby="pr-items-title"
      className="rounded-[14px] border border-[#e4e4e1] bg-white p-5 sm:p-6"
    >
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 id="pr-items-title" className="text-[15px] font-semibold text-neutral-900">
          Items
        </h2>
        <span className="text-[13px] text-[#5b606b]">
          {fields.length === 1 ? "1 item" : `${fields.length} items`}
        </span>
      </div>

      <div className={cn("hidden gap-2 pb-2 text-[12px] font-medium text-[#5b606b] sm:grid", cols)}>
        <span>Description</span>
        <span>Qty</span>
        <span>Unit</span>
        <span>Unit cost (₱)</span>
        <span className="text-right">Amount</span>
        <span />
      </div>

      <ul className="list-none space-y-2 sm:space-y-0">
        {fields.map((row, i) => {
          const rowErr = itemsError?.[i];
          const amount =
            (Number(items?.[i]?.quantity) || 0) * (Number(items?.[i]?.estimatedCost) || 0);
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
                <Input
                  aria-label={`Item ${i + 1} description`}
                  placeholder="What to buy"
                  invalid={!!rowErr?.description}
                  className={CELL}
                  {...register(`items.${i}.description`)}
                />
              </div>
              <Input
                type="number"
                min={1}
                inputMode="numeric"
                aria-label={`Item ${i + 1} quantity`}
                placeholder="Qty"
                invalid={!!rowErr?.quantity}
                className={cn(CELL, MONO)}
                {...register(`items.${i}.quantity`, { valueAsNumber: true })}
              />
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
              <span
                className={cn(
                  "self-center text-[14px] font-medium text-neutral-900 sm:text-right",
                  MONO,
                )}
              >
                {peso(amount)}
              </span>
              <button
                type="button"
                aria-label={`Remove item ${i + 1}`}
                onClick={() => remove(i)}
                disabled={fields.length === 1}
                className="grid h-10 w-10 place-items-center justify-self-end rounded-lg text-[#5b606b] transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 disabled:pointer-events-none disabled:opacity-40"
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </button>
              {rowErr && (
                <p role="alert" className="col-span-2 text-[13px] text-red-700 sm:col-span-6">
                  Item {i + 1}: {rowErr.description?.message ?? rowErr.quantity?.message ?? rowErr.estimatedCost?.message ?? rowErr.unit?.message}
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

function SummaryPanel({
  form,
  submitLabel,
  submitting,
  onCancel,
}: {
  form: FormApi;
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
  const complete = items.filter(
    (it) =>
      (it?.description ?? "").trim().length >= 3 &&
      Number(it?.quantity) > 0 &&
      Number(it?.estimatedCost) > 0,
  ).length;

  // The same thresholds the schema enforces, so a tick means it will pass.
  const checks = [
    { label: "Requesting office", done: (values.departmentCode ?? "").trim().length > 0 },
    { label: "Requested by", done: (values.requester ?? "").trim().length >= 3 },
    { label: "Purpose", done: (values.purpose ?? "").trim().length >= 10 },
    {
      label:
        items.length === 1
          ? "1 item with quantity and cost"
          : `${items.length} items with quantity and cost`,
      done: items.length > 0 && complete === items.length,
    },
  ];

  return (
    <aside
      aria-label="Summary"
      className="rounded-[14px] border border-[#e4e4e1] bg-white p-5 shadow-[0_1px_2px_rgba(22,24,29,0.04),0_16px_40px_-24px_rgba(22,24,29,0.18)] sm:p-6 lg:sticky lg:top-6"
    >
      <h2 className="text-[15px] font-semibold text-neutral-900">Summary</h2>
      <p className="mt-4 text-[13px] text-[#5b606b]">Estimated total</p>
      <p className={cn("mt-1 text-[28px] font-semibold leading-tight tracking-[-0.01em]", MONO)}>
        {peso(total)}
      </p>
      <p className="mt-1 text-[13px] text-[#5b606b]">
        {items.length === 1 ? "1 item" : `${items.length} items`}
      </p>

      <ul className="mt-5 list-none space-y-2.5 border-t border-[#ececea] pt-5">
        {checks.map((c) => (
          <li key={c.label} className="flex items-center gap-2.5 text-[14px]">
            {c.done ? (
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-neutral-900 text-white">
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
    </aside>
  );
}
