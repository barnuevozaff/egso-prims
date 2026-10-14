import * as React from "react";
import { useNavigate } from "react-router-dom";

import { toast } from "@/components";
import { createRequest, type RISDraftInput } from "@/features/ris/api";
import { RISForm } from "@/features/ris/components/ris-form/ris-form";
import { PortalPage, SubmissionSuccess } from "@/features/portal/components/submission-success";

/** Public RIS form — the same one-page form as the admin's, without stock, no login. */
export function PortalRISPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = React.useState(false);
  const [reference, setReference] = React.useState<string | null>(null);

  const submit = async (input: RISDraftInput) => {
    setSubmitting(true);
    try {
      const slip = await createRequest(input);
      setReference(slip.risNumber);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      // Without this a rejected submission left the button spinning for ever
      // with nothing said, and the filer had no reference number and no reason.
      toast.error(e instanceof Error ? e.message : "Unable to submit the slip");
    }
    setSubmitting(false);
  };

  return (
    // Named as the card on the home page names it, which is the form's own
    // title: a Requisition and Issue Slip, not a "Request for Issuance Slip".
    <PortalPage
      title="Create Requisition and Issue Slip"
      description="Ask for supplies from central stock. Fill in one page; the summary on the right shows what is still missing."
    >
      {reference ? (
        <SubmissionSuccess
          reference={reference}
          message="Your Requisition and Issue Slip has been received and routed to the General Services Office for approval."
        />
      ) : (
        // Portal filers have no approved PR to point at; they identify themselves.
        <RISForm
          variant="portal"
          submitLabel="Submit Requisition"
          submitting={submitting}
          onSubmit={submit}
          onCancel={() => navigate("/portal")}
        />
      )}
    </PortalPage>
  );
}
