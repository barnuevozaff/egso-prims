import type { RecordsDocStatus, ScheduleStatus } from "@/features/records/types";

/**
 * How a Records Management form moves (30 Oct 2026). Status is no longer a
 * free choice on the form: each step is an action — submit, approve, return —
 * and only these moves are allowed. saveRecordsDocument holds the same table,
 * so a move the screen does not offer is refused there as well.
 *
 * Draft → Submitted → Approved, or back to Returned for revision; a returned
 * form is submitted again. An approved form can be corrected and stays
 * approved, or returned, which takes it out of its box in the Records Room.
 */
export const NEXT_STATUS: Record<ScheduleStatus | "New", ScheduleStatus[]> = {
  New: ["Draft", "Submitted"],
  Draft: ["Draft", "Submitted"],
  Returned: ["Returned", "Submitted"],
  Submitted: ["Submitted", "Approved", "Returned"],
  Approved: ["Approved", "Returned"],
};

export interface RecordAction {
  to: ScheduleStatus;
  label: string;
  /** primary: the next step; secondary: save without moving; back: return for revision. */
  kind: "primary" | "secondary" | "back";
  /** Approving and returning are asked first. */
  confirm?: { title: string; description: string; confirmLabel: string };
}

/** The actions a form offers where it is, the next step first. */
export function recordActions(current: ScheduleStatus | null, number = "this form"): RecordAction[] {
  switch (current) {
    case null:
      return [
        { to: "Submitted", label: "Submit for approval", kind: "primary" },
        { to: "Draft", label: "Save as draft", kind: "secondary" },
      ];
    case "Draft":
      return [
        { to: "Submitted", label: "Submit for approval", kind: "primary" },
        { to: "Draft", label: "Save draft", kind: "secondary" },
      ];
    case "Returned":
      return [
        { to: "Submitted", label: "Submit again", kind: "primary" },
        { to: "Returned", label: "Save changes", kind: "secondary" },
      ];
    case "Submitted":
      return [
        {
          to: "Approved",
          label: "Approve",
          kind: "primary",
          confirm: {
            title: `Approve ${number}?`,
            description: "It is saved as it stands now and approved. It then waits among the Unplaced records until it is placed in a box.",
            confirmLabel: "Approve",
          },
        },
        {
          to: "Returned",
          label: "Return for revision",
          kind: "back",
          confirm: {
            title: `Return ${number} for revision?`,
            description: "It is saved as it stands now and goes back to be revised and submitted again.",
            confirmLabel: "Return for revision",
          },
        },
        { to: "Submitted", label: "Save changes", kind: "secondary" },
      ];
    case "Approved":
      return [
        { to: "Approved", label: "Save changes", kind: "primary" },
        {
          to: "Returned",
          label: "Return for revision",
          kind: "back",
          confirm: {
            title: `Return ${number} for revision?`,
            description: "It is no longer approved: it comes out of its box in the Records Room and must be approved and placed again.",
            confirmLabel: "Return for revision",
          },
        },
      ];
    default:
      return [];
  }
}

/** One line on where the form stands and what comes next. */
export function statusNote(current: RecordsDocStatus | null): string {
  switch (current) {
    case null:
      return "Submit it for approval, or keep it as a draft. The number is given when it is saved.";
    case "Draft":
      return "A draft: not yet submitted for approval.";
    case "Submitted":
      return "Submitted: waiting to be approved or returned.";
    case "Returned":
      return "Returned for revision: correct it and submit it again.";
    case "Approved":
      return "Approved. Corrections keep it approved.";
    case "Cancelled":
      return "Voided: it keeps its number and history and can no longer be changed.";
    default:
      return "";
  }
}

/** Where a form stands with the Records Room, and what may be done there. */
export interface Filing {
  kind: "filed" | "unplaced" | "not-eligible" | "voided";
  title: string;
  note: string;
  /** Place in the Records Room is offered. */
  canPlace: boolean;
  /** Locate in the Records Room is offered. */
  canLocate: boolean;
}

/**
 * Only an approved form is placed in a box (30 Oct 2026); placeRecordDocument
 * refuses every other status the same way. `filed` is whether it is in a box.
 */
export function filingState(status: RecordsDocStatus, filed: boolean): Filing {
  if (status === "Approved") {
    return filed
      ? { kind: "filed", title: "Filed", note: "", canPlace: false, canLocate: true }
      : { kind: "unplaced", title: "Unplaced", note: "Approved and ready to be placed in a box.", canPlace: true, canLocate: false };
  }
  if (status === "Cancelled") {
    return filed
      ? // The room lists only active records, so there is nothing to locate: the place is said, not linked.
        { kind: "voided", title: "Voided", note: "Filed there before it was voided. The Records Room no longer lists it, and it is not moved.", canPlace: false, canLocate: false }
      : { kind: "voided", title: "Not filed", note: "A voided form is not placed in the Records Room.", canPlace: false, canLocate: false };
  }
  const why: Record<ScheduleStatus, string> = {
    Draft: "A draft is placed only after it is submitted and approved.",
    Submitted: "Awaiting approval. It can be placed once it is approved.",
    Returned: "Returned for revision. It can be placed once it is approved.",
    Approved: "",
  };
  return { kind: "not-eligible", title: "Not eligible for filing yet", note: why[status], canPlace: false, canLocate: filed };
}

/** The steps a record page offers: the form's moves, without plain saving. */
export function pageMoves(status: RecordsDocStatus, number = "this form"): RecordAction[] {
  if (status === "Cancelled") return [];
  return recordActions(status, number).filter((a) => a.to !== status);
}

/** What a save did, for its toast: the step taken, or that changes were kept. */
export function savedMessage(number: string, from: ScheduleStatus | null, to: ScheduleStatus): string {
  if (from === to) return `${number}: changes saved`;
  switch (to) {
    case "Draft":
      return `${number} saved as a draft`;
    case "Submitted":
      return `${number} submitted for approval`;
    case "Approved":
      return `${number} approved. Place it in the Records Room next.`;
    case "Returned":
      return `${number} returned for revision`;
    default:
      return `${number} saved`;
  }
}
