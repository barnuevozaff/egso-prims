import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  ContainerCard,
  ErrorState,
  PageHeader,
  PageTransition,
  SkeletonText,
  toast,
} from "@/components";
import { updateReservation, type ReservationDraftInput } from "@/features/reservations/api";
import { useReservation } from "@/features/reservations/hooks";
import { ResForm } from "@/features/reservations/components/res-form/res-form";

export function ResEditPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: r, loading } = useReservation(id);
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async (input: ReservationDraftInput) => {
    setSubmitting(true);
    try {
      const updated = await updateReservation(id, input);
      toast.success(`${updated.resNumber} updated`);
      navigate("/reservations");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to update reservation");
    }
    setSubmitting(false);
  };

  return (
    <PageTransition className="space-y-6">
      <PageHeader
        title={r ? `Edit ${r.resNumber}` : "Edit Reservation"}
        description="Update the booking details, schedule, or borrowed equipment."
      />
      {loading ? (
        <ContainerCard padded className="mx-auto w-full max-w-3xl">
          <SkeletonText lines={8} />
        </ContainerCard>
      ) : !r ? (
        <ContainerCard className="mx-auto w-full max-w-3xl">
          <ErrorState
            title="Reservation not found"
            description="It may have been deleted, or the link is out of date."
            action={{ label: "Back to list", onClick: () => navigate("/reservations") }}
          />
        </ContainerCard>
      ) : (
        <ResForm
          initial={r}
          submitLabel="Save Changes"
          submitting={submitting}
          onSubmit={submit}
          onCancel={() => navigate("/reservations")}
        />
      )}
    </PageTransition>
  );
}
