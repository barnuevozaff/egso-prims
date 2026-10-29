import * as React from "react";
import {
  CheckCircle2,
  FileDown,
  Pencil,
  Printer,
  Send,
  Undo2,
  XCircle,
} from "lucide-react";

import {
  Button,
  ConfirmationModal,
  Drawer,
  DrawerActions,
  Field,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Skeleton,
  SkeletonText,
  Spinner,
  StatusBadge,
  Textarea,
  WarningModal,
  toast,
} from "@/components";
import { listInventoryItems } from "@/features/inventory/api";
import type { InventoryItem } from "@/features/inventory/types";
import { approveRequest, rejectRequest, setRequestStatus } from "@/features/ris/api";
import { useRequest } from "@/features/ris/hooks";
import { nextRISStatus } from "@/features/ris/lib";
import { RISDetailPanels } from "@/features/ris/components/ris-detail-panels";
import { RISPrintSheet } from "@/features/shared/procurement-sheets";
import { reportLoadFailure } from "@/features/shared/load-guard";
import { useAuth } from "@/features/auth/auth-context";
import { can } from "@/features/auth/types";

/** Right slide-over showing the full issuance slip. */
export function RISDrawer({
  risId,
  open,
  onOpenChange,
  onChanged,
  onEdit,
}: {
  risId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
  onEdit?: (risId: string) => void;
}) {
  const { user } = useAuth();
  const { data: ris, loading, setData } = useRequest(open ? risId : null);
  const [confirmAdvance, setConfirmAdvance] = React.useState(false);
  const [confirmReturn, setConfirmReturn] = React.useState(false);
  const [confirmReject, setConfirmReject] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState("");
  const [acting, setActing] = React.useState(false);
  const [stock, setStock] = React.useState<InventoryItem[] | null>(null);

  // Since 22 Oct 2026: Draft -> Pending Approval -> Approved (stock issued) or Rejected.
  const next = ris ? nextRISStatus(ris.status) : null;
  const approving = next === "Approved";
  const pending = ris?.status === "Pending Approval";
  const isAdmin = user?.role === "Administrator";
  const manages = can(user, "manage:ris");

  const openAdvance = () => {
    setConfirmAdvance(true);
    if (approving) {
      setStock(null);
      void listInventoryItems()
        .then(setStock)
        .catch((e) => reportLoadFailure(e, "stock levels"));
    }
  };

  const advance = async () => {
    if (!ris || !next || acting) return;
    setActing(true);
    try {
      const who = { by: user?.name ?? "Staff", office: "General Services Office" };
      // Approval issues the stock on the server, once; submitting moves no stock.
      const updated = approving ? await approveRequest(ris.id, who) : await setRequestStatus(ris.id, next, who);
      setData(updated);
      toast.success(approving ? `${ris.risNumber} approved — stock issued` : `${ris.risNumber} submitted for approval`);
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to update the slip");
    }
    setActing(false);
    setConfirmAdvance(false);
  };

  const sendBack = async () => {
    if (!ris) return;
    setActing(true);
    try {
      const updated = await setRequestStatus(ris.id, "Draft", {
        by: user?.name ?? "Staff",
        office: "General Services Office",
        remarks: "Returned to requester for revision",
      });
      setData(updated);
      toast.success(`${ris.risNumber} returned as draft`);
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to return the slip");
    }
    setActing(false);
    setConfirmReturn(false);
  };

  const reject = async () => {
    if (!ris || !rejectReason.trim()) return;
    setActing(true);
    try {
      const updated = await rejectRequest(ris.id, {
        reason: rejectReason,
        by: user?.name ?? "Staff",
        office: "General Services Office",
      });
      setData(updated);
      toast.success(`${ris.risNumber} rejected — no stock was issued`);
      onChanged?.();
      setConfirmReject(false);
      setRejectReason("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to reject the slip");
    }
    setActing(false);
  };

  const primaryLabel = approving ? "Approve" : "Submit for Approval";
  // Lines that issue stock, against the register as it stands.
  const issuing = ris ? ris.items.filter((it) => it.issuedQty > 0) : [];
  const insufficient =
    approving && stock
      ? issuing.filter((it) => {
          const inv = stock.find((s) => s.id === it.inventoryItemId);
          const total = issuing
            .filter((x) => x.inventoryItemId && x.inventoryItemId === it.inventoryItemId)
            .reduce((n, x) => n + x.issuedQty, 0);
          return !inv || total > inv.onHand;
        })
      : [];

  return (
    <>
      {/* The printed document lives outside the drawer: dialogs never print. */}
      {open && ris && <RISPrintSheet ris={ris} />}
      <Drawer open={open} onOpenChange={onOpenChange} size="2xl">
      {loading || !ris ? (
        <div className="p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-2 h-3 w-56" />
          <SkeletonText lines={6} className="mt-6" />
        </div>
      ) : (
        <>
          <DrawerHeader
            title={ris.risNumber}
            description={`${ris.requester} · from ${ris.prNumber}${ris.poNumber ? ` · ${ris.poNumber}` : ""}`}
            onClose={() => onOpenChange(false)}
          >
            <div className="mt-2">
              <StatusBadge status={ris.status} />
            </div>
          </DrawerHeader>
          <DrawerBody>
            <RISDetailPanels
              ris={ris}
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
                onClick={() => toast.success(`Exporting ${ris.risNumber} as PDF`)}
              >
                <FileDown />
                Export PDF
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  toast.info(`Preparing ${ris.risNumber} for printing`);
                  window.print();
                }}
              >
                <Printer />
                Print
              </Button>
              {/* Only a draft or a pending slip is edited: once approved, what
                  was issued stays as issued (firestore.rules). */}
              {(ris.status === "Draft" || pending) && manages && (
                <Button variant="secondary" onClick={() => onEdit?.(ris.id)}>
                  <Pencil />
                  Edit
                </Button>
              )}
              {pending && manages && (
                <Button variant="outline" onClick={() => setConfirmReturn(true)}>
                  <Undo2 />
                  Return
                </Button>
              )}
              {pending && isAdmin && (
                <Button variant="outline" onClick={() => setConfirmReject(true)}>
                  <XCircle />
                  Reject
                </Button>
              )}
              {next && (approving ? isAdmin : manages) && (
                <Button onClick={openAdvance}>
                  {approving ? <CheckCircle2 /> : <Send />}
                  {primaryLabel}
                </Button>
              )}
            </DrawerActions>
          </DrawerFooter>

          <ConfirmationModal
            open={confirmAdvance}
            onOpenChange={setConfirmAdvance}
            tone="success"
            icon={approving ? CheckCircle2 : Send}
            title={approving ? `Approve ${ris.risNumber}?` : `Submit ${ris.risNumber} for approval?`}
            description={
              approving
                ? "Approving issues the items: the quantities below are deducted from inventory now, with a line on each item’s stock card. This happens once."
                : "The slip goes to the General Services Office for approval. No stock moves until it is approved."
            }
            confirmLabel={primaryLabel}
            loading={acting}
            // Approving more than is on hand would drive stock below zero; the server refuses it too.
            confirmDisabled={approving && (!stock || insufficient.length > 0 || issuing.length === 0)}
            onConfirm={advance}
          >
            {approving && (
              <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50/60 p-3">
                {!stock ? (
                  <Spinner size="sm" label="Checking stock balances…" />
                ) : (
                  <ul className="space-y-1.5">
                    {issuing.map((it) => {
                      const inv = stock.find((s) => s.id === it.inventoryItemId);
                      const after = (inv?.onHand ?? 0) - it.issuedQty;
                      const short = !inv || after < 0;
                      return (
                        <li
                          key={it.id}
                          className="flex items-center justify-between gap-3 text-[11.5px]"
                        >
                          <span className="min-w-0 truncate text-neutral-700">
                            {it.name} <span className="text-neutral-500">· {it.issuedQty} {it.unit}</span>
                          </span>
                          <span
                            className={
                              "shrink-0 tabular-nums " +
                              (short ? "font-medium text-red-600" : "text-neutral-500")
                            }
                          >
                            {inv?.onHand ?? 0} → {after}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {insufficient.length > 0 && (
                  <p className="mt-2 text-[11.5px] font-medium text-red-600">
                    Not enough stock, or not linked to an inventory item, for {insufficient.length} line
                    {insufficient.length === 1 ? "" : "s"} — edit the slip before approving.
                  </p>
                )}
                {stock && issuing.length === 0 && (
                  <p className="mt-2 text-[11.5px] font-medium text-red-600">
                    Nothing to issue — set the quantities to issue first.
                  </p>
                )}
              </div>
            )}
          </ConfirmationModal>
          <WarningModal
            open={confirmReturn}
            onOpenChange={setConfirmReturn}
            title="Return to requester?"
            description={`${ris.risNumber} will be reverted to Draft for revision. The action is recorded in the history.`}
            confirmLabel="Return Slip"
            loading={acting}
            onConfirm={sendBack}
          />
          <WarningModal
            open={confirmReject}
            onOpenChange={(o) => {
              setConfirmReject(o);
              if (!o) setRejectReason("");
            }}
            title={`Reject ${ris.risNumber}?`}
            description="The slip is closed as Rejected and no stock is issued. The reason is shown to the requester when they track it."
            confirmLabel="Reject Slip"
            loading={acting}
            confirmDisabled={!rejectReason.trim()}
            onConfirm={reject}
          >
            <Field label="Reason" required className="mt-3">
              <Textarea
                rows={3}
                maxLength={500}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Item not available this quarter"
              />
            </Field>
          </WarningModal>
        </>
      )}
      </Drawer>
    </>
  );
}
