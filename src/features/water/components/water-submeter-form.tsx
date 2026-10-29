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
  createWaterSubmeter,
  updateWaterSubmeter,
  type SubmeterDraftInput,
} from "@/features/water/api";
import {
  SUBMETER_STATUSES,
  type SubmeterStatus,
  type WaterAccount,
  type WaterSubmeter,
} from "@/features/water/types";
import { accountLabel } from "@/features/water/lib";
import { useOfficeOptions } from "@/features/offices/use-offices";

const submeterSchema = z.object({
  submeterName: z.string().min(3, "Enter the submeter name"),
  submeterNumber: z.string().min(3, "Enter the submeter number"),
  assignedOffice: z.string().min(1, "Select the assigned office"),
  assignedDepartment: z.string().optional(),
  assignedFacility: z.string().optional(),
  assignedUser: z.string().optional(),
  remarks: z.string().optional(),
  status: z.enum(["Active", "Archived"]),
});

type SubmeterValues = z.infer<typeof submeterSchema>;

/** Right slide-over for adding or editing a submeter under a water account. */
export function WaterSubmeterForm({
  open,
  onOpenChange,
  account,
  submeter,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Parent account the submeter belongs to. */
  account: WaterAccount | null;
  /** Existing submeter when editing; omit to create. */
  submeter?: WaterSubmeter | null;
  onSaved?: () => void;
}) {
  const isEdit = !!submeter;
  const [submitting, setSubmitting] = React.useState(false);

  const form = useForm<SubmeterValues>({
    resolver: zodResolver(submeterSchema),
    mode: "onTouched",
    defaultValues: {
      submeterName: "",
      submeterNumber: "",
      assignedOffice: "",
      assignedDepartment: "",
      assignedFacility: "",
      assignedUser: "",
      remarks: "",
      status: "Active",
    },
  });
  // The office directory, keeping an office this record already holds (29 Oct 2026).
  const { options: officeOptions } = useOfficeOptions(form.watch("assignedOffice"));

  React.useEffect(() => {
    if (!open) return;
    form.reset({
      submeterName: submeter?.submeterName ?? "",
      submeterNumber: submeter?.submeterNumber ?? "",
      assignedOffice: submeter?.assignedOffice ?? "",
      assignedDepartment: submeter?.assignedDepartment ?? "",
      assignedFacility: submeter?.assignedFacility ?? "",
      assignedUser: submeter?.assignedUser ?? "",
      remarks: submeter?.remarks ?? "",
      status: submeter?.status ?? "Active",
    });
  }, [open, submeter, form]);

  const submit = form.handleSubmit(async (values) => {
    if (!account) return;
    setSubmitting(true);
    try {
      const input: Omit<SubmeterDraftInput, "accountId"> = {
        ...values,
        status: values.status as SubmeterStatus,
      };
      const saved = isEdit
        ? await updateWaterSubmeter(submeter!.id, input)
        : await createWaterSubmeter({ accountId: account.id, ...input });
      toast.success(isEdit ? `${saved.submeterNumber} updated` : `${saved.submeterNumber} added`);
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save the submeter");
    }
    setSubmitting(false);
  });

  const err = form.formState.errors;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} size="md">
      <DrawerHeader
        title={isEdit ? `Edit ${submeter?.submeterNumber}` : "New Submeter"}
        description={
          account ? `Under ${accountLabel(account)} · ${account.accountNumber}` : undefined
        }
        onClose={() => onOpenChange(false)}
      />
      <DrawerBody>
        <div className="space-y-4">
          <Field label="Submeter Name" required error={err.submeterName?.message}>
            <Input
              placeholder="e.g. Main Line — Ground Floor"
              invalid={!!err.submeterName}
              {...form.register("submeterName")}
            />
          </Field>
          <Field label="Submeter Number" required error={err.submeterNumber?.message}>
            <Input
              placeholder="e.g. WSUB-001-01"
              invalid={!!err.submeterNumber}
              {...form.register("submeterNumber")}
            />
          </Field>
          {/* Assignment — office is required, the rest narrow it down */}
          <Field label="Assigned Office" required error={err.assignedOffice?.message}>
            <Controller
              control={form.control}
              name="assignedOffice"
              render={({ field }) => (
                <SelectField
                  placeholder="Select office…"
                  options={officeOptions}
                  value={field.value || undefined}
                  onChange={field.onChange}
                  invalid={!!err.assignedOffice}
                />
              )}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Assigned Department"
              helper="Optional — the section within the office."
              error={err.assignedDepartment?.message}
            >
              <Input
                placeholder="e.g. Building Maintenance"
                {...form.register("assignedDepartment")}
              />
            </Field>
            <Field
              label="Assigned User"
              helper="Optional — the person accountable."
              error={err.assignedUser?.message}
            >
              <Input placeholder="e.g. M. Villanueva" {...form.register("assignedUser")} />
            </Field>
          </div>
          <Field
            label="Assigned Facility"
            helper="Optional — the building or area this submeter serves."
            error={err.assignedFacility?.message}
          >
            <Input
              placeholder="e.g. Main Building, Utility Area"
              {...form.register("assignedFacility")}
            />
          </Field>
          <Field label="Status" required error={err.status?.message}>
            <Controller
              control={form.control}
              name="status"
              render={({ field }) => (
                <SelectField
                  options={SUBMETER_STATUSES.map((s) => ({ value: s, label: s }))}
                  value={field.value || undefined}
                  onChange={field.onChange}
                  invalid={!!err.status}
                />
              )}
            />
          </Field>
          <Field
            label="Remarks"
            helper="Optional — e.g. the area or outlet this submeter serves."
            error={err.remarks?.message}
          >
            <Textarea
              rows={3}
              placeholder="Optional — e.g. comfort rooms and utility area"
              {...form.register("remarks")}
            />
          </Field>
          {isEdit && submeter?.status === "Archived" && (
            <p className="rounded-lg bg-neutral-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-neutral-500">
              This submeter is archived. Its billing history is preserved and still appears in
              reports, but it no longer counts toward the account's live totals.
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
            {isEdit ? "Save Changes" : "Add Submeter"}
          </Button>
        </DrawerActions>
      </DrawerFooter>
    </Drawer>
  );
}
