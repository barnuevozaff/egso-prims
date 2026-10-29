import type { ApprovalTimelineStep } from "@/components";
import { getPurchaseRequest } from "@/features/purchase-requests/api";
import { buildApprovalTimeline } from "@/features/purchase-requests/lib";
import { prSummary, type PRStatus } from "@/features/purchase-requests/types";
import { getPurchaseOrder } from "@/features/purchase-orders/api";
import { buildPOTimeline } from "@/features/purchase-orders/lib";
import { poSupplierName, type POStatus } from "@/features/purchase-orders/types";
import { getRequest } from "@/features/ris/api";
import { buildRISTimeline } from "@/features/ris/lib";
import { getReservation } from "@/features/reservations/api";
import { buildReservationTimeline } from "@/features/reservations/lib";
import { facilityName } from "@/features/reservations/types";
import type { DocumentStatus } from "@/components";

/**
 * Public tracking: resolves any GSO reference number (PR-/PO-/RIS-/FR-) to a
 * read-only status snapshot. Pure reuse of the module services and timeline
 * builders — no portal-specific state.
 */

export interface TrackResult {
  kind:
    | "Purchase Request"
    | "Purchase Order"
    | "Requisition and Issue Slip"
    | "Facility Reservation";
  number: string;
  title: string;
  status: DocumentStatus;
  /** Where the document currently sits. */
  currentOffice: string;
  /** ISO timestamp of the last change. */
  updatedAt: string;
  latestEvent: string;
  timeline: ApprovalTimelineStep[];
}

/**
 * Where a document stands, read off its steps rather than off a list of status
 * names, so a new workflow stage cannot fall through a lookup table.
 */
export type Standing = "moving" | "finished" | "stopped";

export function standingOf(steps: ApprovalTimelineStep[]): Standing {
  if (steps.some((s) => s.status === "rejected")) return "stopped";
  if (steps.every((s) => s.status === "approved")) return "finished";
  return "moving";
}

const PR_OFFICE: Record<PRStatus, string> = {
  Draft: "Requesting Office",
  Submitted: "General Services Office",
  // The GSO head approves; the request stays with the GSO for its purchase order.
  Approved: "General Services Office",
  Completed: "General Services Office",
  Rejected: "General Services Office",
  Cancelled: "General Services Office",
};

const PO_OFFICE: Record<POStatus, string> = {
  Draft: "General Services Office",
  "Pending Approval": "General Services Office",
  // Approved is the order's final status (21 Oct 2026): the GSO prints it for signing.
  Approved: "General Services Office",
  Released: "Supplier",
  Completed: "General Services Office",
  Cancelled: "General Services Office",
};

function latestHistoryText(history: { text: string; at: string }[]): string {
  const last = [...history].sort((a, b) => b.at.localeCompare(a.at))[0];
  return last?.text ?? "—";
}

export async function trackReference(raw: string): Promise<TrackResult | null> {
  const ref = raw.trim().toUpperCase();
  if (!ref) return null;

  if (ref.startsWith("PR-")) {
    const pr = await getPurchaseRequest(ref);
    if (!pr) return null;
    return {
      kind: "Purchase Request",
      number: pr.prNumber,
      title: prSummary(pr),
      status: pr.status,
      currentOffice: PR_OFFICE[pr.status],
      updatedAt: pr.updatedAt,
      latestEvent: latestHistoryText(pr.history),
      timeline: buildApprovalTimeline(pr),
    };
  }

  if (ref.startsWith("PO-")) {
    const po = await getPurchaseOrder(ref);
    if (!po) return null;
    return {
      kind: "Purchase Order",
      number: po.poNumber,
      title: po.purpose,
      status: po.status,
      currentOffice:
        po.status === "Released"
          ? poSupplierName(po)
          : PO_OFFICE[po.status],
      updatedAt: po.updatedAt,
      latestEvent: latestHistoryText(po.history),
      timeline: buildPOTimeline(po),
    };
  }

  if (ref.startsWith("RIS-")) {
    const slip = await getRequest(ref);
    if (!slip) return null;
    return {
      kind: "Requisition and Issue Slip",
      number: slip.risNumber,
      title: slip.purpose,
      status: slip.status,
      currentOffice: "General Services Office",
      updatedAt: slip.updatedAt,
      latestEvent: latestHistoryText(slip.history),
      timeline: buildRISTimeline(slip),
    };
  }

  if (ref.startsWith("FR-")) {
    const r = await getReservation(ref);
    if (!r) return null;
    return {
      kind: "Facility Reservation",
      number: r.resNumber,
      title: `${facilityName(r.facilityId)} — ${r.purpose}`,
      status: r.status,
      currentOffice: "General Services Office",
      updatedAt: r.updatedAt,
      latestEvent: latestHistoryText(r.history),
      timeline: buildReservationTimeline(r),
    };
  }

  return null;
}
