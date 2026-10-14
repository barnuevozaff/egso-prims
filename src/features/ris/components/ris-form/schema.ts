import { z } from "zod";

export const risItemSchema = z.object({
  /** What the requester asked for, typed by hand. */
  name: z.string().min(2, "Name the item"),
  /** Set when the typed name matches the stock register. */
  inventoryItemId: z.string().optional(),
  unit: z.string().min(1, "Pick a unit"),
  requestedQty: z.number({ error: "Enter the quantity" }).positive("Must be more than 0"),
  /**
   * Set by GSO on the admin form; the portal does not ask, and the slip
   * starts from the requested quantity. The form checks it on the admin side.
   */
  issuedQty: z
    .number({ error: "Enter the quantity to issue" })
    .positive("Must be more than 0")
    .optional(),
});

export const risFormSchema = z.object({
  /** Absent on portal submissions, which do not start from a request. */
  prNumber: z.string().optional(),
  poNumber: z.string().optional(),
  requester: z.string().min(3, "Enter who is requesting"),
  departmentCode: z.string().min(2, "Enter the office"),
  fund: z.string().optional(),
  division: z.string().optional(),
  fppCode: z.string().optional(),
  purpose: z.string().min(3, "State what the items are for"),
  items: z.array(risItemSchema).min(1, "Add at least one item"),
});

export type RISFormValues = z.infer<typeof risFormSchema>;
