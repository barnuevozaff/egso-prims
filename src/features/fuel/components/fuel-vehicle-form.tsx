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
  toast,
} from "@/components";
import {
  createFuelVehicle,
  updateFuelVehicle,
  type VehicleDraftInput,
} from "@/features/fuel/api";
import {
  FUEL_TYPES,
  VEHICLE_STATUSES,
  VEHICLE_TYPES,
  type FuelVehicle,
  type VehicleStatus,
} from "@/features/fuel/types";
import { useOfficeOptions } from "@/features/offices/use-offices";

const vehicleSchema = z.object({
  vehicleName: z.string().min(3, "Enter the vehicle name"),
  plateNumber: z.string().min(3, "Enter the plate number"),
  vehicleType: z.string().min(1, "Select the vehicle type"),
  officeCode: z.string().min(1, "Select the assigned office"),
  fuelType: z.string().min(1, "Select the fuel type"),
  tankCapacity: z
    .number({ error: "Enter the tank capacity" })
    .positive("Must be more than 0"),
  kmPerLiter: z
    .number({ error: "Enter the fuel efficiency" })
    .positive("Must be more than 0"),
  currentFuelBalance: z
    .number({ error: "Enter the current fuel balance" })
    .min(0, "Cannot be negative"),
  status: z.enum(["Active", "Inactive"]),
});

type VehicleValues = z.infer<typeof vehicleSchema>;

/** Right slide-over for registering or editing a government vehicle. */
export function FuelVehicleForm({
  open,
  onOpenChange,
  vehicle,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing vehicle when editing; omit to create. */
  vehicle?: FuelVehicle | null;
  onSaved?: () => void;
}) {
  const isEdit = !!vehicle;
  const [submitting, setSubmitting] = React.useState(false);

  const form = useForm<VehicleValues>({
    resolver: zodResolver(vehicleSchema),
    mode: "onTouched",
    defaultValues: {
      vehicleName: "",
      plateNumber: "",
      vehicleType: "",
      officeCode: "",
      fuelType: "",
      tankCapacity: 0,
      kmPerLiter: 0,
      currentFuelBalance: 0,
      status: "Active",
    },
  });
  // The office directory, keeping an office this record already holds (29 Oct 2026).
  const { options: officeOptions } = useOfficeOptions(form.watch("officeCode"));

  React.useEffect(() => {
    if (!open) return;
    form.reset({
      vehicleName: vehicle?.vehicleName ?? "",
      plateNumber: vehicle?.plateNumber ?? "",
      vehicleType: vehicle?.vehicleType ?? "",
      officeCode: vehicle?.officeCode ?? "",
      fuelType: vehicle?.fuelType ?? "",
      tankCapacity: vehicle?.tankCapacity ?? 0,
      kmPerLiter: vehicle?.kmPerLiter ?? 0,
      currentFuelBalance: vehicle?.currentFuelBalance ?? 0,
      status: vehicle?.status ?? "Active",
    });
  }, [open, vehicle, form]);

  const submit = form.handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      const input: VehicleDraftInput = { ...values, status: values.status as VehicleStatus };
      const saved = isEdit
        ? await updateFuelVehicle(vehicle!.id, input)
        : await createFuelVehicle(input);
      toast.success(isEdit ? `${saved.plateNumber} updated` : `${saved.plateNumber} registered`);
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save the vehicle");
    }
    setSubmitting(false);
  });

  const err = form.formState.errors;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} size="md">
      <DrawerHeader
        title={isEdit ? `Edit ${vehicle?.plateNumber}` : "New Vehicle"}
        description="Government vehicles are registered manually by the administrator."
        onClose={() => onOpenChange(false)}
      />
      <DrawerBody>
        <div className="space-y-4">
          <Field label="Vehicle Name" required error={err.vehicleName?.message}>
            <Input
              placeholder="e.g. Toyota Hilux — Mayor's Service"
              invalid={!!err.vehicleName}
              {...form.register("vehicleName")}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Plate Number" required error={err.plateNumber?.message}>
              <Input
                placeholder="e.g. SAA 1101"
                invalid={!!err.plateNumber}
                {...form.register("plateNumber")}
              />
            </Field>
            <Field label="Vehicle Type" required error={err.vehicleType?.message}>
              <Controller
                control={form.control}
                name="vehicleType"
                render={({ field }) => (
                  <SelectField
                    placeholder="Select type…"
                    options={VEHICLE_TYPES.map((t) => ({ value: t, label: t }))}
                    value={field.value || undefined}
                    onChange={field.onChange}
                    invalid={!!err.vehicleType}
                  />
                )}
              />
            </Field>
          </div>
          <Field label="Assigned Office / Department" required error={err.officeCode?.message}>
            <Controller
              control={form.control}
              name="officeCode"
              render={({ field }) => (
                <SelectField
                  placeholder="Select office…"
                  options={officeOptions}
                  value={field.value || undefined}
                  onChange={field.onChange}
                  invalid={!!err.officeCode}
                />
              )}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
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
            <Field label="Status" required error={err.status?.message}>
              <Controller
                control={form.control}
                name="status"
                render={({ field }) => (
                  <SelectField
                    options={VEHICLE_STATUSES.map((s) => ({ value: s, label: s }))}
                    value={field.value || undefined}
                    onChange={field.onChange}
                    invalid={!!err.status}
                  />
                )}
              />
            </Field>
          </div>

          {/* Fuel configuration — every trip computation reads these figures. */}
          <div className="space-y-4 rounded-lg border border-neutral-200 bg-neutral-50/60 p-4">
            <p className="text-[12px] font-semibold text-neutral-900">Fuel Configuration</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Tank Capacity (L)" required error={err.tankCapacity?.message}>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 70"
                  invalid={!!err.tankCapacity}
                  {...form.register("tankCapacity", { valueAsNumber: true })}
                />
              </Field>
              <Field
                label="Fuel Efficiency (KM/L)"
                required
                error={err.kmPerLiter?.message}
                helper="Used to compute fuel consumed on every trip."
              >
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 10"
                  invalid={!!err.kmPerLiter}
                  {...form.register("kmPerLiter", { valueAsNumber: true })}
                />
              </Field>
            </div>
            <Field
              label="Current Fuel Balance (L)"
              required
              error={err.currentFuelBalance?.message}
              helper="Loaded as the beginning fuel of the next trip."
            >
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 35"
                invalid={!!err.currentFuelBalance}
                {...form.register("currentFuelBalance", { valueAsNumber: true })}
              />
            </Field>
          </div>
        </div>
      </DrawerBody>
      <DrawerFooter>
        <DrawerActions>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} loading={submitting}>
            <Save />
            {isEdit ? "Save Changes" : "Register Vehicle"}
          </Button>
        </DrawerActions>
      </DrawerFooter>
    </Drawer>
  );
}
