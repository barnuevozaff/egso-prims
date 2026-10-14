import * as React from "react";
import { useNavigate } from "react-router-dom";

import { PageHeader, PageTransition, toast } from "@/components";
import { createReservation, type ReservationDraftInput } from "@/features/reservations/api";
import { ResForm } from "@/features/reservations/components/res-form/res-form";

export function ResCreatePage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async (input: ReservationDraftInput) => {
    setSubmitting(true);
    try {
      const r = await createReservation(input);
      toast.success(`${r.resNumber} submitted for approval`);
      navigate("/reservations");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to create reservation");
    }
    setSubmitting(false);
  };

  return (
    <PageTransition className="space-y-6">
      <PageHeader
        title="New Facility Reservation"
        description="Book a municipal facility and borrow event equipment."
      />
      <ResForm
        submitLabel="Submit reservation"
        submitting={submitting}
        onSubmit={submit}
        onCancel={() => navigate("/reservations")}
      />
    </PageTransition>
  );
}
