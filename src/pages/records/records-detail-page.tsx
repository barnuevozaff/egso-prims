import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Printer } from "lucide-react";

import {
  Button,
  PageHeader,
  PageTransition,
  Spinner,
  StatusBadge,
  type DocumentStatus,
} from "@/components";
import { useAuth } from "@/features/auth/auth-context";
import { can } from "@/features/auth/types";
import { voidSchedule } from "@/features/records/api";
import { useSchedule } from "@/features/records/hooks";
import {
  RecordsPrintForm,
  RecordsScheduleSheet,
} from "@/features/records/components/records-print-form";
import { PaperSheet } from "@/features/shared/paper-sheet";
import { FiledLocation } from "@/features/records/components/room/filed-location";
import { VoidButton, VoidedNotice, VoidRecordDialog } from "@/features/shared/void-record";

/**
 * One disposition schedule, shown as the schedule.
 *
 * The page used to summarise the record into cards and a plain table, and the
 * National Archives form itself appeared only in the print dialog. The office
 * files the form, checks the form and is accountable for the form, so the form
 * is what the page shows — at the size it prints, from the same component that
 * prints it. The status badge is the one thing here that is not on the paper:
 * it is this system's own, and the paper has no field for it.
 */
export function RecordsDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: schedule, loading, refresh } = useSchedule(id);
  const [confirmVoid, setConfirmVoid] = React.useState(false);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!schedule) {
    return (
      <PageTransition className="space-y-6">
        <PageHeader
          title="Schedule not found"
          description="This disposition schedule no longer exists."
        />
        <Button variant="outline" onClick={() => navigate("/records")}>
          Back to Records
        </Button>
      </PageTransition>
    );
  }

  return (
    <>
      <PageTransition className="space-y-5">
        <PageHeader
          title={schedule.scheduleNo}
          description="Records Disposition Schedule"
          actions={
            <div className="flex items-center gap-2">
              <StatusBadge status={schedule.status as DocumentStatus} />
              <Button variant="ghost" onClick={() => navigate("/records")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" />
                Print
              </Button>
              {can(user, "manage:records") && schedule.status !== "Cancelled" && (
                <>
                  <Button variant="outline" onClick={() => navigate(`/records/${schedule.id}/edit`)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  <VoidButton onClick={() => setConfirmVoid(true)} />
                </>
              )}
            </div>
          }
        />

        {schedule.status === "Cancelled" && (
          <VoidedNotice voidedAt={schedule.voidedAt} voidedBy={schedule.voidedBy} voidReason={schedule.voidReason} />
        )}

        <PaperSheet>
          <RecordsScheduleSheet schedule={schedule} />
        </PaperSheet>

        <FiledLocation type="RDS" sourceId={schedule.id} status={schedule.status} />
      </PageTransition>

      <RecordsPrintForm schedule={schedule} />

      <VoidRecordDialog
        open={confirmVoid}
        onOpenChange={setConfirmVoid}
        title={`Void ${schedule.scheduleNo}?`}
        description="The form becomes Cancelled. Its number, lines and filing history are kept — an approved form stays where it was filed — and the reason is recorded with your name and the time."
        onVoid={(reason) => voidSchedule(schedule.id, reason)}
        onDone={() => void refresh()}
      />
    </>
  );
}
