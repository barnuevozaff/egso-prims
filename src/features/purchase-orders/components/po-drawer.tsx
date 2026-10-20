import * as React from "react";
import {
  BadgeCheck,
  CheckCircle2,
  FileDown,
  Pencil,
  Printer,
  Send,
  Undo2,
} from "lucide-react";

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
import {
  acknowledgePurchaseOrder,
  issuePurchaseOrder,
  setPurchaseOrderStatus,
} from "@/features/purchase-orders/api";
import { usePurchaseOrder } from "@/features/purchase-orders/hooks";
import { canAcknowledgePO, canIssuePO, nextPOStatus } from "@/features/purchase-orders/lib";
import { poSupplierName } from "@/features/purchase-orders/types";
import { PODetailPanels } from "@/features/purchase-orders/components/po-detail-panels";
import { POPrintSheet } from "@/features/shared/procurement-sheets";
import { useAuth } from "@/features/auth/auth-context";
import { can } from "@/features/auth/types";

/** Right slide-over showing the full purchase order. */
export function PODrawer({
  poId,
  open,
  onOpenChange,
  onChanged,
  onEdit,
}: {
  poId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
  onEdit?: (poId: string) => void;
}) {
  const { user } = useAuth();
  const { data: po, loading, setData } = usePurchaseOrder(open ? poId : null);
  const [confirmApprove, setConfirmApprove] = React.useState(false);
  const [confirmReturn, setConfirmReturn] = React.useState(false);
  const [acting, setActing] = React.useState(false);

  const next = po ? nextPOStatus(po.status) : null;
  const terminal = po ? ["Cancelled", "Completed"].includes(po.status) : false;

  const advance = async () => {
    if (!po || !next) return;
    setActing(true);
    try {
      const updated = await setPurchaseOrderStatus(po.id, next, {
        by: user?.name ?? "Staff",
        office: "General Services Office",
      });
      setData(updated);
      toast.success(`${po.poNumber} moved to ${next}`);
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to update status");
    }
    setActing(false);
    setConfirmApprove(false);
  };

  const sendBack = async () => {
    if (!po) return;
    setActing(true);
    try {
      const updated = await setPurchaseOrderStatus(po.id, "Draft", {
        by: user?.name ?? "Staff",
        office: "General Services Office",
        remarks: "Returned for revision",
      });
      setData(updated);
      toast.success(`${po.poNumber} returned as draft`);
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to return the order");
    }
    setActing(false);
    setConfirmReturn(false);
  };

  const approveLabel = next === "Approved" ? "Approve" : next ? `Mark ${next}` : "";

  /* ---------------- handover to the supplier ---------------- */
  // Two actions that follow approval, in order: the order is issued, then the
  // supplier acknowledges it. Only after that can stock be issued against it.
  const [confirmIssue, setConfirmIssue] = React.useState(false);
  const [confirmAck, setConfirmAck] = React.useState(false);

  const issue = async () => {
    if (!po) return;
    setActing(true);
    try {
      setData(await issuePurchaseOrder(po.id, { by: "Administrator" }));
      toast.success(`${po.poNumber} issued to ${poSupplierName(po)}`);
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to issue the order");
    }
    setActing(false);
    setConfirmIssue(false);
  };

  const acknowledge = async () => {
    if (!po) return;
    setActing(true);
    try {
      setData(await acknowledgePurchaseOrder(po.id, { by: poSupplierName(po) }));
      toast.success(`${po.poNumber} acknowledged`);
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to acknowledge the order");
    }
    setActing(false);
    setConfirmAck(false);
  };

  return (
    <>
      {/* The printed document lives outside the drawer: dialogs never print. */}
      {open && po && <POPrintSheet po={po} />}
      <Drawer open={open} onOpenChange={onOpenChange} size="2xl">
      {loading || !po ? (
        <div className="p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-2 h-3 w-56" />
          <SkeletonText lines={6} className="mt-6" />
        </div>
      ) : (
        <>
          <DrawerHeader
            title={po.poNumber}
            description={`${poSupplierName(po)} · from ${po.prNumber}`}
            onClose={() => onOpenChange(false)}
          >
            <div className="mt-2">
              <StatusBadge status={po.status} />
            </div>
          </DrawerHeader>
          <DrawerBody>
            <PODetailPanels
              po={po}
              onUpdated={(updated) => {
                setData(updated);
                onChanged?.();
              }}
            />
          </DrawerBody>
          <DrawerFooter>
            <DrawerActions>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button
                variant="secondary"
                onClick={() => toast.success(`Exporting ${po.poNumber} as PDF`)}
              >
                <FileDown />
                Export PDF
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  toast.info(`Preparing ${po.poNumber} for printing`);
                  window.print();
                }}
              >
                <Printer />
                Print
              </Button>
              {/* A voided document is closed for editing (firestore.rules), and
                  only roles that manage the module reach the edit page. */}
              {po.status !== "Cancelled" && can(user, "manage:purchase-orders") && (
                <Button variant="secondary" onClick={() => onEdit?.(po.id)}>
                  <Pencil />
                  Edit
                </Button>
              )}
              {canIssuePO(po) && (
                <Button variant="secondary" onClick={() => setConfirmIssue(true)}>
                  <Send />
                  Issue PO
                </Button>
              )}
              {canAcknowledgePO(po) && (
                <Button variant="secondary" onClick={() => setConfirmAck(true)}>
                  <BadgeCheck />
                  Acknowledge PO
                </Button>
              )}
              {!terminal && (
                <Button variant="outline" onClick={() => setConfirmReturn(true)}>
                  <Undo2 />
                  Return
                </Button>
              )}
              {next && (
                <Button onClick={() => setConfirmApprove(true)}>
                  <CheckCircle2 />
                  {approveLabel}
                </Button>
              )}
            </DrawerActions>
          </DrawerFooter>

          <ConfirmationModal
            open={confirmApprove}
            onOpenChange={setConfirmApprove}
            tone="success"
            icon={CheckCircle2}
            title={`Move to ${next}?`}
            description={`${po.poNumber} will move from “${po.status}” to “${next}”. This is recorded in the approval timeline.`}
            confirmLabel={approveLabel}
            loading={acting}
            onConfirm={advance}
          />
          <ConfirmationModal
            open={confirmIssue}
            onOpenChange={setConfirmIssue}
            tone="success"
            icon={Send}
            title={`Issue ${po.poNumber} to the supplier?`}
            description={`The order is sent to ${poSupplierName(po)} and awaits their acknowledgement. Stock cannot be issued until they acknowledge it.`}
            confirmLabel="Issue PO"
            loading={acting}
            onConfirm={issue}
          />
          <ConfirmationModal
            open={confirmAck}
            onOpenChange={setConfirmAck}
            tone="success"
            icon={BadgeCheck}
            title="Record the supplier's acknowledgement?"
            description={`${poSupplierName(po)} has confirmed receipt of ${po.poNumber}. Items may then be issued against it.`}
            confirmLabel="Acknowledge PO"
            loading={acting}
            onConfirm={acknowledge}
          />
          <WarningModal
            open={confirmReturn}
            onOpenChange={setConfirmReturn}
            title="Return as draft?"
            description={`${po.poNumber} will be reverted to Draft for revision. The action is recorded in the history.`}
            confirmLabel="Return Order"
            loading={acting}
            onConfirm={sendBack}
          />
        </>
      )}
      </Drawer>
    </>
  );
}
