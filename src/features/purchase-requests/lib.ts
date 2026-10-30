import { format } from "date-fns";

import type { ApprovalTimelineStep } from "@/components";
import type { PRStatus, PurchaseRequest } from "@/features/purchase-requests/types";
import { workflowSteps } from "@/features/shared/workflow-steps";

export const formatDateTime = (iso: string) => format(new Date(iso), "d MMM yyyy · h:mm a");
export const formatDate = (iso: string) => format(new Date(iso), "d MMM yyyy");

const WORKFLOW_CHAIN = ["Created", "Submitted", "Approved", "Completed"] as const;

/** The last chain step each open status has passed. */
const REACHED: Record<PRStatus, string> = {
  Draft: "Created",
  Submitted: "Submitted",
  Approved: "Approved",
  Completed: "Completed",
  Rejected: "",
  Cancelled: "",
};

/** The request's approval steps as recorded, then the steps still ahead (shared/workflow-steps). */
export function buildApprovalTimeline(pr: PurchaseRequest): ApprovalTimelineStep[] {
  return workflowSteps(pr.approvals, {
    chain: WORKFLOW_CHAIN,
    reached: REACHED[pr.status] ?? "",
    closed: pr.status === "Rejected" || pr.status === "Cancelled",
  });
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
