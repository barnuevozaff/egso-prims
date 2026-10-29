import { z } from "zod";

import { FUNDING_SOURCES } from "@/features/purchase-requests/types";

// Each message says what to do, so the summary's list reads on its own (21 Oct 2026).
export const prItemSchema = z.object({
  description: z.string().trim().min(3, "Describe the item"),
  quantity: z
    .number({ error: "Enter the quantity" })
    .positive("Quantity must be more than 0"),
  unit: z.string().min(1, "Choose the unit"),
  estimatedCost: z
    .number({ error: "Enter the unit cost" })
    .positive("Unit cost must be more than 0"),
});

/*
 * The requester gives the office, their name, the purpose (restored as
 * required, 21 Oct 2026: the official form prints it) and the items. Fund,
 * Section and FPP are optional and print as blanks until completed.
 *
 * Editing an existing request does not require the purpose, so a request
 * saved without one stays editable; it still cannot be approved without it
 * (approvePurchaseRequest).
 */
const purposeText = z.string().max(2000, "Keep the purpose under 2,000 characters");

const baseSchema = z.object({
  departmentCode: z.string().min(1, "Choose the requesting office"),
  requester: z.string().trim().min(3, "Enter the requester's name"),
  purpose: purposeText,
  requestDate: z.date({ error: "Pick the request date" }),
  fundingSource: z.union([z.enum(FUNDING_SOURCES), z.literal("")]),
  section: z.string().max(100, "Keep it under 100 characters"),
  fpp: z.string().max(100, "Keep it under 100 characters"),
  items: z.array(prItemSchema).min(1, "Add at least one item"),
  // Item group headings were removed from the form (21 Oct 2026); headings
  // already stored on a request are kept and still print.
});

/** A new request: the purpose is required, and spaces alone do not count. */
export const prFormSchema = baseSchema.extend({
  purpose: purposeText.refine((v) => v.trim().length > 0, "Enter the purpose of this request"),
});

/** Editing an existing request: the purpose may still be blank. */
export const prEditSchema = baseSchema;

export type PRFormValues = z.infer<typeof baseSchema>;
