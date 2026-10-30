import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Button, PageHeader, PageTransition, Spinner, toast } from "@/components";
import { savedMessage } from "@/features/records/workflow";
import { updateAppraisal } from "@/features/records/inventory-api";
import { useAppraisal } from "@/features/records/inventory-hooks";
import { AppraisalForm } from "@/features/records/components/appraisal-form";
import type { AppraisalInput } from "@/features/records/inventory-types";

export function InventoryEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: appraisal, loading } = useAppraisal(id);
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async (input: AppraisalInput) => {
    if (!id) return;
    setSubmitting(true);
    try {
      await updateAppraisal(id, input);
      if (appraisal) toast.success(savedMessage(appraisal.inventoryNo, appraisal.status === "Cancelled" ? null : appraisal.status, input.status));
      navigate(`/records/inventory/${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to update the inventory");
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

  if (!appraisal) {
    return (
      <PageTransition className="space-y-6">
        <PageHeader
          title="Inventory not found"
          description="This records inventory no longer exists."
        />
        <Button variant="outline" onClick={() => navigate("/records/inventory")}>
          Back to Records Inventory
        </Button>
      </PageTransition>
    );
  }

  if (appraisal.status === "Cancelled") {
    return (
      <PageTransition className="space-y-6">
        <PageHeader title="This form is voided" description="A voided form keeps its number and history and can no longer be changed." />
        <Button variant="outline" onClick={() => navigate(`/records/inventory/${appraisal.id}`)}>
          Back to the form
        </Button>
      </PageTransition>
    );
  }

  return (
    <PageTransition className="space-y-6">
      <PageHeader
        title={`Edit ${appraisal.inventoryNo}`}
        description="Records Inventory and Appraisal"
      />
      <AppraisalForm
        initial={appraisal}
        submitting={submitting}
        onSubmit={submit}
        onCancel={() => navigate(`/records/inventory/${appraisal.id}`)}
      />
    </PageTransition>
  );
}
