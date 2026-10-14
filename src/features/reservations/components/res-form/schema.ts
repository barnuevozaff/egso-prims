import { z } from "zod";

// Equipment is typed by hand: the office has no settled list yet.
export const resEquipmentSchema = z.object({
  equipmentId: z.string().trim().min(2, "Name the equipment"),
  quantity: z.number({ error: "Enter a quantity" }).positive("Must be more than 0"),
  remarks: z.string().optional(),
});

export const resFormSchema = z
  .object({
    borrower: z.string().trim().min(3, "Enter the borrower's name"),
    departmentCode: z.string().trim().min(2, "Select the requesting office"),
    contactNumber: z
      .string()
      .refine((v) => v.replace(/\D/g, "").length >= 7, "Enter a contact number"),
    purpose: z.string().trim().min(10, "Describe the activity (at least 10 characters)"),
    // Typed by hand too, until the office settles its list of facilities.
    facilityId: z.string().trim().min(3, "Type the facility"),
    date: z.date({ error: "Pick the reservation date" }),
    startTime: z.string().min(1, "Pick a time"),
    endTime: z.string().min(1, "Pick a time"),
    equipment: z.array(resEquipmentSchema),
  })
  .refine((v) => !v.startTime || !v.endTime || v.startTime < v.endTime, {
    message: "End time must be after the start time",
    path: ["endTime"],
  });

export type ResFormValues = z.infer<typeof resFormSchema>;
