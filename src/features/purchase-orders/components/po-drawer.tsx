import { ArrowRight, Printer } from "lucide-react";
import { useNavigate } from "react-router-dom";

import {
  Button,
  Drawer,
  DrawerActions,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Skeleton,
  SkeletonText,
  StatusBadge,
  toast,
} from "@/components";
import { usePurchaseOrder } from "@/features/purchase-orders/hooks";
import { poSupplierName } from "@/features/purchase-orders/types";
import { PODetailPanels } from "@/features/purchase-orders/components/po-detail-panels";
import { POPrintSheet } from "@/features/shared/procurement-sheets";

/**
 * A purchase order at a glance, opened from Reports (21 Oct 2026). Read-only:
 * completing, correcting and the older workflow's actions are on the order's
 * own page (/purchase-orders/:id), which "Open PO" leads to.
 */
export function PODrawer({
  poId,
  open,
  onOpenChange,
}: {
  poId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Kept for callers written before 30 Oct 2026; nothing in the drawer changes the order. */
  onChanged?: () => void;
  /** Kept for callers written before 21 Oct 2026; editing is on the order's page. */
  onEdit?: (poId: string) => void;
}) {
  const navigate = useNavigate();
  const { data: po, loading } = usePurchaseOrder(open ? poId : null);

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
              description={`${poSupplierName(po) === "—" ? "Supplier not set" : poSupplierName(po)} · from ${po.prOfficialNumber ?? po.prNumber}`}
              onClose={() => onOpenChange(false)}
            >
              <div className="mt-2">
                <StatusBadge status={po.status} />
              </div>
            </DrawerHeader>
            <DrawerBody>
              <PODetailPanels po={po} />
            </DrawerBody>
            <DrawerFooter>
              <DrawerActions>
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    toast.info(`Preparing ${po.poNumber} for printing`);
                    const title = document.title;
                    document.title = `Purchase Order ${po.poNumber}`;
                    window.print();
                    document.title = title;
                  }}
                >
                  <Printer />
                  Print
                </Button>
                <Button onClick={() => navigate(`/purchase-orders/${encodeURIComponent(po.id)}`)}>
                  Open PO
                  <ArrowRight />
                </Button>
              </DrawerActions>
            </DrawerFooter>
          </>
        )}
      </Drawer>
    </>
  );
}
