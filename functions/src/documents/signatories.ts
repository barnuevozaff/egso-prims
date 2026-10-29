/**
 * The signatory blocks of the official forms (21 Oct 2026). Each role and its
 * designation are fixed by the form; only the printed name of the person in
 * the post is a setting (Settings → Purchase Request / Purchase Order
 * signatories). The app keeps the same roles (src/features/config/types.ts,
 * SIGNATORY_ROLES).
 *
 * Purchase Request: Requested by — General Services Officer; Cash
 * Availability — Municipal Treasurer; Approved by — Municipal Mayor.
 * Purchase Order: Very truly yours — Municipal Mayor; Certified Correct — BAC
 * Secretary. The PO's supplier Conforme is signed by hand and is no setting.
 */

/** The document ID the Settings page uses (src/features/config/api.firebase.ts). */
export const settingId = (category: string, key: string) =>
  `cfg-${category.toLowerCase().replace(/\s+/g, "-")}-${key.replace(/_/g, "-")}`;

export const PR_SIGNATORY_KEYS = {
  requestedBy: settingId("Signatories", "pr_requested_by_name"),
  cashAvailability: settingId("Signatories", "pr_cash_availability_name"),
  approvedBy: settingId("Signatories", "pr_approved_by_name"),
};

export const PR_DESIGNATIONS = {
  requestedBy: "General Services Officer",
  cashAvailability: "Municipal Treasurer",
  approvedBy: "Municipal Mayor",
};

export const PO_SIGNATORY_KEYS = {
  approvedBy: settingId("PO Signatories", "po_approving_name"),
  bacSecretary: settingId("PO Signatories", "po_bac_secretary_name"),
};

export const PO_DESIGNATIONS = {
  approvedBy: "Municipal Mayor",
  bacSecretary: "BAC Secretary",
};
