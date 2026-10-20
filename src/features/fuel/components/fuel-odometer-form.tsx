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
import {
  createFuelOdometerReading,
  correctFuelOdometerReading,
} from "@/features/fuel/api";
import { kmPerLiter, vehicleLabel } from "@/features/fuel/lib";
import type { FuelOdometerReading, FuelVehicle } from "@/features/fuel/types";

const odometerSchema = z.object({
  readingDate: z.date({ error: "Select the reading date" }),
  currentOdometer: z
    .number({ error: "Enter the current odometer reading" })
    .min(0, "Cannot be negative"),
  fuelCost: z.number({ error: "Enter the fuel cost" }).min(0, "Cannot be negative"),
  fuelLiters: z.number({ error: "Enter the litres drawn" }).min(0, "Cannot be negative"),
  remarks: z.string().optional(),
  /** Required when correcting a finalized record; kept in its revisions. */
  correctionReason: z.string().optional(),
});

type OdometerValues = z.infer<typeof odometerSchema>;

const toIsoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const num = (n: number, decimals = 0) =>
  n.toLocaleString("en-PH", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/**
 * Right slide-over for recording or correcting one odometer reading. The
 * previous odometer is carried forward from the vehicle's last entry — the
 * administrator only enters the current reading, cost, litres and remarks,
 * and the distance travelled is derived.
 */
export function FuelOdometerForm({
  open,
  onOpenChange,
  vehicle,
  reading,
  /** Current odometer of the vehicle's latest entry; the new starting point. */
  carriedPrevious,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: FuelVehicle | null;
  /** Existing reading when editing; omit to record a new one. */
  reading?: FuelOdometerReading | null;
  carriedPrevious?: number;
  onSaved?: () => void;
}) {
  const isEdit = !!reading;
  const [submitting, setSubmitting] = React.useState(false);

  // Editing keeps the reading's own previous value; creating carries forward.
  const previousOdometer = isEdit ? (reading?.previousOdometer ?? 0) : (carriedPrevious ?? 0);

  const form = useForm<OdometerValues>({
    resolver: zodResolver(odometerSchema),
    mode: "onTouched",
    defaultValues: {
      readingDate: new Date(),
      currentOdometer: 0,
      fuelCost: 0,
      fuelLiters: 0,
      remarks: "",
      correctionReason: "",
    },
  });

  React.useEffect(() => {
    if (!open) return;
    form.reset({
      readingDate: reading ? new Date(reading.readingDate) : new Date(),
      currentOdometer: reading?.currentOdometer ?? previousOdometer,
      fuelCost: reading?.fuelCost ?? 0,
      fuelLiters: reading?.fuelLiters ?? 0,
      remarks: reading?.remarks ?? "",
      correctionReason: "",
    });
  }, [open, reading, previousOdometer, form]);

  const current = form.watch("currentOdometer");
  const liters = form.watch("fuelLiters");
  const distance = (Number.isFinite(current) ? current : 0) - previousOdometer;
  const efficiency = kmPerLiter(distance, Number.isFinite(liters) ? liters : 0);

  const submit = form.handleSubmit(async (values) => {
    if (isEdit && !values.correctionReason?.trim()) {
      form.setError("correctionReason", { message: "Give the reason for this correction." });
      return;
    }
    if (!vehicle) return;
    if (values.currentOdometer < previousOdometer) {
      form.setError("currentOdometer", {
        message: "Cannot be lower than the previous odometer",
      });
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        readingDate: toIsoDate(values.readingDate),
        previousOdometer,
        currentOdometer: values.currentOdometer,
        fuelCost: values.fuelCost,
        fuelLiters: values.fuelLiters,
        remarks: values.remarks,
      };
      if (isEdit) {
        await correctFuelOdometerReading(reading!.id, payload, values.correctionReason!.trim());
        toast.success("Reading corrected — the previous values are kept in its history");
      } else {
        await createFuelOdometerReading({ vehicleId: vehicle.id, ...payload });
        toast.success("Odometer reading recorded");
      }
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save the odometer reading");
    }
    setSubmitting(false);
  });

  const err = form.formState.errors;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} size="md">
      <DrawerHeader
        title={isEdit ? "Correct Odometer Reading" : "Add Odometer Reading"}
        description={vehicle ? `${vehicleLabel(vehicle)} · ${vehicle.plateNumber}` : undefined}
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
              label="Previous Odometer"
              helper={isEdit ? "Kept from the original entry." : "Carried from the last reading."}
            >
              <Input value={num(previousOdometer)} readOnly disabled />
            </Field>
            <Field label="Current Odometer" required error={err.currentOdometer?.message}>
              <Input
                type="number"
                min={0}
                step="1"
                placeholder="0"
                invalid={!!err.currentOdometer}
                {...form.register("currentOdometer", { valueAsNumber: true })}
              />
            </Field>
          </div>

          {/* Computed distance — read-only by design */}
          <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-3.5 py-3">
            <div>
              <OverlineLabel>Distance Travelled</OverlineLabel>
              <p className="mt-0.5 text-[11px] text-neutral-500">
                Current Odometer − Previous Odometer, computed automatically.
              </p>
            </div>
            <div
              className={
                "text-[20px] font-semibold tabular-nums tracking-tight " +
                (distance < 0 ? "text-red-600" : "text-neutral-900")
              }
            >
              {num(distance)}
              <span className="ml-1 text-[12px] font-normal text-neutral-400">km</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Fuel Liters" required error={err.fuelLiters?.message}>
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="0.00"
                invalid={!!err.fuelLiters}
                {...form.register("fuelLiters", { valueAsNumber: true })}
              />
            </Field>
            <Field label="Fuel Cost (PHP)" required error={err.fuelCost?.message}>
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder="0.00"
                invalid={!!err.fuelCost}
                {...form.register("fuelCost", { valueAsNumber: true })}
              />
            </Field>
          </div>
          {efficiency !== null && (
            <p className="-mt-2 text-[11px] text-neutral-500">
              Fuel efficiency {efficiency.toFixed(2)} km per litre
              {form.watch("fuelCost") > 0 && distance > 0 && (
                <> · {formatPHP(form.watch("fuelCost") / distance, { decimals: 2 })} per km</>
              )}
              .
            </p>
          )}

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
            {isEdit ? "Save Correction" : "Record Reading"}
          </Button>
        </DrawerActions>
      </DrawerFooter>
    </Drawer>
  );
}
