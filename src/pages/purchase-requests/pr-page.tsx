import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";

import { ContainerCard, ErrorState, PageTransition, Skeleton, SkeletonText, toast } from "@/components";
import { useAuth } from "@/features/auth/auth-context";
import { canEditPurchaseRequest } from "@/features/auth/types";
import { updatePurchaseRequest, type PRDraftInput } from "@/features/purchase-requests/api";
import { PRActions } from "@/features/purchase-requests/components/pr-actions";
import { PRDetailPanels } from "@/features/purchase-requests/components/pr-detail-panels";
import { PRForm } from "@/features/purchase-requests/components/pr-form/pr-form";
import { usePurchaseRequest } from "@/features/purchase-requests/hooks";
import { buildApprovalTimeline, formatDate } from "@/features/purchase-requests/lib";
import { departmentByCode } from "@/features/purchase-requests/types";
import { PRPrintSheet } from "@/features/shared/procurement-sheets";
import { RecordHistory } from "@/features/shared/record-history";
import { RecordPageHeader } from "@/features/shared/record-page";

/**
 * A purchase request on its own page (30 Oct 2026), as the purchase order
 * has it: a draft or submitted request opens ready to edit, with its actions
 * (Print, Return, Submit or Approve, Go to PO) at the top and its history
 * below; an approved, completed, rejected or voided request opens read-only.
 * An approved request is an official document: it is returned to draft to be
 * revised (21 Oct 2026). Saving stays on the page.
 */
export function PRPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: pr, loading, setData } = usePurchaseRequest(id);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  if (loading && !pr) {
    return (
      <PageTransition className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <ContainerCard padded>
          <SkeletonText lines={10} />
        </ContainerCard>
      </PageTransition>
    );
  }
  if (!pr) {
    return (
      <PageTransition>
        <ContainerCard className="mx-auto w-full max-w-3xl">
          <ErrorState
            title="Purchase request not found"
            description="It may have been voided, or the link is out of date."
            action={{ label: "Back to list", onClick: () => navigate("/purchase-requests") }}
          />
        </ContainerCard>
      </PageTransition>
    );
  }

  const editable = (pr.status === "Draft" || pr.status === "Submitted") && canEditPurchaseRequest(user, pr);

  const save = async (input: PRDraftInput) => {
    setSaving(true);
    try {
      const updated = await updatePurchaseRequest(pr.id, input);
      setData(updated);
      toast.success(`${updated.prNumber} saved`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save the purchase request");
    }
    setSaving(false);
  };

  return (
    <PageTransition className="w-full max-w-[1400px] space-y-5 pb-10">
      {/* The official request, as saved, is what prints. */}
      <PRPrintSheet pr={pr} />
      <RecordPageHeader
        back={{ to: "/purchase-requests", label: "Purchase requests" }}
        number={pr.prNumber}
        status={pr.status}
        description={`${departmentByCode(pr.departmentCode).name} · filed ${formatDate(pr.createdAt)}${pr.officialPrNumber ? ` · official PR No. ${pr.officialPrNumber}` : ""}`}
        actions={<PRActions pr={pr} onUpdated={setData} locked={editable && dirty} />}
        note={editable && dirty ? "Save or undo your changes to print, submit or approve the request." : undefined}
      />

      {editable ? (
        <>
          {/* A fresh form after each save, so it holds what was saved. */}
          <PRForm
            key={pr.updatedAt}
            initial={pr}
            submitLabel="Save changes"
            submitting={saving}
            onSubmit={save}
            onCancel={() => navigate("/purchase-requests")}
            onDirtyChange={setDirty}
          />
          <RecordHistory steps={buildApprovalTimeline(pr)} changes={pr.history} updatedAt={pr.updatedAt} />
        </>
      ) : (
        <div className="rounded-[14px] border border-[#e6e6e3] bg-white px-5 py-5 sm:px-6">
          <PRDetailPanels pr={pr} />
        </div>
      )}
    </PageTransition>
  );
}
