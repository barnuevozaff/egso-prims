import * as React from "react";
import { useNavigate } from "react-router-dom";

import { toast } from "@/components";
import { createPurchaseRequest, type PRDraftInput } from "@/features/purchase-requests/api";
import { PRForm } from "@/features/purchase-requests/components/pr-form/pr-form";
import { PortalPage, SubmissionSuccess } from "@/features/portal/components/submission-success";
import { portalPath } from "@/features/portal/paths";

/** Public Purchase Request form — the same one-page form as the admin's, no login. */
export function PortalRequestPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = React.useState(false);
  const [reference, setReference] = React.useState<string | null>(null);

  const submit = async (input: PRDraftInput) => {
    setSubmitting(true);
    try {
      const pr = await createPurchaseRequest(input);
      setReference(pr.prNumber);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      // Without this a rejected submission left the button spinning for ever
      // with nothing said, and the filer had no reference number and no reason.
      toast.error(e instanceof Error ? e.message : "Unable to submit the purchase request");
    }
    setSubmitting(false);
  };

  return (
    <PortalPage
      title="Create Purchase Request"
      description="Enter the requesting office, your name, the purpose and the items needed. Optional fields may be left blank."
    >
      {reference ? (
        <SubmissionSuccess
          reference={reference}
          message="Your Purchase Request has been received and routed to the General Services Office for review."
        />
      ) : (
        <PRForm
          audience="public"
          submitLabel="Submit Purchase Request"
          submitting={submitting}
          onSubmit={submit}
          onCancel={() => navigate(portalPath())}
        />
      )}
    </PortalPage>
  );
}
