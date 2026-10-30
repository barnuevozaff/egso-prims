import * as React from "react";
import { useNavigate } from "react-router-dom";

import { PageHeader, PageTransition, toast } from "@/components";
import { savedMessage } from "@/features/records/workflow";
import { createRequest } from "@/features/records/disposal-api";
import { DisposalForm } from "@/features/records/components/disposal-form";
import type { DisposalInput } from "@/features/records/disposal-types";

export function DisposalCreatePage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async (input: DisposalInput) => {
    setSubmitting(true);
    try {
      const request = await createRequest(input);
      toast.success(savedMessage(request.requestNo, null, input.status));
      navigate(`/records/disposal/${request.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to create the disposal request");
    }
    setSubmitting(false);
  };

  return (
    <PageTransition className="space-y-6">
      <PageHeader
        title="New Request for Authority to Dispose"
        description="Ask the National Archives for written authority before any record is destroyed."
      />
      <DisposalForm
        submitting={submitting}
        onSubmit={submit}
        onCancel={() => navigate("/records/disposal")}
      />
    </PageTransition>
  );
}
