import { ArrowRight } from "lucide-react";
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
} from "@/components";
import { useReservation } from "@/features/reservations/hooks";
import { facilityName } from "@/features/reservations/types";
import { ResDetailPanels } from "@/features/reservations/components/res-detail-panels";

/**
 * A facility reservation at a glance, opened from Reports (30 Oct 2026).
 * Read-only, as the purchase order's is: approving, rejecting, completing and
 * editing are on the reservation's own page (/reservations/:id), which "Open
 * reservation" leads to.
 */
export function ResDrawer({
  resId,
  open,
  onOpenChange,
}: {
  resId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Kept for callers written before 30 Oct 2026; nothing in the drawer changes the reservation. */
  onChanged?: () => void;
  /** Kept for callers written before 30 Oct 2026; editing is on the reservation's page. */
  onEdit?: (resId: string) => void;
}) {
  const navigate = useNavigate();
  const { data: r, loading } = useReservation(open ? resId : null);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} size="2xl">
      {loading || !r ? (
        <div className="p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-2 h-3 w-56" />
          <SkeletonText lines={6} className="mt-6" />
        </div>
      ) : (
        <>
          <DrawerHeader
            title={r.resNumber}
            description={`${facilityName(r.facilityId)} · ${r.borrower}`}
            onClose={() => onOpenChange(false)}
          >
            <div className="mt-2">
              <StatusBadge status={r.status} />
            </div>
          </DrawerHeader>
          <DrawerBody>
            <ResDetailPanels r={r} />
          </DrawerBody>
          <DrawerFooter>
            <DrawerActions>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button onClick={() => navigate(`/reservations/${encodeURIComponent(r.id)}`)}>
                Open reservation
                <ArrowRight />
              </Button>
            </DrawerActions>
          </DrawerFooter>
        </>
      )}
    </Drawer>
  );
}
