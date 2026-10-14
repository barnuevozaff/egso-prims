import * as React from "react";
import {
  CheckCircle2,
  FileDown,
  PackageCheck,
  Pencil,
  Printer,
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
  Spinner,
  StatusBadge,
  WarningModal,
  toast,
} from "@/components";
import { listInventoryItems } from "@/features/inventory/api";
import type { InventoryItem } from "@/features/inventory/types";
import { setRequestStatus } from "@/features/ris/api";
import { useRequest } from "@/features/ris/hooks";
import { nextRISStatus } from "@/features/ris/lib";
import { RISDetailPanels } from "@/features/ris/components/ris-detail-panels";
import { RISPrintSheet } from "@/features/shared/procurement-sheets";
import { reportLoadFailure } from "@/features/shared/load-guard";

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
  const { data: ris, loading, setData } = useRequest(open ? risId : null);
  const [confirmAdvance, setConfirmAdvance] = React.useState(false);
  const [confirmReturn, setConfirmReturn] = React.useState(false);
  const [acting, setActing] = React.useState(false);
  const [stock, setStock] = React.useState<InventoryItem[] | null>(null);

  const next = ris ? nextRISStatus(ris.status) : null;
  const releasing = next === "Released";
  const terminal = ris ? ["Cancelled", "Completed"].includes(ris.status) : false;

  const openAdvance = () => {
    setConfirmAdvance(true);
    if (releasing) {
      setStock(null);
      void listInventoryItems()
        .then(setStock)
        .catch((e) => reportLoadFailure(e, "stock levels"));
    }
  };

  const advance = async () => {
    if (!ris || !next) return;
    setActing(true);
    try {
      const updated = await setRequestStatus(ris.id, next, {
        by: "Administrator",
        office: "General Services Office",
      });
      setData(updated);
      toast.success(
        next === "Released"
          ? `${ris.risNumber} released — inventory updated`
          : `${ris.risNumber} moved to ${next}`,
      );
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to update status");
    }
    setActing(false);
    setConfirmAdvance(false);
  };

  const sendBack = async () => {
    if (!ris) return;
    setActing(true);
    try {
      const updated = await setRequestStatus(ris.id, "Draft", {
        by: "Administrator",
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

  const primaryLabel = releasing ? "Release" : next === "Completed" ? "Mark Completed" : "Approve";
  const insufficient =
    releasing && stock && ris
      ? ris.items.filter((it) => {
          const inv = stock.find((s) => s.id === it.inventoryItemId);
          return !inv || it.issuedQty > inv.onHand;
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
              <Button variant="secondary" onClick={() => onEdit?.(ris.id)}>
                <Pencil />
                Edit
              </Button>
              {!terminal && (
                <Button variant="outline" onClick={() => setConfirmReturn(true)}>
                  <Undo2 />
                  Return
                </Button>
              )}
              {next && (
                <Button onClick={openAdvance}>
                  {releasing ? <PackageCheck /> : <CheckCircle2 />}
                  {primaryLabel}
                </Button>
              )}
            </DrawerActions>
          </DrawerFooter>

          <ConfirmationModal
            open={confirmAdvance}
            onOpenChange={setConfirmAdvance}
            tone="success"
            icon={releasing ? PackageCheck : CheckCircle2}
            title={releasing ? "Release items from stock?" : `Move to ${next}?`}
            description={
              releasing
                ? `${ris.risNumber} will deduct the issued quantities from inventory and write stock card transactions.`
                : `${ris.risNumber} will move from “${ris.status}” to “${next}”. This is recorded in the approval timeline.`
            }
            confirmLabel={primaryLabel}
            loading={acting}
            // Releasing more than is on hand would drive stock below zero.
            confirmDisabled={insufficient.length > 0}
            onConfirm={advance}
          >
            {releasing && (
              <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50/60 p-3">
                {!stock ? (
                  <Spinner size="sm" label="Checking stock balances…" />
                ) : (
                  <ul className="space-y-1.5">
                    {ris.items.map((it) => {
                      const inv = stock.find((s) => s.id === it.inventoryItemId);
                      const after = (inv?.onHand ?? 0) - it.issuedQty;
                      const short = !inv || after < 0;
                      return (
                        <li
                          key={it.id}
                          className="flex items-center justify-between gap-3 text-[11.5px]"
                        >
                          <span className="min-w-0 truncate text-neutral-700">{it.name}</span>
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
                    Insufficient stock for {insufficient.length} item
                    {insufficient.length === 1 ? "" : "s"} — adjust the slip before releasing.
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
        </>
      )}
      </Drawer>
    </>
  );
}
