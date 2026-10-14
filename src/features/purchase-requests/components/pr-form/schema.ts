import { z } from "zod";

import { FUNDING_SOURCES } from "@/features/purchase-requests/types";

export const prItemSchema = z.object({
  description: z.string().min(3, "Describe the item"),
  quantity: z
    .number({ error: "Required" })
    .positive("Must be more than 0"),
  unit: z.string().min(1, "Unit"),
  estimatedCost: z
    .number({ error: "Required" })
    .positive("Must be more than 0"),
});

export const prFormSchema = z.object({
  departmentCode: z.string().min(1, "Choose the requesting office"),
  requester: z.string().min(3, "Enter the requester's name"),
  purpose: z.string().min(10, "Describe the purpose (at least 10 characters)"),
  requestDate: z.date({ error: "Pick the request date" }),
  fundingSource: z.enum(FUNDING_SOURCES, { error: "Select a funding source" }),
  items: z.array(prItemSchema).min(1, "Add at least one item"),
});

export type PRFormValues = z.infer<typeof prFormSchema>;
