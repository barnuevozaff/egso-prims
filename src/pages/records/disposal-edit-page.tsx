import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Button, PageHeader, PageTransition, Spinner, toast } from "@/components";
import { savedMessage } from "@/features/records/workflow";
import { updateRequest } from "@/features/records/disposal-api";
import { useDisposalRequest } from "@/features/records/disposal-hooks";
import { DisposalForm } from "@/features/records/components/disposal-form";
import type { DisposalInput } from "@/features/records/disposal-types";

export function DisposalEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: request, loading } = useDisposalRequest(id);
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async (input: DisposalInput) => {
    if (!id) return;
    setSubmitting(true);
    try {
      await updateRequest(id, input);
      if (request) toast.success(savedMessage(request.requestNo, request.status === "Cancelled" ? null : request.status, input.status));
      navigate(`/records/disposal/${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to update the request");
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

  if (!request) {
    return (
      <PageTransition className="space-y-6">
        <PageHeader
          title="Request not found"
          description="This disposal request no longer exists."
        />
        <Button variant="outline" onClick={() => navigate("/records/disposal")}>
          Back to Disposal Requests
        </Button>
      </PageTransition>
    );
  }

  if (request.status === "Cancelled") {
    return (
      <PageTransition className="space-y-6">
        <PageHeader title="This form is voided" description="A voided form keeps its number and history and can no longer be changed." />
        <Button variant="outline" onClick={() => navigate(`/records/disposal/${request.id}`)}>
          Back to the form
        </Button>
      </PageTransition>
    );
  }

  return (
    <PageTransition className="space-y-6">
      <PageHeader
        title={`Edit ${request.requestNo}`}
        description="Request for Authority to Dispose of Records"
      />
      <DisposalForm
        initial={request}
        submitting={submitting}
        onSubmit={submit}
        onCancel={() => navigate(`/records/disposal/${request.id}`)}
      />
    </PageTransition>
  );
}
