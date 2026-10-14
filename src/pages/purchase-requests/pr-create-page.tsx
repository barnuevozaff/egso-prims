import * as React from "react";
import { useNavigate } from "react-router-dom";

import { PageHeader, PageTransition, toast } from "@/components";
import { createPurchaseRequest, type PRDraftInput } from "@/features/purchase-requests/api";
import { PRForm } from "@/features/purchase-requests/components/pr-form/pr-form";

export function PRCreatePage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async (input: PRDraftInput) => {
    setSubmitting(true);
    try {
      const pr = await createPurchaseRequest(input);
      toast.success(`${pr.prNumber} submitted for review`);
      navigate("/purchase-requests");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to submit the purchase request");
    }
    setSubmitting(false);
  };

  return (
    <PageTransition className="space-y-6">
      <PageHeader
        title="New Purchase Request"
        description="Fill in one page. The summary on the right shows what is still missing."
      />
      <PRForm
        submitLabel="Submit Request"
        submitting={submitting}
        onSubmit={submit}
        onCancel={() => navigate("/purchase-requests")}
      />
    </PageTransition>
  );
}
