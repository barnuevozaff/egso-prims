import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";

import { ContainerCard, ErrorState, PageTransition, Skeleton, SkeletonText, toast } from "@/components";
import { useAuth } from "@/features/auth/auth-context";
import { can } from "@/features/auth/types";
import { updateReservation, type ReservationDraftInput } from "@/features/reservations/api";
import { ResActions } from "@/features/reservations/components/res-actions";
import { ResDetailPanels } from "@/features/reservations/components/res-detail-panels";
import { ResForm } from "@/features/reservations/components/res-form/res-form";
import { useReservation } from "@/features/reservations/hooks";
import { buildReservationTimeline } from "@/features/reservations/lib";
import { facilityName } from "@/features/reservations/types";
import { RecordHistory } from "@/features/shared/record-history";
import { RecordPageHeader } from "@/features/shared/record-page";

/** Changed only while not yet decided against (functions/src/documents/update-reservation.ts). */
const EDITABLE = ["Draft", "Pending", "Approved"];

/**
 * A facility reservation on its own page (30 Oct 2026), as the purchase
 * order has it: a pending or approved reservation opens ready to edit, with
 * its actions (Approve, Reject, Complete) at the top and its history below;
 * a rejected, completed or voided one opens read-only. Saving stays on the
 * page.
 */
export function ResPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: r, loading, setData } = useReservation(id);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  if (loading && !r) {
    return (
      <PageTransition className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <ContainerCard padded>
          <SkeletonText lines={10} />
        </ContainerCard>
      </PageTransition>
    );
  }
  if (!r) {
    return (
      <PageTransition>
        <ContainerCard className="mx-auto w-full max-w-3xl">
          <ErrorState
            title="Reservation not found"
            description="It may have been voided, or the link is out of date."
            action={{ label: "Back to list", onClick: () => navigate("/reservations") }}
          />
        </ContainerCard>
      </PageTransition>
    );
  }

  const editable = EDITABLE.includes(r.status) && can(user, "manage:reservations");

  const save = async (input: ReservationDraftInput) => {
    setSaving(true);
    try {
      const updated = await updateReservation(r.id, input);
      setData(updated);
      toast.success(`${updated.resNumber} saved`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save the reservation");
    }
    setSaving(false);
  };

  return (
    <PageTransition className="w-full max-w-[1400px] space-y-5 pb-10">
      <RecordPageHeader
        back={{ to: "/reservations", label: "Facility reservations" }}
        number={r.resNumber}
        status={r.status}
        description={`${facilityName(r.facilityId)} · ${r.borrower}`}
        actions={<ResActions r={r} onUpdated={setData} locked={editable && dirty} />}
        note={editable && dirty ? "Save or undo your changes to approve, reject or complete the reservation." : undefined}
      />

      {editable ? (
        <>
          {/* A fresh form after each save, so it holds what was saved. */}
          <ResForm
            key={r.updatedAt}
            initial={r}
            submitLabel="Save changes"
            submitting={saving}
            onSubmit={save}
            onCancel={() => navigate("/reservations")}
            onDirtyChange={setDirty}
          />
          <RecordHistory steps={buildReservationTimeline(r)} changes={r.history} updatedAt={r.updatedAt} />
        </>
      ) : (
        <div className="rounded-[14px] border border-[#e6e6e3] bg-white px-5 py-5 sm:px-6">
          <ResDetailPanels r={r} />
        </div>
      )}
    </PageTransition>
  );
}
