import * as React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, Printer, ShoppingCart, Undo2 } from "lucide-react";

import { Button, ConfirmationModal, WarningModal, toast } from "@/components";
import { ensurePurchaseOrderForPR, setPurchaseRequestStatus } from "@/features/purchase-requests/api";
import { canRaisePO, nextApprovalStatus } from "@/features/purchase-requests/lib";
import type { PurchaseRequest } from "@/features/purchase-requests/types";
import { useAuth } from "@/features/auth/auth-context";
import { can, canEditPurchaseRequest } from "@/features/auth/types";

/**
 * A request's actions, on its own page (30 Oct 2026; formerly the drawer's
 * footer): Print, Go to PO or Create linked PO, Return, and Submit, Approve
 * or Mark Completed. The page holds them while the request has unsaved
 * changes. firestore.rules and the approval function enforce the same rules,
 * whatever is shown here.
 */
export function PRActions({
  pr,
  onUpdated,
  locked,
}: {
  pr: PurchaseRequest;
  onUpdated: (pr: PurchaseRequest) => void;
  /** Unsaved changes on the page: nothing is approved or printed until they are saved. */
  locked?: boolean;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [confirmApprove, setConfirmApprove] = React.useState(false);
  const [confirmReturn, setConfirmReturn] = React.useState(false);
  const [confirmCreatePO, setConfirmCreatePO] = React.useState(false);
  const [acting, setActing] = React.useState(false);

  // Approving creates the request's order (21 Oct 2026): afterwards the page
  // leads to it. A request approved before then may have none yet; an
  // Administrator links or creates it once (ensurePurchaseOrderForPR).
  const missingPO = canRaisePO(pr.status) && !pr.poNumber && can(user, "manage:purchase-orders");
  // Deciding — approving, returning, completing — needs an Administrator or
  // an authorised approver; submitting a draft needs its owner or a decider.
  const decides = can(user, "approve:purchase-requests");
  const edits = canEditPurchaseRequest(user, pr);
  const candidate = nextApprovalStatus(pr.status);
  // Completing the request is not needed to reach its order, so it is not offered once the order exists.
  const next =
    candidate === "Submitted"
      ? edits
        ? candidate
        : null
      : decides && !(candidate === "Completed" && pr.poNumber)
        ? candidate
        : null;
  // An approved request whose order exists is not returned (firestore.rules): the order was authorized by it.
  const canReturn = decides && (pr.status === "Submitted" || (pr.status === "Approved" && !pr.poNumber));
  const actor = { by: user?.name ?? "Staff", office: user?.office ?? "General Services Office" };
  // Submitting a draft is not an approval, so it is not labelled as one.
  const actionLabel = next === "Completed" ? "Mark Completed" : next === "Submitted" ? "Submit" : "Approve";

  /** Links the request's existing order, or creates it once; then opens it. */
  const createLinkedPO = async () => {
    setActing(true);
    try {
      const { poNumber, created } = await ensurePurchaseOrderForPR(pr.id);
      onUpdated({ ...pr, poNumber });
      toast.success(created ? `Purchase order ${poNumber} created` : `Linked to purchase order ${poNumber}`);
      navigate(`/purchase-orders/${encodeURIComponent(poNumber)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The purchase order could not be created");
    }
    setActing(false);
    setConfirmCreatePO(false);
  };

  const approve = async () => {
    if (!next) return;
    setActing(true);
    try {
      const updated = await setPurchaseRequestStatus(pr.id, next, actor);
      onUpdated(updated);
      toast.success(
        next === "Approved"
          ? `${pr.prNumber} approved as ${updated.officialPrNumber ?? "official PR"}${updated.poNumber ? `; purchase order ${updated.poNumber} created` : ""}`
          : `${pr.prNumber} moved to ${next}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to update status");
    }
    setActing(false);
    setConfirmApprove(false);
  };

  const sendBack = async () => {
    setActing(true);
    try {
      onUpdated(await setPurchaseRequestStatus(pr.id, "Draft", { ...actor, remarks: "Returned to requester for revision" }));
      toast.success(`${pr.prNumber} returned to requester`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to return the request");
    }
    setActing(false);
    setConfirmReturn(false);
  };

  const print = () => {
    toast.info(`Preparing ${pr.prNumber} for printing`);
    // Chrome offers the tab title as the PDF's file name.
    const title = document.title;
    document.title = `Purchase Request ${pr.officialPrNumber || pr.prNumber}`;
    window.print();
    document.title = title;
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" onClick={print} disabled={locked}>
        <Printer />
        Print
      </Button>
      {/* The order created with the approval: opened, never created again. */}
      {pr.poNumber && (
        <Button variant="secondary" onClick={() => navigate(`/purchase-orders/${encodeURIComponent(pr.poNumber!)}`)}>
          <ShoppingCart />
          Go to PO
          <ArrowRight />
        </Button>
      )}
      {missingPO && (
        <Button variant="secondary" onClick={() => setConfirmCreatePO(true)} disabled={locked}>
          <ShoppingCart />
          Create linked PO
        </Button>
      )}
      {canReturn && (
        <Button variant="outline" onClick={() => setConfirmReturn(true)} disabled={locked}>
          <Undo2 />
          Return
        </Button>
      )}
      {next && (
        <Button onClick={() => setConfirmApprove(true)} disabled={locked}>
          <CheckCircle2 />
          {actionLabel}
        </Button>
      )}

      {/* No approval without a purpose (approved 21 Oct 2026; the approval
          function refuses it too): the GSO completes it first, on this page. */}
      {next === "Approved" && !pr.purpose.trim() ? (
        <WarningModal
          open={confirmApprove}
          onOpenChange={setConfirmApprove}
          title="Add the purpose first"
          description={`${pr.prNumber} has no purpose yet. The official Purchase Request prints it, so complete it and save before approving.`}
          confirmLabel="Add the purpose"
          onConfirm={() => {
            setConfirmApprove(false);
            document.getElementById("pr-purpose")?.focus();
          }}
        />
      ) : (
        <ConfirmationModal
          open={confirmApprove}
          onOpenChange={setConfirmApprove}
          tone="success"
          icon={CheckCircle2}
          title={next === "Completed" ? "Mark as completed?" : `Advance to ${next}?`}
          description={
            next === "Approved"
              ? `${pr.prNumber} will be approved and given its official PR number, and its purchase order is created at the same time, already authorized by this approval. The signatories in Settings are fixed on both. Approval does not record delivery, inspection or payment.`
              : `${pr.prNumber} will move from “${pr.status}” to “${next}”. This is recorded in the approval timeline.`
          }
          confirmLabel={actionLabel}
          loading={acting}
          onConfirm={approve}
        />
      )}
      <ConfirmationModal
        open={confirmCreatePO}
        onOpenChange={setConfirmCreatePO}
        icon={ShoppingCart}
        title={`Create the purchase order for ${pr.officialPrNumber ?? pr.prNumber}?`}
        description="This request was approved before purchase orders were created with the approval. If an order was already raised from it, that order is linked instead; otherwise one is created, once, with its items. Supplier and delivery details can be completed afterwards."
        confirmLabel="Create linked PO"
        loading={acting}
        onConfirm={createLinkedPO}
      />
      <WarningModal
        open={confirmReturn}
        onOpenChange={setConfirmReturn}
        title="Return to requester?"
        description={`${pr.prNumber} will be sent back to ${pr.requester} as a draft for revision. The action is recorded in the history.`}
        confirmLabel="Return Request"
        loading={acting}
        onConfirm={sendBack}
      />
    </div>
  );
}
