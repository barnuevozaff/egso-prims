import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Button, PageHeader, PageTransition, Spinner, type DocumentStatus } from "@/components";
import { voidSchedule } from "@/features/records/api";
import { useSchedule } from "@/features/records/hooks";
import {
  RecordsPrintForm,
  RecordsScheduleSheet,
} from "@/features/records/components/records-print-form";
import { PaperSheet } from "@/features/shared/paper-sheet";
import { VoidedNotice, VoidRecordDialog } from "@/features/shared/void-record";
import { RecordPageHeader } from "@/features/shared/record-page";
import { RecordDetailPanel } from "@/features/records/components/record-detail-panel";
import { RecordLayout } from "@/features/records/components/record-layout";
import { formatDate, formatDay } from "@/features/records/components/room/room-format";

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
  const { data: schedule, loading, refresh } = useSchedule(id);
  const [confirmVoid, setConfirmVoid] = React.useState(false);

  // Only the first read waits on a spinner; a refresh keeps the page in place.
  if (loading && !schedule) {
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
        <RecordPageHeader
          back={{ to: "/records/schedules", label: "Disposition schedules" }}
          number={schedule.scheduleNo}
          status={schedule.status as DocumentStatus}
          description="Records Disposition Schedule"
        />

        {/* Every action of the record beside it, in one place (30 Oct 2026). */}
        <RecordLayout
          panel={
            <RecordDetailPanel
              kind="RDS"
              id={schedule.id}
              number={schedule.scheduleNo}
              status={schedule.status}
              facts={[
                { label: "Date prepared", value: formatDate(schedule.datePrepared) },
                { label: "Record series", value: schedule.series.length },
                { label: "Created", value: formatDay(schedule.createdAt) },
                { label: "Last changed", value: formatDay(schedule.updatedAt) },
              ]}
              editTo={`/records/${schedule.id}/edit`}
              onPrint={() => window.print()}
              onVoid={() => setConfirmVoid(true)}
              onMoved={() => void refresh()}
            />
          }
        >
          {schedule.status === "Cancelled" && (
            <VoidedNotice voidedAt={schedule.voidedAt} voidedBy={schedule.voidedBy} voidReason={schedule.voidReason} />
          )}
          <PaperSheet fit>
            <RecordsScheduleSheet schedule={schedule} />
          </PaperSheet>
        </RecordLayout>
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
