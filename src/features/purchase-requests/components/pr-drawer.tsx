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
import { usePurchaseRequest } from "@/features/purchase-requests/hooks";
import { formatDate } from "@/features/purchase-requests/lib";
import { departmentByCode } from "@/features/purchase-requests/types";
import { PRPrintSheet } from "@/features/shared/procurement-sheets";
import { PRDetailPanels } from "@/features/purchase-requests/components/pr-detail-panels";

/**
 * A purchase request at a glance, opened from Reports (30 Oct 2026).
 * Read-only, as the purchase order's is: submitting, approving, returning and
 * editing are on the request's own page (/purchase-requests/:id), which
 * "Open request" leads to.
 */
export function PRDrawer({
  prId,
  open,
  onOpenChange,
}: {
  prId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Kept for callers written before 30 Oct 2026; nothing in the drawer changes the request. */
  onChanged?: () => void;
  /** Kept for callers written before 30 Oct 2026; editing is on the request's page. */
  onEdit?: (prId: string) => void;
}) {
  const navigate = useNavigate();
  const { data: pr, loading } = usePurchaseRequest(open ? prId : null);

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
                    const title = document.title;
                    document.title = `Purchase Request ${pr.officialPrNumber || pr.prNumber}`;
                    window.print();
                    document.title = title;
                  }}
                >
                  <Printer />
                  Print
                </Button>
                <Button onClick={() => navigate(`/purchase-requests/${encodeURIComponent(pr.id)}`)}>
                  Open request
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
