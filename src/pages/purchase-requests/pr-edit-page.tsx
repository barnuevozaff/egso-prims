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
import { updatePurchaseRequest, type PRDraftInput } from "@/features/purchase-requests/api";
import { usePurchaseRequest } from "@/features/purchase-requests/hooks";
import { PRForm } from "@/features/purchase-requests/components/pr-form/pr-form";

export function PREditPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: pr, loading } = usePurchaseRequest(id);
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async (input: PRDraftInput) => {
    setSubmitting(true);
    try {
      const updated = await updatePurchaseRequest(id, input);
      toast.success(`${updated.prNumber} updated`);
      navigate("/purchase-requests");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save the purchase request");
    }
    setSubmitting(false);
  };

  return (
    <PageTransition className="space-y-6">
      <PageHeader
        title={pr ? `Edit ${pr.prNumber}` : "Edit Purchase Request"}
        description="Update the request details or line items."
      />
      {loading ? (
        <ContainerCard padded className="mx-auto w-full max-w-3xl">
          <SkeletonText lines={8} />
        </ContainerCard>
      ) : !pr ? (
        <ContainerCard className="mx-auto w-full max-w-3xl">
          <ErrorState
            title="Purchase request not found"
            description="It may have been deleted, or the link is out of date."
            action={{ label: "Back to list", onClick: () => navigate("/purchase-requests") }}
          />
        </ContainerCard>
      ) : (
        <PRForm
          initial={pr}
          submitLabel="Save Changes"
          submitting={submitting}
          onSubmit={submit}
          onCancel={() => navigate("/purchase-requests")}
        />
      )}
    </PageTransition>
  );
}
