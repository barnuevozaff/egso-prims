import * as React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, Pencil, Printer, ShoppingCart, Undo2 } from "lucide-react";

import {
  Button,
  ConfirmationModal,
  Drawer,
  DrawerActions,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Skeleton,
  SkeletonText,
  StatusBadge,
  WarningModal,
  toast,
} from "@/components";
import { ensurePurchaseOrderForPR, setPurchaseRequestStatus } from "@/features/purchase-requests/api";
import { usePurchaseRequest } from "@/features/purchase-requests/hooks";
import { canRaisePO, formatDate, nextApprovalStatus } from "@/features/purchase-requests/lib";
import { departmentByCode } from "@/features/purchase-requests/types";
import { useAuth } from "@/features/auth/auth-context";
import { can, canEditPurchaseRequest } from "@/features/auth/types";
import { PRPrintSheet } from "@/features/shared/procurement-sheets";
import { PRDetailPanels } from "@/features/purchase-requests/components/pr-detail-panels";

/** Right slide-over showing the full purchase request. */
export function PRDrawer({
  prId,
  open,
  onOpenChange,
  onChanged,
  onEdit,
}: {
  prId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after any mutation so the list can refresh. */
  onChanged?: () => void;
  onEdit?: (prId: string) => void;
}) {
  const navigate = useNavigate();
  const { data: pr, loading, setData } = usePurchaseRequest(open ? prId : null);
  const [confirmApprove, setConfirmApprove] = React.useState(false);
  const [confirmReturn, setConfirmReturn] = React.useState(false);
  const [acting, setActing] = React.useState(false);
  const [confirmCreatePO, setConfirmCreatePO] = React.useState(false);

  /** Links the request's existing order, or creates it once; then opens it. */
  const createLinkedPO = async () => {
    if (!pr) return;
    setActing(true);
    try {
      const { poNumber, created } = await ensurePurchaseOrderForPR(pr.id);
      setData({ ...pr, poNumber });
      toast.success(created ? `Purchase order ${poNumber} created` : `Linked to purchase order ${poNumber}`);
      onChanged?.();
      navigate(`/purchase-orders/${encodeURIComponent(poNumber)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The purchase order could not be created");
    }
    setActing(false);
    setConfirmCreatePO(false);
  };

  const { user } = useAuth();
  // Approving creates the request's order (21 Oct 2026): afterwards the drawer
  // leads to it. A request approved before then may have none yet; an
  // Administrator links or creates it once (ensurePurchaseOrderForPR).
  const missingPO = !!pr && canRaisePO(pr.status) && !pr.poNumber && can(user, "manage:purchase-orders");
  // Deciding — approving, returning, completing — needs an Administrator or
  // an authorised approver; submitting a draft needs its owner or a decider.
  // firestore.rules enforce the same, whatever is shown here.
  const decides = can(user, "approve:purchase-requests");
  const edits = !!pr && canEditPurchaseRequest(user, pr);
  const candidate = pr ? nextApprovalStatus(pr.status) : null;
  // Completing the request is not needed to reach its order, so it is not offered once the order exists.
  const next =
    candidate === "Submitted"
      ? edits
        ? candidate
        : null
      : decides && !(candidate === "Completed" && pr?.poNumber)
        ? candidate
        : null;
  // An approved request whose order exists is not returned (firestore.rules): the order was authorized by it.
  const canReturn = decides && !!pr && (pr.status === "Submitted" || (pr.status === "Approved" && !pr.poNumber));
  const actor = { by: user?.name ?? "Staff", office: user?.office ?? "General Services Office" };
  // Submitting a draft is not an approval, so it is not labelled as one.
  const actionLabel = next === "Completed" ? "Mark Completed" : next === "Submitted" ? "Submit" : "Approve";

  const approve = async () => {
    if (!pr || !next) return;
    setActing(true);
    try {
      const updated = await setPurchaseRequestStatus(pr.id, next, actor);
      setData(updated);
      toast.success(
        next === "Approved"
          ? `${pr.prNumber} approved as ${updated.officialPrNumber ?? "official PR"}${updated.poNumber ? `; purchase order ${updated.poNumber} created` : ""}`
          : `${pr.prNumber} moved to ${next}`,
      );
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to update status");
    }
    setActing(false);
    setConfirmApprove(false);
  };

  const sendBack = async () => {
    if (!pr) return;
    setActing(true);
    try {
      const updated = await setPurchaseRequestStatus(pr.id, "Draft", {
        ...actor,
        remarks: "Returned to requester for revision",
      });
      setData(updated);
      toast.success(`${pr.prNumber} returned to requester`);
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to return the request");
    }
    setActing(false);
    setConfirmReturn(false);
  };

  return (
    <>
      {/* The printed document lives outside the drawer: dialogs never print. */}
      {open && pr && <PRPrintSheet pr={pr} />}
      <Drawer open={open} onOpenChange={onOpenChange} size="2xl">
      {loading || !pr ? (
        <div className="p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-2 h-3 w-56" />
          <SkeletonText lines={6} className="mt-6" />
        </div>
      ) : (
        <>
          <DrawerHeader
            title={pr.prNumber}
            description={`${departmentByCode(pr.departmentCode).name} · filed ${formatDate(pr.createdAt)}`}
            onClose={() => onOpenChange(false)}
          >
            {/* Status and official number in the header; the rest is in the body. */}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
              <StatusBadge status={pr.status} />
              {pr.officialPrNumber && (
                <span className="text-[#5b606b]">
                  Official PR No.{" "}
                  <span className="font-['Geist_Mono',ui-monospace,monospace] text-neutral-900">{pr.officialPrNumber}</span>
                </span>
              )}
            </div>
          </DrawerHeader>
          <DrawerBody>
            <PRDetailPanels pr={pr} />
          </DrawerBody>
          <DrawerFooter>
            <DrawerActions>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  toast.info(`Preparing ${pr.prNumber} for printing`);
                  // Chrome offers the tab title as the PDF's file name.
                  const title = document.title;
                  document.title = `Purchase Request ${pr.officialPrNumber || pr.prNumber}`;
                  window.print();
                  document.title = title;
                }}
              >
                <Printer />
                Print
              </Button>
              {/* An approved request is an official document: it is returned to draft to be revised (21 Oct 2026). */}
              {edits && (pr.status === "Draft" || pr.status === "Submitted") && (
                <Button variant="secondary" onClick={() => onEdit?.(pr.id)}>
                  <Pencil />
                  Edit
                </Button>
              )}
              {/* The order created with the approval: opened, never created again. */}
              {pr.poNumber && (
                <Button variant="secondary" onClick={() => navigate(`/purchase-orders/${encodeURIComponent(pr.poNumber!)}`)}>
                  <ShoppingCart />
                  Go to PO
                  <ArrowRight />
                </Button>
              )}
              {missingPO && (
                <Button variant="secondary" onClick={() => setConfirmCreatePO(true)}>
                  <ShoppingCart />
                  Create linked PO
                </Button>
              )}
              {canReturn && (
                <Button variant="outline" onClick={() => setConfirmReturn(true)}>
                  <Undo2 />
                  Return
                </Button>
              )}
              {next && (
                <Button onClick={() => setConfirmApprove(true)}>
                  <CheckCircle2 />
                  {actionLabel}
                </Button>
              )}
            </DrawerActions>
          </DrawerFooter>

          {/* No approval without a purpose (approved 21 Oct 2026; the approval
              function refuses it too): the GSO is sent to complete it first.
              The fund is optional (22 Oct 2026). */}
          {next === "Approved" && !pr.purpose.trim() ? (
            <WarningModal
              open={confirmApprove}
              onOpenChange={setConfirmApprove}
              title="Add the purpose first"
              description={`${pr.prNumber} has no purpose yet. The official Purchase Request prints it, so complete it before approving.`}
              confirmLabel="Edit Request"
              onConfirm={() => {
                setConfirmApprove(false);
                onEdit?.(pr.id);
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
        </>
      )}
      </Drawer>
    </>
  );
}
