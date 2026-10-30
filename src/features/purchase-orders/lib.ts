import { format } from "date-fns";

import type { ApprovalTimelineStep } from "@/components";
import type { POStatus, PurchaseOrder } from "@/features/purchase-orders/types";
import { workflowSteps } from "@/features/shared/workflow-steps";

export const formatDateTime = (iso: string) => format(new Date(iso), "d MMM yyyy · h:mm a");
export const formatDate = (iso: string) => format(new Date(iso), "d MMM yyyy");

/**
 * An order authorized with its request (21 Oct 2026) is created already
 * approved: it has no submission of its own. Orders of the earlier workflow
 * were submitted for approval, and one released shows its Released and
 * Completed steps as well.
 */
const AUTHORIZED_CHAIN = ["Created", "Approved"] as const;
const WORKFLOW_CHAIN = ["Created", "Pending Approval", "Approved"] as const;
const LEGACY_CHAIN = [...WORKFLOW_CHAIN, "Released", "Completed"] as const;

/** The last chain step each open status has passed. */
const REACHED: Record<POStatus, string> = {
  Draft: "Created",
  "Pending Approval": "Pending Approval",
  Approved: "Approved",
  Released: "Released",
  Completed: "Completed",
  Cancelled: "",
};

/** The order's approval steps as recorded, then the steps still ahead (shared/workflow-steps). */
export function buildPOTimeline(po: PurchaseOrder): ApprovalTimelineStep[] {
  const legacy =
    po.status === "Released" || po.status === "Completed" || po.approvals.some((a) => a.step === "Released");
  return workflowSteps(po.approvals, {
    chain: po.authorization === "pr-approval" ? AUTHORIZED_CHAIN : legacy ? LEGACY_CHAIN : WORKFLOW_CHAIN,
    reached: REACHED[po.status] ?? "",
    closed: po.status === "Cancelled",
    labels: { "Pending Approval": "Submitted" },
  });
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
