import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save } from "lucide-react";

import {
  Button,
  DatePicker,
  Drawer,
  DrawerActions,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Field,
  Input,
  OverlineLabel,
  Textarea,
  toast,
} from "@/components";
import { formatPHP } from "@/lib/format";
import { createWaterMeterReading, correctWaterMeterReading } from "@/features/water/api";
import { submeterLabel } from "@/features/water/lib";
import type { WaterMeterReading, WaterSubmeter } from "@/features/water/types";

const readingSchema = z.object({
  readingDate: z.date({ error: "Select the reading date" }),
  currentReading: z
    .number({ error: "Enter the current meter reading" })
    .min(0, "Cannot be negative"),
  amount: z.number({ error: "Enter the billed amount" }).min(0, "Cannot be negative"),
  remarks: z.string().optional(),
  /** Required when correcting a finalized record; kept in its revisions. */
  correctionReason: z.string().optional(),
});

type ReadingValues = z.infer<typeof readingSchema>;

const toIsoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const num = (n: number) =>
  n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Right slide-over for recording or correcting one meter reading. The
 * previous reading is carried forward from the submeter's last entry — the
 * administrator only enters the current reading, amount and remarks, and the
 * consumption is derived.
 */
export function WaterReadingForm({
  open,
  onOpenChange,
  submeter,
  reading,
  /** Current reading of the submeter's latest entry; the new starting point. */
  carriedPrevious,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submeter: WaterSubmeter | null;
  /** Existing reading when editing; omit to record a new one. */
  reading?: WaterMeterReading | null;
  carriedPrevious?: number;
  onSaved?: () => void;
}) {
  const isEdit = !!reading;
  const [submitting, setSubmitting] = React.useState(false);

  // Editing keeps the reading's own previous value; creating carries forward.
  const previousReading = isEdit ? (reading?.previousReading ?? 0) : (carriedPrevious ?? 0);

  const form = useForm<ReadingValues>({
    resolver: zodResolver(readingSchema),
    mode: "onTouched",
    defaultValues: {
      readingDate: new Date(),
      currentReading: 0,
      amount: 0,
      remarks: "",
      correctionReason: "",
    },
  });

  React.useEffect(() => {
    if (!open) return;
    form.reset({
      readingDate: reading ? new Date(reading.readingDate) : new Date(),
      currentReading: reading?.currentReading ?? previousReading,
      amount: reading?.amount ?? 0,
      remarks: reading?.remarks ?? "",
      correctionReason: "",
    });
  }, [open, reading, previousReading, form]);

  const current = form.watch("currentReading");
  const consumption =
    (Number.isFinite(current) ? current : 0) - previousReading;

  const submit = form.handleSubmit(async (values) => {
    if (isEdit && !values.correctionReason?.trim()) {
      form.setError("correctionReason", { message: "Give the reason for this correction." });
      return;
    }
    if (!submeter) return;
    if (values.currentReading < previousReading) {
      form.setError("currentReading", {
        message: "Cannot be lower than the previous reading",
      });
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        readingDate: toIsoDate(values.readingDate),
        previousReading,
        currentReading: values.currentReading,
        amount: values.amount,
        remarks: values.remarks,
      };
      if (isEdit) {
        await correctWaterMeterReading(reading!.id, payload, values.correctionReason!.trim());
        toast.success("Reading corrected — the previous values are kept in its history");
      } else {
        await createWaterMeterReading({ submeterId: submeter.id, ...payload });
        toast.success("Meter reading recorded");
      }
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save the meter reading");
    }
    setSubmitting(false);
  });

  const err = form.formState.errors;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} size="md">
      <DrawerHeader
        title={isEdit ? "Correct Meter Reading" : "Add Meter Reading"}
        description={
          submeter ? `${submeterLabel(submeter)} · ${submeter.submeterNumber}` : undefined
        }
        onClose={() => onOpenChange(false)}
      />
      <DrawerBody>
        <div className="space-y-4">
          <Field label="Reading Date" required error={err.readingDate?.message}>
            <Controller
              control={form.control}
              name="readingDate"
              render={({ field }) => (
                <DatePicker
                  value={field.value}
                  onChange={field.onChange}
                  invalid={!!err.readingDate}
                />
              )}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            {/* Read-only: carried forward from the last reading */}
            <Field
              label="Previous Reading"
              helper={isEdit ? "Kept from the original entry." : "Carried from the last reading."}
            >
              <Input value={num(previousReading)} readOnly disabled />
            </Field>
            <Field label="Current Reading" required error={err.currentReading?.message}>
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="0.00"
                invalid={!!err.currentReading}
                {...form.register("currentReading", { valueAsNumber: true })}
              />
            </Field>
          </div>

          {/* Computed consumption — read-only by design */}
          <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-3.5 py-3">
            <div>
              <OverlineLabel>Consumption</OverlineLabel>
              <p className="mt-0.5 text-[11px] text-neutral-500">
                Current Reading − Previous Reading, computed automatically.
              </p>
            </div>
            <div
              className={
                "text-[20px] font-semibold tabular-nums tracking-tight " +
                (consumption < 0 ? "text-red-600" : "text-neutral-900")
              }
            >
              {num(consumption)}
              <span className="ml-1 text-[12px] font-normal text-neutral-400">m³</span>
            </div>
          </div>

          <Field label="Amount (PHP)" required error={err.amount?.message}>
            <Input
              type="number"
              min={0}
              step="0.01"
              placeholder="0.00"
              invalid={!!err.amount}
              {...form.register("amount", { valueAsNumber: true })}
            />
          </Field>
          {form.watch("amount") > 0 && consumption > 0 && (
            <p className="-mt-2 text-[11px] text-neutral-500">
              Effective rate {formatPHP(form.watch("amount") / consumption, { decimals: 2 })} per m³.
            </p>
          )}

          <Field label="Remarks" error={err.remarks?.message}>
            <Textarea
              rows={3}
              placeholder="Optional — e.g. estimated reading, meter replaced, leak repaired"
              {...form.register("remarks")}
            />
          </Field>
          {isEdit && (
            <Field
              label="Reason for correction"
              required
              error={err.correctionReason?.message}
              helper="Kept with the previous values, your name and the time."
            >
              <Textarea rows={2} {...form.register("correctionReason")} />
            </Field>
          )}
        </div>
      </DrawerBody>
      <DrawerFooter>
        <DrawerActions>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} loading={submitting}>
            <Save />
            {isEdit ? "Save Correction" : "Record Reading"}
          </Button>
        </DrawerActions>
      </DrawerFooter>
    </Drawer>
  );
}
