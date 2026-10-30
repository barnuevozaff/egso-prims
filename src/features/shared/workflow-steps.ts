import { format } from "date-fns";

import type { ApprovalTimelineStep } from "@/components";

/** One workflow step as a document stores it in `approvals`. */
export interface WorkflowRecord {
  step: string;
  by?: string;
  office?: string;
  at?: string;
  remarks?: string;
}

export interface WorkflowSpec {
  /** The ordinary steps in order, named as `approvals[].step` stores them. */
  chain: readonly string[];
  /** The last chain step the current status has passed. */
  reached: string;
  /** Rejected or voided: nothing further is awaited. */
  closed: boolean;
  /** The name shown for a stored step name. */
  labels?: Record<string, string>;
  /** Stored step names that no one took, so they are not shown. */
  ignore?: readonly string[];
}

const formatDateTime = (iso: string) => format(new Date(iso), "d MMM yyyy · h:mm a");

/** A step that closes the document. A return to draft is the only other kind. */
const CLOSING = ["Rejected", "Cancelled"];

/**
 * A document's approval steps (30 Oct 2026), built one way for every module:
 * what was recorded, in the order it happened — a return and a resubmission
 * show as they happened — then, while the document is open, the steps still
 * ahead, the next one marked current.
 *
 * A chain step the status has passed but that left no record (a document from
 * before steps were recorded) still shows as done, without a date or a name.
 * Nothing is shown as done that neither the record nor the status supports.
 */
export function workflowSteps(approvals: WorkflowRecord[], spec: WorkflowSpec): ApprovalTimelineStep[] {
  const { chain, closed, labels = {}, ignore = [] } = spec;
  const label = (step: string) => labels[step] ?? step;
  const passed = closed ? 0 : chain.indexOf(spec.reached) + 1;
  const shown = new Set<number>();
  const steps: ApprovalTimelineStep[] = [];

  const impliedBefore = (end: number) => {
    for (let i = 0; i < Math.min(end, passed); i++) {
      if (shown.has(i)) continue;
      shown.add(i);
      steps.push({ label: label(chain[i]), status: "approved" });
    }
  };

  for (const rec of approvals) {
    if (!rec.step || ignore.includes(rec.step)) continue;
    const i = chain.indexOf(rec.step);
    if (i >= 0) {
      impliedBefore(i);
      shown.add(i);
    }
    // Every return to draft records the step "Draft".
    const returned = rec.step === "Draft";
    steps.push({
      label: returned ? "Returned" : label(rec.step),
      status: CLOSING.includes(rec.step) ? "rejected" : returned ? "returned" : "approved",
      time: rec.at ? formatDateTime(rec.at) : undefined,
      person: rec.by ? { name: rec.by, office: rec.office } : undefined,
      remarks: rec.remarks,
    });
  }
  impliedBefore(passed);

  if (!closed) {
    chain.slice(passed).forEach((name, k) => {
      steps.push({ label: label(name), status: k === 0 ? "current" : "pending" });
    });
  }
  return steps;
}
