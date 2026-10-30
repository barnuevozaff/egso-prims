import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";

import { ContainerCard, ErrorState, PageTransition, Skeleton, SkeletonText, toast } from "@/components";
import { useAuth } from "@/features/auth/auth-context";
import { can } from "@/features/auth/types";
import { departmentByCode } from "@/features/purchase-requests/types";
import { updateRequest, type RISDraftInput } from "@/features/ris/api";
import { RISActions } from "@/features/ris/components/ris-actions";
import { RISDetailPanels } from "@/features/ris/components/ris-detail-panels";
import { RISForm } from "@/features/ris/components/ris-form/ris-form";
import { useRequest } from "@/features/ris/hooks";
import { buildRISTimeline } from "@/features/ris/lib";
import { RISPrintSheet } from "@/features/shared/procurement-sheets";
import { RecordHistory } from "@/features/shared/record-history";
import { RecordPageHeader } from "@/features/shared/record-page";

/**
 * A requisition and issue slip on its own page (30 Oct 2026), as the purchase
 * order has it: a slip opens ready to edit while it is a draft or pending,
 * with its actions (Print, Return, Reject, Submit or Approve) at the top and
 * its history below; an approved, rejected or voided slip opens read-only.
 * Saving stays on the page.
 */
export function RISPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: ris, loading, setData } = useRequest(id);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  if (loading && !ris) {
    return (
      <PageTransition className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <ContainerCard padded>
          <SkeletonText lines={10} />
        </ContainerCard>
      </PageTransition>
    );
  }
  if (!ris) {
    return (
      <PageTransition>
        <ContainerCard className="mx-auto w-full max-w-3xl">
          <ErrorState
            title="Issuance slip not found"
            description="It may have been voided, or the link is out of date."
            action={{ label: "Back to list", onClick: () => navigate("/ris") }}
          />
        </ContainerCard>
      </PageTransition>
    );
  }

  // Once approved, what was issued stays as issued (firestore.rules).
  const editable = (ris.status === "Draft" || ris.status === "Pending Approval") && can(user, "manage:ris");

  const save = async (input: RISDraftInput) => {
    setSaving(true);
    try {
      const updated = await updateRequest(ris.id, input);
      setData(updated);
      toast.success(`${updated.risNumber} saved`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save the requisition and issue slip");
    }
    setSaving(false);
  };

  return (
    <PageTransition className="w-full max-w-[1400px] space-y-5 pb-10">
      {/* The official slip, as saved, is what prints. */}
      <RISPrintSheet ris={ris} />
      <RecordPageHeader
        back={{ to: "/ris", label: "Requisition & issue slips" }}
        number={ris.risNumber}
        status={ris.status}
        description={`${ris.requester} · ${departmentByCode(ris.departmentCode).name}${ris.prNumber ? ` · from ${ris.prNumber}` : ""}`}
        actions={<RISActions ris={ris} onUpdated={setData} locked={editable && dirty} />}
        note={editable && dirty ? "Save or undo your changes to print, submit or approve the slip." : undefined}
      />

      {editable ? (
        <>
          {/* A fresh form after each save, so it holds what was saved. */}
          <RISForm
            key={ris.updatedAt}
            variant="admin"
            initial={ris}
            submitLabel="Save changes"
            submitting={saving}
            onSubmit={save}
            onCancel={() => navigate("/ris")}
            onDirtyChange={setDirty}
          />
          <RecordHistory steps={buildRISTimeline(ris)} changes={ris.history} updatedAt={ris.updatedAt} />
        </>
      ) : (
        <div className="rounded-[14px] border border-[#e6e6e3] bg-white px-5 py-5 sm:px-6">
          <RISDetailPanels ris={ris} />
        </div>
      )}
    </PageTransition>
  );
}
