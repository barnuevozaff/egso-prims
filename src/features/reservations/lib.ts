import { format } from "date-fns";

import type { ApprovalTimelineStep } from "@/components";
import type { Reservation, ReservationStatus } from "@/features/reservations/types";
import { workflowSteps } from "@/features/shared/workflow-steps";

export const formatDateTime = (iso: string) => format(new Date(iso), "d MMM yyyy · h:mm a");
export const formatDate = (iso: string) => format(new Date(iso), "d MMM yyyy");

/** A reservation is filed, then approved or rejected, then completed. */
const WORKFLOW_CHAIN = ["Created", "Approved", "Completed"] as const;

/** The last chain step each open status has passed. */
const REACHED: Record<ReservationStatus, string> = {
  Draft: "Created",
  Pending: "Created",
  Approved: "Approved",
  Completed: "Completed",
  Rejected: "",
  Cancelled: "",
};

/** The reservation's approval steps as recorded, then the steps still ahead (shared/workflow-steps). */
export function buildReservationTimeline(r: Reservation): ApprovalTimelineStep[] {
  return workflowSteps(r.approvals, {
    chain: WORKFLOW_CHAIN,
    reached: REACHED[r.status] ?? "",
    closed: r.status === "Rejected" || r.status === "Cancelled",
    // Reservations filed before 30 Oct 2026 hold a "Reviewed" step that filing
    // wrote under a fixed name; no one reviewed them, and no action records a
    // review. The records are kept as they are; the step is not shown.
    ignore: ["Reviewed"],
  });
}
