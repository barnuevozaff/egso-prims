import * as React from "react";
import { CheckCircle2, Printer, Send, Undo2, XCircle } from "lucide-react";

import { Button, ConfirmationModal, Field, Spinner, Textarea, WarningModal, toast } from "@/components";
import { listInventoryItems } from "@/features/inventory/api";
import type { InventoryItem } from "@/features/inventory/types";
import { approveRequest, rejectRequest, setRequestStatus } from "@/features/ris/api";
import { nextRISStatus } from "@/features/ris/lib";
import type { RequestForIssuance } from "@/features/ris/types";
import { reportLoadFailure } from "@/features/shared/load-guard";
import { useAuth } from "@/features/auth/auth-context";
import { can } from "@/features/auth/types";

/**
 * A slip's actions, on its own page (30 Oct 2026; formerly the drawer's
 * footer): Print, and while it is open Return, Reject and Submit or Approve.
 * Since 22 Oct 2026: Draft → Pending Approval → Approved (stock issued) or
 * Rejected. The page holds them while the slip has unsaved changes.
 */
export function RISActions({
  ris,
  onUpdated,
  locked,
}: {
  ris: RequestForIssuance;
  onUpdated: (ris: RequestForIssuance) => void;
  /** Unsaved changes on the page: nothing is approved or printed until they are saved. */
  locked?: boolean;
}) {
  const { user } = useAuth();
  const [confirmAdvance, setConfirmAdvance] = React.useState(false);
  const [confirmReturn, setConfirmReturn] = React.useState(false);
  const [confirmReject, setConfirmReject] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState("");
  const [acting, setActing] = React.useState(false);
  const [stock, setStock] = React.useState<InventoryItem[] | null>(null);

  const next = nextRISStatus(ris.status);
  const approving = next === "Approved";
  const pending = ris.status === "Pending Approval";
  const isAdmin = user?.role === "Administrator";
  const manages = can(user, "manage:ris");
  const who = { by: user?.name ?? "Staff", office: "General Services Office" };

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
    if (!next || acting) return;
    setActing(true);
    try {
      // Approval issues the stock on the server, once; submitting moves no stock.
      const updated = approving ? await approveRequest(ris.id, who) : await setRequestStatus(ris.id, next, who);
      onUpdated(updated);
      toast.success(approving ? `${ris.risNumber} approved — stock issued` : `${ris.risNumber} submitted for approval`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to update the slip");
    }
    setActing(false);
    setConfirmAdvance(false);
  };

  const sendBack = async () => {
    setActing(true);
    try {
      onUpdated(await setRequestStatus(ris.id, "Draft", { ...who, remarks: "Returned to requester for revision" }));
      toast.success(`${ris.risNumber} returned as draft`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to return the slip");
    }
    setActing(false);
    setConfirmReturn(false);
  };

  const reject = async () => {
    if (!rejectReason.trim()) return;
    setActing(true);
    try {
      onUpdated(await rejectRequest(ris.id, { reason: rejectReason, ...who }));
      toast.success(`${ris.risNumber} rejected — no stock was issued`);
      setConfirmReject(false);
      setRejectReason("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to reject the slip");
    }
    setActing(false);
  };

  const print = () => {
    toast.info(`Preparing ${ris.risNumber} for printing`);
    const title = document.title;
    document.title = `Requisition and Issue Slip ${ris.risNumber}`;
    window.print();
    document.title = title;
  };

  const primaryLabel = approving ? "Approve" : "Submit for Approval";
  // Lines that issue stock, against the register as it stands.
  const issuing = ris.items.filter((it) => it.issuedQty > 0);
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
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" onClick={print} disabled={locked}>
        <Printer />
        Print
      </Button>
      {pending && manages && (
        <Button variant="outline" onClick={() => setConfirmReturn(true)} disabled={locked}>
          <Undo2 />
          Return
        </Button>
      )}
      {pending && isAdmin && (
        <Button variant="outline" onClick={() => setConfirmReject(true)} disabled={locked}>
          <XCircle />
          Reject
        </Button>
      )}
      {next && (approving ? isAdmin : manages) && (
        <Button onClick={openAdvance} disabled={locked}>
          {approving ? <CheckCircle2 /> : <Send />}
          {primaryLabel}
        </Button>
      )}

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
                    <li key={it.id} className="flex items-center justify-between gap-3 text-[11.5px]">
                      <span className="min-w-0 truncate text-neutral-700">
                        {it.name} <span className="text-neutral-500">· {it.issuedQty} {it.unit}</span>
                      </span>
                      <span className={"shrink-0 tabular-nums " + (short ? "font-medium text-red-600" : "text-neutral-500")}>
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
              <p className="mt-2 text-[11.5px] font-medium text-red-600">Nothing to issue — set the quantities to issue first.</p>
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
    </div>
  );
}
