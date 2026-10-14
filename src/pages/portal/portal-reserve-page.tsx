import * as React from "react";
import { useNavigate } from "react-router-dom";

import { toast } from "@/components";
import { createReservation, type ReservationDraftInput } from "@/features/reservations/api";
import { ResForm } from "@/features/reservations/components/res-form/res-form";
import { PortalPage, SubmissionSuccess } from "@/features/portal/components/submission-success";

/**
 * Public facility reservation form — the same one-page form as the admin's, no
 * login. Availability is inside the form, so the month calendar that used to
 * sit above it is gone.
 */
export function PortalReservePage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = React.useState(false);
  const [reference, setReference] = React.useState<string | null>(null);

  const submit = async (input: ReservationDraftInput) => {
    setSubmitting(true);
    try {
      const r = await createReservation(input);
      setReference(r.resNumber);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to create reservation");
    }
    setSubmitting(false);
  };

  return (
    <PortalPage
      title="Reserve a Facility"
      description="Pick a facility, a free day and a time on one page. Booked times are shown as you choose."
    >
      {reference ? (
        <SubmissionSuccess
          reference={reference}
          message="Your facility reservation has been received. The slot is held as Pending until the GSO confirms it."
        />
      ) : (
        <ResForm
          submitLabel="Submit Reservation"
          submitting={submitting}
          onSubmit={submit}
          onCancel={() => navigate("/portal")}
        />
      )}
    </PortalPage>
  );
}
