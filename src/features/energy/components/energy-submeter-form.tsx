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
  createEnergySubmeter,
  updateEnergySubmeter,
  type SubmeterDraftInput,
} from "@/features/energy/api";
import {
  SUBMETER_STATUSES,
  type EnergyAccount,
  type EnergySubmeter,
  type SubmeterStatus,
} from "@/features/energy/types";
import { accountLabel } from "@/features/energy/lib";
import { useOfficeOptions } from "@/features/offices/use-offices";

const submeterSchema = z.object({
  submeterName: z.string().min(3, "Enter the submeter name"),
  submeterNumber: z.string().min(3, "Enter the submeter number"),
  officeCode: z.string().min(1, "Select the assigned office"),
  assignedUser: z.string().optional(),
  status: z.enum(["Active", "Inactive"]),
});

type SubmeterValues = z.infer<typeof submeterSchema>;

/** Right slide-over for adding or editing a submeter under an energy account. */
export function EnergySubmeterForm({
  open,
  onOpenChange,
  account,
  submeter,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Parent account the submeter belongs to. */
  account: EnergyAccount | null;
  /** Existing submeter when editing; omit to create. */
  submeter?: EnergySubmeter | null;
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
      officeCode: "",
      assignedUser: "",
      status: "Active",
    },
  });
  // The office directory, keeping an office this record already holds (29 Oct 2026).
  const { options: officeOptions } = useOfficeOptions(form.watch("officeCode"));

  React.useEffect(() => {
    if (!open) return;
    form.reset({
      submeterName: submeter?.submeterName ?? "",
      submeterNumber: submeter?.submeterNumber ?? "",
      officeCode: submeter?.officeCode ?? "",
      assignedUser: submeter?.assignedUser ?? "",
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
        ? await updateEnergySubmeter(submeter!.id, input)
        : await createEnergySubmeter({ accountId: account.id, ...input });
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
        description={account ? `Under ${accountLabel(account)} · ${account.accountNumber}` : undefined}
        onClose={() => onOpenChange(false)}
      />
      <DrawerBody>
        <div className="space-y-4">
          <Field label="Submeter Name" required error={err.submeterName?.message}>
            <Input
              placeholder="e.g. Engineering — Second Floor"
              invalid={!!err.submeterName}
              {...form.register("submeterName")}
            />
          </Field>
          <Field label="Submeter Number" required error={err.submeterNumber?.message}>
            <Input
              placeholder="e.g. SUB-001-01"
              invalid={!!err.submeterNumber}
              {...form.register("submeterNumber")}
            />
          </Field>
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
            <Field
              label="Assigned User"
              helper="Optional — the person accountable for this submeter."
              error={err.assignedUser?.message}
            >
              <Input placeholder="e.g. M. Villanueva" {...form.register("assignedUser")} />
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
            {isEdit ? "Save Changes" : "Add Submeter"}
          </Button>
        </DrawerActions>
      </DrawerFooter>
    </Drawer>
  );
}
