import { format } from "date-fns";

import type { ApprovalTimelineStep } from "@/components";
import type { PRStatus, PurchaseRequest } from "@/features/purchase-requests/types";

export const formatDateTime = (iso: string) => format(new Date(iso), "d MMM yyyy · h:mm a");
export const formatDate = (iso: string) => format(new Date(iso), "d MMM yyyy");

const WORKFLOW_CHAIN = [
  "Created",
  "Submitted",
  "Approved",
  "Completed",
] as const;

/** How far along the standard chain each status is (index of current step). */
const STATUS_PROGRESS: Record<PRStatus, number> = {
  Draft: 1,
  Submitted: 2,
  Approved: 3,
  Completed: 4,
  Rejected: -1,
  Cancelled: -1,
};

/**
 * Builds the visual approval timeline from the request's workflow position,
 * enriched with the recorded approvals (person, office, time, remarks).
 */
export function buildApprovalTimeline(pr: PurchaseRequest): ApprovalTimelineStep[] {
  const record = (step: string) => pr.approvals.find((a) => a.step === step);

  if (pr.status === "Rejected" || pr.status === "Cancelled") {
    const terminal = record(pr.status);
    const steps: ApprovalTimelineStep[] = [];
    for (const name of WORKFLOW_CHAIN) {
      const rec = record(name);
      if (!rec) break;
      steps.push(toStep(name, "approved", rec));
    }
    steps.push(
      toStep(pr.status, "rejected", terminal ?? { step: pr.status }),
    );
    return steps;
  }

  // Fallback keeps the timeline sane for a status the chain no longer knows,
  // e.g. a request stored before a workflow stage was retired.
  const progress = STATUS_PROGRESS[pr.status] ?? 0;
  return WORKFLOW_CHAIN.map((name, i) => {
    const state: ApprovalTimelineStep["status"] =
      i < progress ? "approved" : i === progress ? "current" : "pending";
    return toStep(name, state, record(name));
  });
}

function toStep(
  label: string,
  status: ApprovalTimelineStep["status"],
  rec?: { by?: string; office?: string; at?: string; remarks?: string },
): ApprovalTimelineStep {
  return {
    label,
    status,
    time: rec?.at ? formatDateTime(rec.at) : undefined,
    person: rec?.by ? { name: rec.by, office: rec.office } : undefined,
    remarks: rec?.remarks,
  };
}

/**
 * Whether a purchase order may be raised against this request. The rule is
 * "it has been approved" — which stays true once the request moves on to
 * Completed, so the action does not vanish the moment the cycle is closed out.
 */
export function canRaisePO(status: PRStatus): boolean {
  return status === "Approved" || status === "Completed";
}

/** Next workflow stage the Approve action advances to, if any. */
export function nextApprovalStatus(status: PRStatus): PRStatus | null {
  switch (status) {
    case "Draft":
      return "Submitted";
    case "Submitted":
      return "Approved";
    case "Approved":
      return "Completed";
    default:
      return null;
  }
}
