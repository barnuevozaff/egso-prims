import * as React from "react";
import { CheckCircle2, FileDown, Pencil, Printer, XCircle } from "lucide-react";

import {
  ApprovalTimeline,
  Button,
  ConfirmationModal,
  Drawer,
  DrawerActions,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  SectionTitle,
  Skeleton,
  SkeletonText,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  WarningModal,
  toast,
} from "@/components";
import {
  addReservationComment,
  removeReservationAttachment,
  setReservationStatus,
} from "@/features/reservations/api";
import { useReservation } from "@/features/reservations/hooks";
import { buildReservationTimeline } from "@/features/reservations/lib";
import { facilityName } from "@/features/reservations/types";
import { AttachmentList } from "@/features/shared/attachment-list";
import { CommentThread } from "@/features/shared/comment-thread";
import { HistoryFeed } from "@/features/shared/history-feed";
import { ResEquipmentTable } from "@/features/reservations/components/res-equipment-table";
import { ResOverview } from "@/features/reservations/components/res-overview";
import { useAuth } from "@/features/auth/auth-context";
import { can } from "@/features/auth/types";

/** Right slide-over showing the full facility reservation. */
export function ResDrawer({
  resId,
  open,
  onOpenChange,
  onChanged,
  onEdit,
}: {
  resId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
  onEdit?: (resId: string) => void;
}) {
  const { user } = useAuth();
  const { data: r, loading, setData } = useReservation(open ? resId : null);
  const [confirmApprove, setConfirmApprove] = React.useState(false);
  const [confirmReject, setConfirmReject] = React.useState(false);
  const [confirmComplete, setConfirmComplete] = React.useState(false);
  const [acting, setActing] = React.useState(false);

  const act = async (
    status: "Approved" | "Rejected" | "Completed",
    close: (v: boolean) => void,
    remarks?: string,
  ) => {
    if (!r) return;
    setActing(true);
    try {
      const updated = await setReservationStatus(r.id, status, {
        by: user?.name ?? "Staff",
        office: user?.office ?? "General Services Office",
        remarks,
      });
      setData(updated);
      toast.success(`${r.resNumber} ${status.toLowerCase()}`);
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to update the reservation");
    }
    setActing(false);
    close(false);
  };

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
            <div className="space-y-5">
              <ResOverview r={r} />

              <section>
                <SectionTitle as="h3" className="mb-2">
                  Borrowed Equipment
                </SectionTitle>
                <ResEquipmentTable equipment={r.equipment} />
              </section>

              <Tabs defaultValue="timeline">
                <TabsList className="w-full justify-start bg-neutral-100">
                  <TabsTrigger value="timeline" className="text-[12.5px]">
                    Timeline
                  </TabsTrigger>
                  <TabsTrigger value="attachments" className="text-[12.5px]">
                    Attachments ({r.attachments.length})
                  </TabsTrigger>
                  <TabsTrigger value="comments" className="text-[12.5px]">
                    Comments ({r.comments.length})
                  </TabsTrigger>
                  <TabsTrigger value="history" className="text-[12.5px]">
                    History
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="timeline" className="pt-3">
                  <ApprovalTimeline steps={buildReservationTimeline(r)} />
                </TabsContent>
                <TabsContent value="attachments" className="pt-3">
                  <AttachmentList
                    attachments={r.attachments}
                    onDelete={async (a) => {
                      const updated = await removeReservationAttachment(r.id, a.id);
                      setData(updated);
                      onChanged?.();
                    }}
                  />
                </TabsContent>
                <TabsContent value="comments" className="pt-3">
                  <CommentThread
                    comments={r.comments}
                    onSubmit={async (text) => {
                      setData(
                        await addReservationComment(r.id, {
                          author: user?.name ?? "Staff",
                          office: user?.office ?? "General Services Office",
                          text,
                        }),
                      );
                    }}
                  />
                </TabsContent>
                <TabsContent value="history" className="pt-3">
                  <HistoryFeed entries={r.history} />
                </TabsContent>
              </Tabs>
            </div>
          </DrawerBody>
          <DrawerFooter>
            <DrawerActions>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button
                variant="secondary"
                onClick={() => toast.success(`Exporting ${r.resNumber} as PDF`)}
              >
                <FileDown />
                Export PDF
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  toast.info(`Preparing ${r.resNumber} for printing`);
                  window.print();
                }}
              >
                <Printer />
                Print
              </Button>
              {/* A voided document is closed for editing (firestore.rules), and
                  only roles that manage the module reach the edit page. */}
              {r.status !== "Cancelled" && can(user, "manage:reservations") && (
                <Button variant="secondary" onClick={() => onEdit?.(r.id)}>
                  <Pencil />
                  Edit
                </Button>
              )}
              {(r.status === "Pending" || r.status === "Draft") && (
                <>
                  <Button variant="outline" onClick={() => setConfirmReject(true)}>
                    <XCircle />
                    Reject
                  </Button>
                  <Button onClick={() => setConfirmApprove(true)}>
                    <CheckCircle2 />
                    Approve
                  </Button>
                </>
              )}
              {r.status === "Approved" && (
                <Button onClick={() => setConfirmComplete(true)}>
                  <CheckCircle2 />
                  Complete
                </Button>
              )}
            </DrawerActions>
          </DrawerFooter>

          <ConfirmationModal
            open={confirmApprove}
            onOpenChange={setConfirmApprove}
            tone="success"
            icon={CheckCircle2}
            title="Approve reservation?"
            description={`${r.resNumber} will be approved and the time slot will be blocked for other requests.`}
            confirmLabel="Approve"
            loading={acting}
            onConfirm={() => act("Approved", setConfirmApprove)}
          />
          <WarningModal
            open={confirmReject}
            onOpenChange={setConfirmReject}
            title="Reject reservation?"
            description={`${r.resNumber} will be rejected and the schedule will be freed. This is recorded in the timeline.`}
            confirmLabel="Reject"
            loading={acting}
            onConfirm={() => act("Rejected", setConfirmReject, "Facility not available for the requested schedule")}
          />
          <ConfirmationModal
            open={confirmComplete}
            onOpenChange={setConfirmComplete}
            tone="success"
            icon={CheckCircle2}
            title="Mark as completed?"
            description={`${r.resNumber} will be moved to history as a completed reservation.`}
            confirmLabel="Complete"
            loading={acting}
            onConfirm={() => act("Completed", setConfirmComplete)}
          />
        </>
      )}
    </Drawer>
  );
}
