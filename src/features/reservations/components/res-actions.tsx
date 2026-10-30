import * as React from "react";
import { CheckCircle2, XCircle } from "lucide-react";

import { Button, ConfirmationModal, WarningModal, toast } from "@/components";
import { setReservationStatus } from "@/features/reservations/api";
import type { Reservation } from "@/features/reservations/types";
import { useAuth } from "@/features/auth/auth-context";

/**
 * A reservation's actions, on its own page (30 Oct 2026; formerly the
 * drawer's footer): Approve or Reject while it is pending, Complete once
 * approved. There is no official reservation form, so nothing is printed
 * from here. The page holds them while the reservation has unsaved changes.
 */
export function ResActions({
  r,
  onUpdated,
  locked,
}: {
  r: Reservation;
  onUpdated: (r: Reservation) => void;
  /** Unsaved changes on the page: nothing is decided until they are saved. */
  locked?: boolean;
}) {
  const { user } = useAuth();
  const [confirmApprove, setConfirmApprove] = React.useState(false);
  const [confirmReject, setConfirmReject] = React.useState(false);
  const [confirmComplete, setConfirmComplete] = React.useState(false);
  const [acting, setActing] = React.useState(false);

  const act = async (status: "Approved" | "Rejected" | "Completed", close: (v: boolean) => void, remarks?: string) => {
    setActing(true);
    try {
      onUpdated(
        await setReservationStatus(r.id, status, {
          by: user?.name ?? "Staff",
          office: user?.office ?? "General Services Office",
          remarks,
        }),
      );
      toast.success(`${r.resNumber} ${status.toLowerCase()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to update the reservation");
    }
    setActing(false);
    close(false);
  };

  const pending = r.status === "Pending" || r.status === "Draft";
  if (!pending && r.status !== "Approved") return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {pending && (
        <>
          <Button variant="outline" onClick={() => setConfirmReject(true)} disabled={locked}>
            <XCircle />
            Reject
          </Button>
          <Button onClick={() => setConfirmApprove(true)} disabled={locked}>
            <CheckCircle2 />
            Approve
          </Button>
        </>
      )}
      {r.status === "Approved" && (
        <Button onClick={() => setConfirmComplete(true)} disabled={locked}>
          <CheckCircle2 />
          Complete
        </Button>
      )}

      <ConfirmationModal
        open={confirmApprove}
        onOpenChange={setConfirmApprove}
        tone="success"
        icon={CheckCircle2}
        title="Approve reservation?"
        description={`${r.resNumber} will be approved and the time slot will be blocked for other requests.`}
        confirmLabel="Approve"
        loading={acting}
        onConfirm={() => act("Approved", setConfirmApprove)}
      />
      <WarningModal
        open={confirmReject}
        onOpenChange={setConfirmReject}
        title="Reject reservation?"
        description={`${r.resNumber} will be rejected and the schedule will be freed. This is recorded in the timeline.`}
        confirmLabel="Reject"
        loading={acting}
        onConfirm={() => act("Rejected", setConfirmReject, "Facility not available for the requested schedule")}
      />
      <ConfirmationModal
        open={confirmComplete}
        onOpenChange={setConfirmComplete}
        tone="success"
        icon={CheckCircle2}
        title="Mark as completed?"
        description={`${r.resNumber} will be moved to history as a completed reservation.`}
        confirmLabel="Complete"
        loading={acting}
        onConfirm={() => act("Completed", setConfirmComplete)}
      />
    </div>
  );
}
