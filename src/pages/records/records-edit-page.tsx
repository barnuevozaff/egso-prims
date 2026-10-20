import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Button, PageHeader, PageTransition, Spinner, toast } from "@/components";
import { updateSchedule } from "@/features/records/api";
import { useSchedule } from "@/features/records/hooks";
import { ScheduleForm } from "@/features/records/components/schedule-form";
import type { ScheduleInput } from "@/features/records/types";

export function RecordsEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: schedule, loading } = useSchedule(id);
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async (input: ScheduleInput) => {
    if (!id) return;
    setSubmitting(true);
    try {
      await updateSchedule(id, input);
      toast.success("Disposition schedule updated");
      navigate(`/records/${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to update the schedule");
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!schedule) {
    return (
      <PageTransition className="space-y-6">
        <PageHeader
          title="Schedule not found"
          description="This disposition schedule no longer exists."
        />
        <Button variant="outline" onClick={() => navigate("/records")}>
          Back to Records
        </Button>
      </PageTransition>
    );
  }

  if (schedule.status === "Cancelled") {
    return (
      <PageTransition className="space-y-6">
        <PageHeader title="This form is voided" description="A voided form keeps its number and history and can no longer be changed." />
        <Button variant="outline" onClick={() => navigate(`/records/${schedule.id}`)}>
          Back to the form
        </Button>
      </PageTransition>
    );
  }

  return (
    <PageTransition className="space-y-6">
      <PageHeader
        title={`Edit ${schedule.scheduleNo}`}
        description="Records Disposition Schedule"
      />
      <ScheduleForm
        initial={schedule}
        submitting={submitting}
        submitLabel="Save Changes"
        onSubmit={submit}
        onCancel={() => navigate(`/records/${schedule.id}`)}
      />
    </PageTransition>
  );
}
