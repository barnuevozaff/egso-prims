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
  SelectField,
  Textarea,
  toast,
} from "@/components";
import { formatPHP } from "@/lib/format";
import { createFuelTransaction, correctFuelTransaction } from "@/features/fuel/api";
import { FUEL_TYPES, type FuelTransaction, type FuelVehicle } from "@/features/fuel/types";
import { vehicleLabel } from "@/features/fuel/lib";

const txnSchema = z.object({
  vehicleId: z.string().min(1, "Select the vehicle"),
  txnDate: z.date({ error: "Select the transaction date" }),
  fuelType: z.string().min(1, "Select the fuel type"),
  liters: z.number({ error: "Enter the litres drawn" }).positive("Must be more than 0"),
  pricePerLiter: z
    .number({ error: "Enter the price per litre" })
    .positive("Must be more than 0"),
  driver: z.string().optional(),
  odometer: z.number().min(0, "Cannot be negative").optional(),
  remarks: z.string().optional(),
  /** Required when correcting a finalized record; kept in its revisions. */
  correctionReason: z.string().optional(),
});

type TxnValues = z.infer<typeof txnSchema>;

const toIsoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Right slide-over for recording or correcting one fuel transaction. */
export function FuelTransactionForm({
  open,
  onOpenChange,
  vehicle,
  vehicles,
  transaction,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fixed vehicle when opened from a drawer or row; null to let the user pick. */
  vehicle: FuelVehicle | null;
  /** Selectable registry, used when no fixed vehicle was supplied. */
  vehicles?: FuelVehicle[];
  /** Existing transaction when editing; omit to record a new one. */
  transaction?: FuelTransaction | null;
  onSaved?: () => void;
}) {
  const isEdit = !!transaction;
  const [submitting, setSubmitting] = React.useState(false);
  const needsPicker = !vehicle && !isEdit;

  const form = useForm<TxnValues>({
    resolver: zodResolver(txnSchema),
    mode: "onTouched",
    defaultValues: {
      vehicleId: "",
      txnDate: new Date(),
      fuelType: "",
      liters: 0,
      pricePerLiter: 0,
      driver: "",
      odometer: undefined,
      remarks: "",
      correctionReason: "",
    },
  });

  React.useEffect(() => {
    if (!open) return;
    form.reset({
      vehicleId: vehicle?.id ?? transaction?.vehicleId ?? "",
      txnDate: transaction ? new Date(transaction.txnDate) : new Date(),
      fuelType: transaction?.fuelType ?? vehicle?.fuelType ?? "",
      liters: transaction?.liters ?? 0,
      pricePerLiter: transaction?.pricePerLiter ?? 0,
      driver: transaction?.driver ?? "",
      odometer: transaction?.odometer,
      remarks: transaction?.remarks ?? "",
      correctionReason: "",
    });
  }, [open, transaction, vehicle, form]);

  // Picking a vehicle defaults the fuel type to the one it runs on.
  const pickedId = form.watch("vehicleId");
  React.useEffect(() => {
    if (!needsPicker || !pickedId) return;
    const picked = vehicles?.find((v) => v.id === pickedId);
    if (picked && !form.getValues("fuelType")) form.setValue("fuelType", picked.fuelType);
  }, [pickedId, needsPicker, vehicles, form]);

  // Total Amount is derived, never typed — the database computes the stored
  // value from the same formula.
  const liters = form.watch("liters");
  const price = form.watch("pricePerLiter");
  const total = (Number.isFinite(liters) ? liters : 0) * (Number.isFinite(price) ? price : 0);

  const submit = form.handleSubmit(async (values) => {
    if (isEdit && !values.correctionReason?.trim()) {
      form.setError("correctionReason", { message: "Give the reason for this correction." });
      return;
    }
    const targetId = vehicle?.id ?? values.vehicleId;
    if (!targetId) return;
    setSubmitting(true);
    try {
      const payload = {
        txnDate: toIsoDate(values.txnDate),
        fuelType: values.fuelType,
        liters: values.liters,
        pricePerLiter: values.pricePerLiter,
        driver: values.driver,
        odometer: values.odometer,
        remarks: values.remarks,
      };
      if (isEdit) {
        await correctFuelTransaction(transaction!.id, payload, values.correctionReason!.trim());
        toast.success("Fuel transaction corrected — the previous values are kept in its history");
      } else {
        await createFuelTransaction({ vehicleId: targetId, ...payload });
        toast.success("Fuel transaction recorded");
      }
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save the transaction");
    }
    setSubmitting(false);
  });

  const err = form.formState.errors;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} size="md">
      <DrawerHeader
        title={isEdit ? "Correct Fuel Transaction" : "Record Fuel Transaction"}
        description={vehicle ? `${vehicleLabel(vehicle)} · ${vehicle.plateNumber}` : undefined}
        onClose={() => onOpenChange(false)}
      />
      <DrawerBody>
        <div className="space-y-4">
          {needsPicker && (
            <Field label="Vehicle" required error={err.vehicleId?.message}>
              <Controller
                control={form.control}
                name="vehicleId"
                render={({ field }) => (
                  <SelectField
                    placeholder="Select vehicle…"
                    options={(vehicles ?? []).map((v) => ({
                      value: v.id,
                      label: `${v.plateNumber} · ${vehicleLabel(v)}`,
                    }))}
                    value={field.value || undefined}
                    onChange={field.onChange}
                    invalid={!!err.vehicleId}
                  />
                )}
              />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Transaction Date" required error={err.txnDate?.message}>
              <Controller
                control={form.control}
                name="txnDate"
                render={({ field }) => (
                  <DatePicker
                    value={field.value}
                    onChange={field.onChange}
                    invalid={!!err.txnDate}
                  />
                )}
              />
            </Field>
            <Field label="Fuel Type" required error={err.fuelType?.message}>
              <Controller
                control={form.control}
                name="fuelType"
                render={({ field }) => (
                  <SelectField
                    placeholder="Select fuel…"
                    options={FUEL_TYPES.map((t) => ({ value: t, label: t }))}
                    value={field.value || undefined}
                    onChange={field.onChange}
                    invalid={!!err.fuelType}
                  />
                )}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Liters" required error={err.liters?.message}>
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="0.00"
                invalid={!!err.liters}
                {...form.register("liters", { valueAsNumber: true })}
              />
            </Field>
            <Field label="Price Per Liter (PHP)" required error={err.pricePerLiter?.message}>
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="0.00"
                invalid={!!err.pricePerLiter}
                {...form.register("pricePerLiter", { valueAsNumber: true })}
              />
            </Field>
          </div>

          {/* Computed total — read-only by design */}
          <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-3.5 py-3">
            <div>
              <OverlineLabel>Total Amount</OverlineLabel>
              <p className="mt-0.5 text-[11px] text-neutral-500">
                Liters × Price Per Liter, computed automatically.
              </p>
            </div>
            <div className="text-[20px] font-semibold tabular-nums tracking-tight text-neutral-900">
              {formatPHP(total, { decimals: 2 })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Driver" error={err.driver?.message}>
              <Input placeholder="Optional — e.g. R. Delos Santos" {...form.register("driver")} />
            </Field>
            <Field label="Odometer Reading" error={err.odometer?.message}>
              <Input
                type="number"
                min={0}
                step="1"
                placeholder="Optional — km"
                {...form.register("odometer", {
                  setValueAs: (v) => (v === "" || v === null ? undefined : Number(v)),
                })}
              />
            </Field>
          </div>

          <Field label="Remarks" error={err.remarks?.message}>
            <Textarea
              rows={3}
              placeholder="Optional — e.g. field operations, trip to provincial capitol"
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
            {isEdit ? "Save Correction" : "Record Transaction"}
          </Button>
        </DrawerActions>
      </DrawerFooter>
    </Drawer>
  );
}
