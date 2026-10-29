import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save } from "lucide-react";

import { Button, Combobox, ContainerCard, Field, Input } from "@/components";
import type { ItemDraftInput } from "@/features/inventory/api";
import { canonicalCategory, isNewCategory } from "@/features/inventory/categories";
import { useInventoryCategories } from "@/features/inventory/hooks";
import { unitFromItemName } from "@/features/inventory/smart-import/units";
import type { InventoryItem } from "@/features/inventory/types";
import { useConfigOptions } from "@/features/config/use-module-config";

/**
 * Add / edit one inventory item on a single page: Item Name, Category, Unit
 * of Measure, Quantity and Unit Price — then Save Item (24 Oct 2026). No
 * steps, attachments, location, supplier or stock levels. The item code is
 * issued by the server on save and never typed. On an existing item the
 * stock on hand is shown, not edited: stock changes only through Add Stocks
 * and approved RIS.
 */

const schema = z.object({
  name: z.string().trim().min(2, "Enter the item name"),
  category: z.string().trim().min(1, "Choose or type a category"),
  unit: z.string().trim().min(1, "Choose the unit of measure"),
  quantity: z.number({ error: "Enter the quantity (0 if none yet)" }).min(0, "Cannot be negative"),
  unitPrice: z.number({ error: "Enter the unit price (0 if none)" }).min(0, "Cannot be negative"),
});

type Values = z.infer<typeof schema>;

/** Number inputs: a blank optional field is "not set", not 0. */
const asNumber = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : Number(v));

export interface InvItemFormProps {
  initial?: InventoryItem;
  submitting: boolean;
  onSubmit: (input: ItemDraftInput) => void | Promise<void>;
  onCancel: () => void;
  /** Items on the register, for the category and unit lists. */
  existing?: InventoryItem[];
}

export function InvItemForm({ initial, submitting, onSubmit, onCancel, existing = [] }: InvItemFormProps) {
  const isEdit = !!initial;
  const { categories } = useInventoryCategories(existing);
  const { options: configuredUnits } = useConfigOptions("Procurement", "item_units");
  const units = React.useMemo(
    () => [...new Set([...configuredUnits, ...existing.map((i) => i.unit)].filter(Boolean))].sort(),
    [configuredUnits, existing],
  );
  // One ID per form: a retry after a dropped connection saves the item once.
  const requestId = React.useRef(crypto.randomUUID());
  // Once the unit is picked by hand, the name stops suggesting one.
  const unitTouched = React.useRef(isEdit);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: initial
      ? {
          name: initial.name,
          category: initial.category,
          unit: initial.unit,
          quantity: initial.onHand,
          unitPrice: initial.unitPrice,
        }
      : { name: "", category: "", unit: "pc", quantity: 0, unitPrice: 0 },
  });
  const { register, control, setValue, watch, formState } = form;
  const err = formState.errors;
  const category = watch("category") ?? "";
  const newCategory = !!category.trim() && isNewCategory(category, categories);

  const submit = form.handleSubmit(async (v) => {
    await onSubmit({
      requestId: requestId.current,
      name: v.name.trim(),
      category: canonicalCategory(v.category, categories),
      unit: v.unit.trim(),
      beginningBalance: v.quantity,
      unitPrice: Math.round(v.unitPrice * 100) / 100,
    });
  });

  return (
    <ContainerCard className="mx-auto w-full max-w-3xl">
      <form onSubmit={submit} noValidate>
        <div className="grid grid-cols-1 gap-x-4 gap-y-4 px-5 py-5 sm:grid-cols-2 sm:px-6">
          <Field label="Item Name" required error={err.name?.message}>
            <Input
              placeholder="e.g. Correction tape"
              autoComplete="off"
              invalid={!!err.name}
              {...register("name", {
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                  const guess = unitFromItemName(e.target.value);
                  if (guess && !unitTouched.current) setValue("unit", guess);
                },
              })}
            />
          </Field>
          <Field
            label="Category"
            required
            error={err.category?.message}
            helper={newCategory ? "New category — it will be offered for future items." : undefined}
          >
            <Controller
              control={control}
              name="category"
              render={({ field }) => (
                <Combobox
                  allowCustomValue
                  placeholder="Choose or type a category…"
                  searchPlaceholder="Search or type a new category…"
                  emptyText="Type a name to add a new category."
                  options={categories.map((c) => ({ value: c, label: c }))}
                  value={field.value || undefined}
                  onChange={field.onChange}
                  invalid={!!err.category}
                />
              )}
            />
          </Field>

          <Field label="Unit of Measure" required error={err.unit?.message}>
            <Controller
              control={control}
              name="unit"
              render={({ field }) => (
                <Combobox
                  allowCustomValue
                  placeholder="Choose a unit…"
                  searchPlaceholder="Search units…"
                  emptyText="Type a unit to use it."
                  options={units.map((u) => ({ value: u, label: u }))}
                  value={field.value || undefined}
                  onChange={(v) => {
                    unitTouched.current = true;
                    field.onChange(v);
                  }}
                  invalid={!!err.unit}
                />
              )}
            />
          </Field>
          <Field
            label={isEdit ? "Stock on Hand" : "Quantity"}
            required={!isEdit}
            error={err.quantity?.message}
            helper={
              isEdit
                ? "Changes only through Add Stocks and approved RIS."
                : "Opening stock now on the shelf. 0 is allowed."
            }
          >
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              disabled={isEdit}
              invalid={!!err.quantity}
              className="tabular-nums"
              {...register("quantity", { setValueAs: asNumber })}
            />
          </Field>

          <Field label="Unit Price (₱)" required error={err.unitPrice?.message}>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              invalid={!!err.unitPrice}
              className="tabular-nums"
              {...register("unitPrice", { setValueAs: asNumber })}
            />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#ececea] px-5 py-4 sm:px-6">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            <Save />
            Save Item
          </Button>
        </div>
      </form>
    </ContainerCard>
  );
}
