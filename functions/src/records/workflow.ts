import { HttpsError } from "firebase-functions/v2/https";

/**
 * How a Records Management form moves (30 Oct 2026), the same table the
 * screen offers its actions from (src/features/records/workflow.ts). Status
 * used to be a field the form sent as it liked, so a draft could be saved
 * straight as Approved; now a move the screen does not offer is refused here.
 *
 * Draft → Submitted → Approved, or Returned for revision and submitted again.
 * Saving without moving keeps the status. Voiding has its own function.
 */
export const NEXT_STATUS: Record<string, readonly string[]> = {
  New: ["Draft", "Submitted"],
  Draft: ["Draft", "Submitted"],
  Returned: ["Returned", "Submitted"],
  Submitted: ["Submitted", "Approved", "Returned"],
  Approved: ["Approved", "Returned"],
};

const NEXT_HINT: Record<string, string> = {
  New: "A new form is kept as a draft or submitted for approval.",
  Draft: "A draft is submitted for approval first.",
  Returned: "A returned form is submitted again first.",
  Submitted: "A submitted form is approved or returned for revision.",
  Approved: "An approved form stays approved or is returned for revision.",
};

/** `from` is the saved status, or "New" for a form not saved yet; `what` names it in the message. */
export function assertStatusMove(from: string, to: string, what: string): void {
  if ((NEXT_STATUS[from] ?? []).includes(to)) return;
  throw new HttpsError(
    "failed-precondition",
    `${from === "New" ? `${what} cannot be saved as ${to} when it is first made.` : `${what} is ${from} and cannot go to ${to}.`} ${NEXT_HINT[from] ?? "Its status cannot be changed here."}`,
  );
}

const NOT_PLACEABLE: Record<string, string> = {
  Draft: "is a draft: it is placed once it has been submitted and approved",
  Submitted: "is waiting for approval: it is placed once it is approved",
  Returned: "was returned for revision: it is placed once it is approved",
  Cancelled: "is voided: a voided form is not filed or moved",
};

/**
 * Only an approved form is placed in a box, or moved to another (30 Oct
 * 2026). Every other status is refused with the reason and the next step.
 */
export function assertPlaceable(status: string, number: string): void {
  if (status === "Approved") return;
  throw new HttpsError(
    "failed-precondition",
    `${number} ${NOT_PLACEABLE[status] ?? `is ${status || "not approved"}: only an approved document is placed in the Records Room`}.`,
  );
}
