import { format } from "date-fns";

import type { ApprovalTimelineStep } from "@/components";
import type { POStatus, PurchaseOrder } from "@/features/purchase-orders/types";

export const formatDateTime = (iso: string) => format(new Date(iso), "d MMM yyyy · h:mm a");
export const formatDate = (iso: string) => format(new Date(iso), "d MMM yyyy");

/**
 * The ordinary chain since 21 Oct 2026 ends at Approved. An order released
 * under the old workflow shows its Released and Completed steps as well.
 */
const WORKFLOW_CHAIN = ["Created", "Pending Approval", "Approved"] as const;
const LEGACY_CHAIN = [...WORKFLOW_CHAIN, "Released", "Completed"] as const;

/** Index of the current step in the chain per status. */
const STATUS_PROGRESS: Record<POStatus, number> = {
  Draft: 1,
  "Pending Approval": 1,
  Approved: 3,
  Released: 4,
  Completed: 5,
  Cancelled: -1,
};

/** Approval timeline from workflow position + recorded approvals. */
export function buildPOTimeline(po: PurchaseOrder): ApprovalTimelineStep[] {
  // The latest record of each step: an order returned and resubmitted has more than one.
  const record = (step: string) => [...po.approvals].reverse().find((a) => a.step === step);
  const legacy = po.status === "Released" || po.status === "Completed" || !!record("Released");
  const chain: readonly string[] = legacy ? LEGACY_CHAIN : WORKFLOW_CHAIN;

  if (po.status === "Cancelled") {
    const steps: ApprovalTimelineStep[] = [];
    for (const name of chain) {
      const rec = record(name);
      if (!rec) break;
      steps.push(toStep(name, "approved", rec));
    }
    steps.push(toStep("Cancelled", "rejected", record("Cancelled") ?? { step: "Cancelled" }));
    return steps;
  }

  const progress = STATUS_PROGRESS[po.status];
  return chain.map((name, i) => {
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

/** Next workflow stage the Approve action advances to, if any. */
/* ---------------- post-approval handover ---------------- */

/**
 * The order may be issued to the supplier once it has cleared approval and
 * has not been issued already.
 */
export function canIssuePO(po: PurchaseOrder): boolean {
  return !po.issuedAt && (po.status === "Released" || po.status === "Completed");
}

/** The supplier may acknowledge an order that has been issued to them. */
export function canAcknowledgePO(po: PurchaseOrder): boolean {
  return !!po.issuedAt && !po.acknowledgedAt;
}

/**
 * The next step of the ordinary workflow, if any. Approved is final; an order
 * released under the old workflow can still be marked Completed.
 */
export function nextPOStatus(status: POStatus): POStatus | null {
  switch (status) {
    case "Draft":
      return "Pending Approval";
    case "Pending Approval":
      return "Approved";
    case "Released":
      return "Completed";
    default:
      return null;
  }
}

/** Content can be changed only before approval (firestore.rules). */
export const poEditable = (po: Pick<PurchaseOrder, "status">) =>
  po.status === "Draft" || po.status === "Pending Approval";

/** Returned to draft for correction: before approval, or after it while not issued. */
export const poReturnable = (po: Pick<PurchaseOrder, "status" | "issuedAt">) =>
  po.status === "Pending Approval" || (po.status === "Approved" && !po.issuedAt);

/* ---------------- the order against its source request ---------------- */

export interface PRLine {
  description: string;
  quantity: number;
  unit: string;
  estimatedCost: number;
}

export interface POLine {
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
}

export interface OrderChange {
  kind: "added" | "removed" | "quantity" | "unit" | "cost";
  description: string;
  from?: number | string;
  to?: number | string;
  /** More than the request asked for: a quantity or cost above it, or a new line. */
  increase: boolean;
}

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * How an order differs from the approved request it is raised from (21 Oct
 * 2026). Lines are matched by description, ignoring case and spacing; a line
 * whose description was rewritten shows as one removed and one added. The
 * request itself is never changed. Increases are flagged for the reviewer to
 * check whether they need further authorization; no threshold is assumed.
 */
export function compareWithPR(prItems: PRLine[], poItems: POLine[]) {
  const unmatched = prItems.map((it, i) => ({ it, i }));
  const changes: OrderChange[] = [];
  for (const po of poItems) {
    const at = unmatched.findIndex((u) => key(u.it.description) === key(po.description));
    if (at === -1) {
      changes.push({ kind: "added", description: po.description, increase: true });
      continue;
    }
    const pr = unmatched.splice(at, 1)[0].it;
    if (Number(po.quantity) !== Number(pr.quantity)) {
      changes.push({
        kind: "quantity",
        description: po.description,
        from: pr.quantity,
        to: po.quantity,
        increase: Number(po.quantity) > Number(pr.quantity),
      });
    }
    if (key(po.unit) !== key(pr.unit)) {
      changes.push({ kind: "unit", description: po.description, from: pr.unit, to: po.unit, increase: false });
    }
    if (Math.abs(Number(po.unitCost) - Number(pr.estimatedCost)) >= 0.005) {
      changes.push({
        kind: "cost",
        description: po.description,
        from: pr.estimatedCost,
        to: po.unitCost,
        increase: Number(po.unitCost) > Number(pr.estimatedCost),
      });
    }
  }
  for (const { it } of unmatched) changes.push({ kind: "removed", description: it.description, increase: false });

  const prTotal = prItems.reduce((s, it) => s + Number(it.quantity) * Number(it.estimatedCost), 0);
  const poTotal = poItems.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitCost) || 0), 0);
  return { changes, prTotal, poTotal, difference: poTotal - prTotal };
}
