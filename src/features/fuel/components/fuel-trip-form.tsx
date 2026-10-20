import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Save } from "lucide-react";

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
import { createFuelTrip, correctFuelTrip, type TripDraftInput } from "@/features/fuel/api";
import { useFuelTrips } from "@/features/fuel/hooks";
import type { FuelTrip, FuelVehicle } from "@/features/fuel/types";
import {
  achievedKmPerLiter,
  computeTrip,
  hasTripErrors,
  validateTrip,
  vehicleLabel,
} from "@/features/fuel/lib";

const tripSchema = z.object({
  vehicleId: z.string().min(1, "Select the vehicle"),
  tripDate: z.date({ error: "Select the trip date" }),
  purpose: z.string().optional(),
  origin: z.string().optional(),
  destination: z.string().optional(),
  driver: z.string().optional(),
  passengers: z.string().optional(),
  noOfTrips: z.number({ error: "Enter the number of trips" }).int().min(1, "At least 1"),
  beginningOdometer: z.number({ error: "Enter Odometer OUT" }).min(0, "Cannot be negative"),
  endingOdometer: z.number({ error: "Enter Odometer IN" }).min(0, "Cannot be negative"),
  beginningFuel: z.number({ error: "Enter the beginning fuel" }).min(0, "Cannot be negative"),
  fuelAdded: z.number({ error: "Enter the fuel added" }).min(0, "Cannot be negative"),
  remarks: z.string().optional(),
  /** Required when correcting a finalized record; kept in its revisions. */
  correctionReason: z.string().optional(),
});

type TripValues = z.infer<typeof tripSchema>;

const toIsoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const litres = (n: number) => `${n.toFixed(2)} L`;

/** One read-only computed figure in the live summary strip. */
function Computed({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "danger";
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3">
      <OverlineLabel>{label}</OverlineLabel>
      <div
        className={
          "mt-0.5 text-[16px] font-semibold tabular-nums tracking-tight " +
          (tone === "danger" ? "text-red-600" : "text-neutral-900")
        }
      >
        {value}
      </div>
      {hint && <p className="mt-0.5 text-[11px] text-neutral-500">{hint}</p>}
    </div>
  );
}

/**
 * Trip entry. Distance, fuel used and the ending balance are never typed — they
 * are derived from the odometer pair and the vehicle's rated efficiency, using
 * the same formulas the database enforces on the stored row.
 */
export function FuelTripForm({
  open,
  onOpenChange,
  vehicle,
  vehicles,
  trip,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fixed vehicle when opened from a drawer or row; null to let the user pick. */
  vehicle?: FuelVehicle | null;
  /** Selectable registry, used when no fixed vehicle was supplied. */
  vehicles?: FuelVehicle[];
  /** Existing trip when editing; omit to record a new one. */
  trip?: FuelTrip | null;
  onSaved?: () => void;
}) {
  const isEdit = !!trip;
  const [submitting, setSubmitting] = React.useState(false);
  const pool = React.useMemo(
    () => (vehicles ?? []).filter((v) => v.status === "Active" || v.id === trip?.vehicleId),
    [vehicles, trip],
  );
  const needsPicker = !vehicle;
  /**
   * The caller passes the row it was opened from, which is a snapshot; the
   * registry holds the record as it stands now. Fuel balance moves with every
   * saved trip, so the live copy wins.
   */
  const fixedVehicle = React.useMemo(
    () => (vehicle ? ((vehicles ?? []).find((v) => v.id === vehicle.id) ?? vehicle) : null),
    [vehicle, vehicles],
  );

  const form = useForm<TripValues>({
    resolver: zodResolver(tripSchema),
    mode: "onTouched",
    defaultValues: {
      vehicleId: "",
      tripDate: new Date(),
      purpose: "",
      origin: "",
      destination: "",
      driver: "",
      passengers: "",
      noOfTrips: 1,
      beginningOdometer: 0,
      endingOdometer: 0,
      beginningFuel: 0,
      fuelAdded: 0,
      remarks: "",
      correctionReason: "",
    },
  });

  const carriedFrom = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const active = fixedVehicle ?? pool.find((v) => v.id === trip?.vehicleId) ?? null;
    form.reset({
      vehicleId: fixedVehicle?.id ?? trip?.vehicleId ?? "",
      tripDate: trip ? new Date(trip.tripDate) : new Date(),
      purpose: trip?.purpose ?? "",
      origin: trip?.origin ?? "",
      destination: trip?.destination ?? "",
      driver: trip?.driver ?? "",
      passengers: trip?.passengers ?? "",
      noOfTrips: trip?.noOfTrips ?? 1,
      beginningOdometer: trip?.beginningOdometer ?? 0,
      endingOdometer: trip?.endingOdometer ?? 0,
      beginningFuel: trip?.beginningFuel ?? active?.currentFuelBalance ?? 0,
      fuelAdded: trip?.fuelAdded ?? 0,
      remarks: trip?.remarks ?? "",
      correctionReason: "",
    });
    carriedFrom.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, trip, fixedVehicle]);

  const values = form.watch();
  const selected = React.useMemo(
    () => fixedVehicle ?? pool.find((v) => v.id === values.vehicleId) ?? null,
    [fixedVehicle, pool, values.vehicleId],
  );

  // The vehicle's own trips, newest first — the last one supplies the odometer
  // the next trip departs on.
  const activeVehicleId = fixedVehicle?.id ?? values.vehicleId;
  const vehicleTrips = useFuelTrips(
    React.useMemo(
      () => ({ vehicleId: activeVehicleId || "__none__" }),
      [activeVehicleId],
    ),
  );
  /**
   * The previous trip of *this* vehicle. The rows are matched on vehicleId and
   * read only once the query has settled: while a new vehicle's trips are still
   * loading the hook still holds the previously opened vehicle's rows, and
   * carrying those forward would seed one vehicle's odometer from another's.
   */
  const lastTrip = React.useMemo(
    () =>
      vehicleTrips.loading
        ? null
        : (vehicleTrips.data.find(
            (t) => t.vehicleId === activeVehicleId && t.id !== trip?.id,
          ) ?? null),
    [vehicleTrips.loading, vehicleTrips.data, activeVehicleId, trip?.id],
  );

  // A new trip departs from the vehicle's current state: the odometer it came
  // back on, and the fuel actually left in its tank.
  React.useEffect(() => {
    if (isEdit || !open || !activeVehicleId || vehicleTrips.loading) return;
    const key = `${activeVehicleId}:${lastTrip?.id ?? "none"}`;
    if (carriedFrom.current === key) return;
    carriedFrom.current = key;
    const picked = fixedVehicle ?? pool.find((v) => v.id === activeVehicleId);
    if (picked) form.setValue("beginningFuel", picked.currentFuelBalance);
    // A vehicle with no history starts at zero rather than inheriting a reading.
    const start = lastTrip?.endingOdometer ?? 0;
    form.setValue("beginningOdometer", start);
    form.setValue("endingOdometer", start);
  }, [open, isEdit, activeVehicleId, vehicleTrips.loading, lastTrip, fixedVehicle, pool, form]);

  // Efficiency is snapshotted onto the trip, so an edited vehicle rating never
  // rewrites history: an existing trip keeps the rate it was recorded with.
  const kmPerLiter = trip?.kmPerLiter ?? selected?.kmPerLiter ?? 0;

  const input = {
    beginningOdometer: num(values.beginningOdometer),
    endingOdometer: num(values.endingOdometer),
    kmPerLiter,
    beginningFuel: num(values.beginningFuel),
    fuelAdded: num(values.fuelAdded),
  };
  const computed = computeTrip(input);
  const check = validateTrip(
    { ...input, vehicleId: values.vehicleId },
    computed,
    selected?.tankCapacity ?? 0,
  );
  const achieved = achievedKmPerLiter(computed.distance, computed.fuelUsed);
  const blocked = hasTripErrors(check);

  const submit = form.handleSubmit(async (v) => {
    if (isEdit && !v.correctionReason?.trim()) {
      form.setError("correctionReason", { message: "Give the reason for this correction." });
      return;
    }
    if (blocked) {
      toast.error(Object.values(check.errors)[0] ?? "Please correct the trip details.");
      return;
    }
    setSubmitting(true);
    try {
      const payload: TripDraftInput = {
        vehicleId: fixedVehicle?.id ?? v.vehicleId,
        tripDate: toIsoDate(v.tripDate),
        purpose: v.purpose,
        origin: v.origin,
        destination: v.destination,
        driver: v.driver,
        passengers: v.passengers,
        noOfTrips: v.noOfTrips,
        source: trip?.source ?? "Manual",
        beginningOdometer: v.beginningOdometer,
        endingOdometer: v.endingOdometer,
        kmPerLiter,
        beginningFuel: v.beginningFuel,
        fuelAdded: v.fuelAdded,
        status: trip?.status ?? "Completed",
        remarks: v.remarks,
      };
      if (isEdit) {
        await correctFuelTrip(trip!.id, payload, v.correctionReason!.trim());
        toast.success(`Trip ${trip!.controlNo} corrected — the previous values are kept in its history`);
      } else {
        const saved = await createFuelTrip(payload);
        toast.success(`Trip ${saved.controlNo} recorded`);
      }
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save the trip");
    }
    setSubmitting(false);
  });

  const err = form.formState.errors;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} size="lg">
      <DrawerHeader
        title={isEdit ? `Correct Trip ${trip?.controlNo}` : "Add Trip"}
        description={
          selected
            ? `${vehicleLabel(selected)} · ${selected.plateNumber} · ${selected.kmPerLiter} km/L · ${selected.tankCapacity} L tank`
            : "Distance, fuel used and the ending balance are computed automatically."
        }
        onClose={() => onOpenChange(false)}
      />
      <DrawerBody>
        <div className="space-y-5">
          {/* ---- trip details ---- */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {needsPicker ? (
              <Field label="Vehicle" required error={err.vehicleId?.message}>
                <Controller
                  control={form.control}
                  name="vehicleId"
                  render={({ field }) => (
                    <SelectField
                      placeholder="Select vehicle…"
                      options={pool.map((v) => ({
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
            ) : (
              <Field label="Vehicle">
                <Input value={`${selected?.plateNumber ?? ""}`} readOnly disabled />
              </Field>
            )}
            <Field label="Trip Date" required error={err.tripDate?.message}>
              <Controller
                control={form.control}
                name="tripDate"
                render={({ field }) => (
                  <DatePicker
                    value={field.value}
                    onChange={field.onChange}
                    invalid={!!err.tripDate}
                  />
                )}
              />
            </Field>
            <Field label="No. of Trips" required error={err.noOfTrips?.message}>
              <Input
                type="number"
                min={1}
                step="1"
                invalid={!!err.noOfTrips}
                {...form.register("noOfTrips", { valueAsNumber: true })}
              />
            </Field>
          </div>

          <Field label="Purpose" error={err.purpose?.message}>
            <Input
              placeholder="e.g. Delivery of relief goods"
              {...form.register("purpose")}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="From" error={err.origin?.message}>
              <Input placeholder="e.g. Municipal Hall" {...form.register("origin")} />
            </Field>
            <Field label="To" error={err.destination?.message}>
              <Input placeholder="e.g. Brgy. San Roque" {...form.register("destination")} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Driver" error={err.driver?.message}>
              <Input placeholder="e.g. R. Delos Santos" {...form.register("driver")} />
            </Field>
            <Field label="Passengers" error={err.passengers?.message}>
              <Input placeholder="Optional — names or office" {...form.register("passengers")} />
            </Field>
          </div>

          {/* ---- odometer & fuel ---- */}
          <div className="space-y-4 rounded-lg border border-neutral-200 bg-neutral-50/60 p-4">
            <p className="text-[12px] font-semibold text-neutral-900">Odometer &amp; Fuel</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field
                label="Odometer OUT (km)"
                required
                error={err.beginningOdometer?.message}
                helper={
                  !isEdit && lastTrip ? `Last trip ended at ${lastTrip.endingOdometer}` : undefined
                }
              >
                <Input
                  type="number"
                  min={0}
                  step="1"
                  placeholder="0"
                  invalid={!!err.beginningOdometer}
                  {...form.register("beginningOdometer", { valueAsNumber: true })}
                />
              </Field>
              <Field
                label="Odometer IN (km)"
                required
                error={err.endingOdometer?.message ?? check.errors.endingOdometer}
                helper={`+${computed.distance.toFixed(2)} km on the odometer`}
              >
                <Input
                  type="number"
                  min={0}
                  step="1"
                  placeholder="0"
                  invalid={!!err.endingOdometer || !!check.errors.endingOdometer}
                  {...form.register("endingOdometer", { valueAsNumber: true })}
                />
              </Field>
              <Field
                label="Beginning Fuel (L)"
                required
                error={err.beginningFuel?.message}
                helper={isEdit ? undefined : "From the vehicle's balance"}
              >
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  invalid={!!err.beginningFuel}
                  {...form.register("beginningFuel", { valueAsNumber: true })}
                />
              </Field>
              <Field label="Fuel Added (L)" required error={err.fuelAdded?.message}>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  invalid={!!err.fuelAdded}
                  {...form.register("fuelAdded", { valueAsNumber: true })}
                />
              </Field>
            </div>

            {/* Computed figures — read-only by design */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Computed
                label="Total KM Travelled"
                value={`${computed.distance.toFixed(2)} km`}
                hint="Odometer IN − OUT"
              />
              <Computed
                label="Total Fuel"
                value={litres(computed.fuelTotal)}
                hint="Beginning + Added"
              />
              <Computed
                label="Fuel Used"
                value={litres(computed.fuelUsed)}
                hint={kmPerLiter > 0 ? `Distance ÷ ${kmPerLiter} km/L` : "Set the vehicle's km/L"}
              />
              <Computed
                label="Ending Fuel"
                value={litres(computed.endingFuel)}
                hint={
                  check.errors.endingFuel ??
                  (achieved ? `${achieved} km/L achieved` : "Total − Used")
                }
                tone={check.errors.endingFuel ? "danger" : "neutral"}
              />
            </div>

            {check.warnings.map((w) => (
              <div
                key={w}
                className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800"
              >
                <AlertTriangle className="mt-px size-3.5 shrink-0" />
                <span>{w}</span>
              </div>
            ))}
          </div>

          <Field label="Remarks" error={err.remarks?.message}>
            <Textarea
              rows={3}
              placeholder="Optional — e.g. detour due to road closure"
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
          <Button onClick={submit} loading={submitting} disabled={blocked}>
            <Save />
            {isEdit ? "Save Correction" : "Save Trip"}
          </Button>
        </DrawerActions>
      </DrawerFooter>
    </Drawer>
  );
}
