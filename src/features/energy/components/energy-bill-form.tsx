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
  createEnergyBill,
  createEnergySubmeterBill,
  correctEnergyBill,
  correctEnergySubmeterBill,
} from "@/features/energy/api";
import {
  MONTHS,
  type EnergyAccount,
  type EnergyBill,
  type EnergySubmeter,
  type EnergySubmeterBill,
} from "@/features/energy/types";
import { accountLabel, submeterLabel } from "@/features/energy/lib";

const billSchema = z.object({
  billingMonth: z.number({ error: "Select the billing month" }).min(1).max(12),
  billingYear: z
    .number({ error: "Enter the billing year" })
    .min(2000, "Enter a valid year")
    .max(2100, "Enter a valid year"),
  amount: z.number({ error: "Enter the billed amount" }).positive("Must be more than 0"),
  kwh: z.number({ error: "Enter the kilowatt-hour reading" }).min(0, "Cannot be negative"),
  remarks: z.string().optional(),
  /** Required when correcting a finalized record; kept in its revisions. */
  correctionReason: z.string().optional(),
});

type BillValues = z.infer<typeof billSchema>;

const YEAR_OPTIONS = Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - 3 + i);

/**
 * Right slide-over for recording or correcting one monthly electricity bill.
 * The same form serves main accounts and submeters — pass `submeter` to write
 * against a submeter instead of the parent account.
 */
export function EnergyBillForm({
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
  account: EnergyAccount | null;
  /** When set, the bill is recorded against this submeter. */
  submeter?: EnergySubmeter | null;
  /** Existing account bill when editing; omit to record a new one. */
  bill?: EnergyBill | null;
  /** Existing submeter bill when editing a submeter's record. */
  submeterBill?: EnergySubmeterBill | null;
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
      kwh: 0,
      remarks: "",
      correctionReason: "",
    },
  });

  React.useEffect(() => {
    if (!open) return;
    const measure = forSubmeter ? submeterBill?.consumption : bill?.kwh;
    form.reset({
      billingMonth: existing?.billingMonth ?? new Date().getMonth() + 1,
      billingYear: existing?.billingYear ?? new Date().getFullYear(),
      amount: existing?.amount ?? 0,
      kwh: measure ?? 0,
      remarks: existing?.remarks ?? "",
      correctionReason: "",
    });
  }, [open, bill, submeterBill, existing, forSubmeter, form]);

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
          await correctEnergySubmeterBill(
            submeterBill!.id,
            { amount: values.amount, consumption: values.kwh, remarks: values.remarks },
            values.correctionReason!.trim(),
          );
          toast.success("Submeter bill corrected — the previous values are kept in its history");
        } else {
          await createEnergySubmeterBill({
            submeterId: submeter!.id,
            billingMonth: values.billingMonth,
            billingYear: values.billingYear,
            amount: values.amount,
            consumption: values.kwh,
            remarks: values.remarks,
          });
          toast.success(
            `${MONTHS[values.billingMonth - 1]} ${values.billingYear} submeter bill recorded`,
          );
        }
      } else if (isEdit) {
        await correctEnergyBill(
          bill!.id,
          { amount: values.amount, kwh: values.kwh, remarks: values.remarks },
          values.correctionReason!.trim(),
        );
        toast.success("Bill corrected — the previous values are kept in its history");
      } else {
        await createEnergyBill({ accountId: account!.id, ...values });
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
              label={forSubmeter ? "Consumption (KW)" : "Number of KW"}
              required
              error={err.kwh?.message}
              helper={isEdit ? undefined : "Kilowatt-hours consumed."}
            >
              <Input
                type="number"
                min={0}
                step="1"
                placeholder="0"
                invalid={!!err.kwh}
                {...form.register("kwh", { valueAsNumber: true })}
              />
            </Field>
          </div>
          <Field label="Remarks" error={err.remarks?.message}>
            <Textarea
              rows={3}
              placeholder="Optional — e.g. estimated reading, billing adjustment, peak season"
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
