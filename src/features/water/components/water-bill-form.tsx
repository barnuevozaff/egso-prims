import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save } from "lucide-react";

import {
  Button,
  Drawer,
  DrawerActions,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Field,
  Input,
  SelectField,
  Textarea,
  toast,
} from "@/components";
import {
  createWaterBill,
  createWaterSubmeterBill,
  correctWaterBill,
  correctWaterSubmeterBill,
} from "@/features/water/api";
import {
  MONTHS,
  type WaterAccount,
  type WaterBill,
  type WaterSubmeter,
  type WaterSubmeterBill,
} from "@/features/water/types";
import { accountLabel, submeterLabel } from "@/features/water/lib";

const billSchema = z.object({
  billingMonth: z.number({ error: "Select the billing month" }).min(1).max(12),
  billingYear: z
    .number({ error: "Enter the billing year" })
    .min(2000, "Enter a valid year")
    .max(2100, "Enter a valid year"),
  amount: z.number({ error: "Enter the billed amount" }).positive("Must be more than 0"),
  consumption: z.number({ error: "Enter the consumption reading" }).min(0, "Cannot be negative"),
  remarks: z.string().optional(),
  /** Required when correcting a finalized record; kept in its revisions. */
  correctionReason: z.string().optional(),
});

type BillValues = z.infer<typeof billSchema>;

const YEAR_OPTIONS = Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - 3 + i);

/**
 * Right slide-over for recording or correcting one monthly water bill.
 * The same form serves main accounts and submeters — pass `submeter` to write
 * against a submeter instead of the parent account.
 */
export function WaterBillForm({
  open,
  onOpenChange,
  account,
  submeter,
  bill,
  submeterBill,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: WaterAccount | null;
  /** When set, the bill is recorded against this submeter. */
  submeter?: WaterSubmeter | null;
  /** Existing account bill when editing; omit to record a new one. */
  bill?: WaterBill | null;
  /** Existing submeter bill when editing a submeter's record. */
  submeterBill?: WaterSubmeterBill | null;
  onSaved?: () => void;
}) {
  const forSubmeter = !!submeter;
  const existing = forSubmeter ? submeterBill : bill;
  const isEdit = !!existing;
  const [submitting, setSubmitting] = React.useState(false);

  const form = useForm<BillValues>({
    resolver: zodResolver(billSchema),
    mode: "onTouched",
    defaultValues: {
      billingMonth: new Date().getMonth() + 1,
      billingYear: new Date().getFullYear(),
      amount: 0,
      consumption: 0,
      remarks: "",
      correctionReason: "",
    },
  });

  React.useEffect(() => {
    if (!open) return;
    form.reset({
      billingMonth: existing?.billingMonth ?? new Date().getMonth() + 1,
      billingYear: existing?.billingYear ?? new Date().getFullYear(),
      amount: existing?.amount ?? 0,
      consumption: existing?.consumption ?? 0,
      remarks: existing?.remarks ?? "",
      correctionReason: "",
    });
  }, [open, existing, form]);

  const submit = form.handleSubmit(async (values) => {
    if (isEdit && !values.correctionReason?.trim()) {
      form.setError("correctionReason", { message: "Give the reason for this correction." });
      return;
    }
    if (!account && !submeter) return;
    setSubmitting(true);
    try {
      if (forSubmeter) {
        if (isEdit) {
          await correctWaterSubmeterBill(
            submeterBill!.id,
            { amount: values.amount, consumption: values.consumption, remarks: values.remarks },
            values.correctionReason!.trim(),
          );
          toast.success("Submeter bill corrected — the previous values are kept in its history");
        } else {
          await createWaterSubmeterBill({ submeterId: submeter!.id, ...values });
          toast.success(
            `${MONTHS[values.billingMonth - 1]} ${values.billingYear} submeter bill recorded`,
          );
        }
      } else if (isEdit) {
        await correctWaterBill(
          bill!.id,
          { amount: values.amount, consumption: values.consumption, remarks: values.remarks },
          values.correctionReason!.trim(),
        );
        toast.success("Bill corrected — the previous values are kept in its history");
      } else {
        await createWaterBill({ accountId: account!.id, ...values });
        toast.success(`${MONTHS[values.billingMonth - 1]} ${values.billingYear} bill recorded`);
      }
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save the billing record");
    }
    setSubmitting(false);
  });

  const err = form.formState.errors;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} size="md">
      <DrawerHeader
        title={isEdit ? "Correct Billing Record" : "Record Monthly Bill"}
        description={
          submeter
            ? `${submeterLabel(submeter)} · ${submeter.submeterNumber}`
            : account
              ? `${accountLabel(account)} · ${account.accountNumber}`
              : undefined
        }
        onClose={() => onOpenChange(false)}
      />
      <DrawerBody>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Billing Month" required error={err.billingMonth?.message}>
              <Controller
                control={form.control}
                name="billingMonth"
                render={({ field }) => (
                  <SelectField
                    placeholder="Select month…"
                    options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
                    value={field.value ? String(field.value) : undefined}
                    onChange={(v) => field.onChange(Number(v))}
                    disabled={isEdit}
                    invalid={!!err.billingMonth}
                  />
                )}
              />
            </Field>
            <Field label="Billing Year" required error={err.billingYear?.message}>
              <Controller
                control={form.control}
                name="billingYear"
                render={({ field }) => (
                  <SelectField
                    options={YEAR_OPTIONS.map((y) => ({ value: String(y), label: String(y) }))}
                    value={field.value ? String(field.value) : undefined}
                    onChange={(v) => field.onChange(Number(v))}
                    disabled={isEdit}
                    invalid={!!err.billingYear}
                  />
                )}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Amount (PHP)"
              required
              error={err.amount?.message}
              helper={isEdit ? undefined : "Total billed amount for the period."}
            >
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="0.00"
                invalid={!!err.amount}
                {...form.register("amount", { valueAsNumber: true })}
              />
            </Field>
            <Field
              label="Consumption (m³)"
              required
              error={err.consumption?.message}
              helper={isEdit ? undefined : "Cubic metres consumed."}
            >
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="0"
                invalid={!!err.consumption}
                {...form.register("consumption", { valueAsNumber: true })}
              />
            </Field>
          </div>
          <Field label="Remarks" error={err.remarks?.message}>
            <Textarea
              rows={3}
              placeholder="Optional — e.g. estimated reading, billing adjustment, leak repair"
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
          {isEdit && (
            <p className="rounded-lg bg-neutral-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-neutral-500">
              The billing period cannot be changed. If the month or year was recorded
              incorrectly, void this bill and record it again.
            </p>
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
            {isEdit ? "Save Correction" : "Record Bill"}
          </Button>
        </DrawerActions>
      </DrawerFooter>
    </Drawer>
  );
}
