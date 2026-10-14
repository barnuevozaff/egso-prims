import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { PageHeader, PageTransition, toast } from "@/components";
import { createRequest, type RISDraftInput } from "@/features/ris/api";
import { RISForm } from "@/features/ris/components/ris-form/ris-form";

export function RISCreatePage() {
  const navigate = useNavigate();
  // Set when the slip was issued from a released purchase order.
  const [params] = useSearchParams();
  const sourcePr = params.get("pr") ?? undefined;
  const sourcePo = params.get("po") ?? undefined;
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async (input: RISDraftInput) => {
    setSubmitting(true);
    try {
      const ris = await createRequest(input);
      toast.success(`${ris.risNumber} submitted for approval`);
      navigate("/ris");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to submit the requisition and issue slip");
    }
    setSubmitting(false);
  };

  return (
    <PageTransition className="space-y-6">
      <PageHeader
        title="New Requisition and Issue Slip"
        description={
          sourcePo
            ? `Issuing stock received against ${sourcePo}.`
            : "Issue stock items against an approved purchase request."
        }
      />
      <RISForm
        variant="admin"
        submitLabel="Submit Slip"
        initialPrNumber={sourcePr}
        initialPoNumber={sourcePo}
        submitting={submitting}
        onSubmit={submit}
        onCancel={() => navigate("/ris")}
      />
    </PageTransition>
  );
}
