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
import { useRequest } from "@/features/ris/hooks";
import { RISDetailPanels } from "@/features/ris/components/ris-detail-panels";
import { RISPrintSheet } from "@/features/shared/procurement-sheets";

/**
 * An issuance slip at a glance, opened from Reports (30 Oct 2026). Read-only,
 * as the purchase order's is: submitting, approving, returning, rejecting
 * and editing are on the slip's own page (/ris/:id), which "Open RIS" leads to.
 */
export function RISDrawer({
  risId,
  open,
  onOpenChange,
}: {
  risId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Kept for callers written before 30 Oct 2026; nothing in the drawer changes the slip. */
  onChanged?: () => void;
  /** Kept for callers written before 30 Oct 2026; editing is on the slip's page. */
  onEdit?: (risId: string) => void;
}) {
  const navigate = useNavigate();
  const { data: ris, loading } = useRequest(open ? risId : null);

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
              description={`${ris.requester}${ris.prNumber ? ` · from ${ris.prNumber}` : ""}${ris.poNumber ? ` · ${ris.poNumber}` : ""}`}
              onClose={() => onOpenChange(false)}
            >
              <div className="mt-2">
                <StatusBadge status={ris.status} />
              </div>
            </DrawerHeader>
            <DrawerBody>
              <RISDetailPanels ris={ris} />
            </DrawerBody>
            <DrawerFooter>
              <DrawerActions>
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Close
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
                <Button onClick={() => navigate(`/ris/${encodeURIComponent(ris.id)}`)}>
                  Open RIS
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
