import { format } from "date-fns";

import type { ApprovalTimelineStep } from "@/components";
import type { RISStatus, RequestForIssuance } from "@/features/ris/types";

export const formatDateTime = (iso: string) => format(new Date(iso), "d MMM yyyy · h:mm a");
export const formatDate = (iso: string) => format(new Date(iso), "d MMM yyyy");

/**
 * The workflow since 22 Oct 2026: a slip is submitted, then Approved —
 * approval issues the stock — or Rejected. Slips issued under the earlier
 * workflow keep their Released and Completed steps.
 */
const WORKFLOW_CHAIN = ["Created", "Pending Approval", "Approved"] as const;
const LEGACY_CHAIN = ["Created", "Pending Approval", "Approved", "Released", "Completed"] as const;

/** Index of the current step in the chain per status. */
const STATUS_PROGRESS: Record<RISStatus, number> = {
  Draft: 1,
  "Pending Approval": 1,
  Approved: 3,
  Rejected: -1,
  Released: 4,
  Completed: 5,
  Cancelled: -1,
};

/** Approval timeline from workflow position + recorded approvals. */
export function buildRISTimeline(ris: RequestForIssuance): ApprovalTimelineStep[] {
  const record = (step: string) => ris.approvals.find((a) => a.step === step);
  const legacy = ris.status === "Released" || ris.status === "Completed" || !!record("Released");
  const chain: readonly string[] = legacy ? LEGACY_CHAIN : WORKFLOW_CHAIN;

  if (ris.status === "Cancelled" || ris.status === "Rejected") {
    const steps: ApprovalTimelineStep[] = [];
    for (const name of chain) {
      const rec = record(name);
      if (!rec) break;
      steps.push(toStep(name, "approved", rec));
    }
    steps.push(toStep(ris.status, "rejected", record(ris.status) ?? { step: ris.status }));
    return steps;
  }

  const progress = STATUS_PROGRESS[ris.status] ?? 0;
  return chain.map((name, i) => {
    // An approved slip under the current workflow is finished.
    const state: ApprovalTimelineStep["status"] =
      i < progress || (!legacy && ris.status === "Approved") ? "approved" : i === progress ? "current" : "pending";
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
