import { format } from "date-fns";

import type { ApprovalTimelineStep } from "@/components";
import type { RISStatus, RequestForIssuance } from "@/features/ris/types";
import { workflowSteps } from "@/features/shared/workflow-steps";

export const formatDateTime = (iso: string) => format(new Date(iso), "d MMM yyyy · h:mm a");
export const formatDate = (iso: string) => format(new Date(iso), "d MMM yyyy");

/**
 * The workflow since 22 Oct 2026: a slip is submitted, then Approved —
 * approval issues the stock — or Rejected. Slips issued under the earlier
 * workflow keep their Released and Completed steps.
 */
const WORKFLOW_CHAIN = ["Created", "Pending Approval", "Approved"] as const;
const LEGACY_CHAIN = ["Created", "Pending Approval", "Approved", "Released", "Completed"] as const;

/** The last chain step each open status has passed. */
const REACHED: Record<RISStatus, string> = {
  Draft: "Created",
  "Pending Approval": "Pending Approval",
  Approved: "Approved",
  Released: "Released",
  Completed: "Completed",
  Rejected: "",
  Cancelled: "",
};

/** The slip's approval steps as recorded, then the steps still ahead (shared/workflow-steps). */
export function buildRISTimeline(ris: RequestForIssuance): ApprovalTimelineStep[] {
  const legacy =
    ris.status === "Released" || ris.status === "Completed" || ris.approvals.some((a) => a.step === "Released");
  return workflowSteps(ris.approvals, {
    chain: legacy ? LEGACY_CHAIN : WORKFLOW_CHAIN,
    reached: REACHED[ris.status] ?? "",
    closed: ris.status === "Rejected" || ris.status === "Cancelled",
    labels: {
      "Pending Approval": "Submitted",
      // Since 22 Oct 2026 approval issues the stock, recorded as stockIssuedAt.
      ...(!legacy && ris.stockIssuedAt ? { Approved: "Approved · stock issued" } : {}),
    },
  });
}

/**
 * Next workflow stage the primary action advances to, if any. A draft is
 * submitted; a pending slip is approved (which issues its stock, through
 * approveRequest). Nothing follows Approved: there is no Release step.
 */
export function nextRISStatus(status: RISStatus): RISStatus | null {
  switch (status) {
    case "Draft":
      return "Pending Approval";
    case "Pending Approval":
      return "Approved";
    default:
      return null;
  }
}
