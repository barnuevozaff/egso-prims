import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Button, PageHeader, PageTransition, Spinner, type DocumentStatus } from "@/components";
import { voidRequest } from "@/features/records/disposal-api";
import { useDisposalRequest } from "@/features/records/disposal-hooks";
import {
  DisposalPrintForm,
  DisposalRequestSheet,
} from "@/features/records/components/disposal-print-form";
import { PaperSheet } from "@/features/shared/paper-sheet";
import { VoidedNotice, VoidRecordDialog } from "@/features/shared/void-record";
import { RecordPageHeader } from "@/features/shared/record-page";
import { RecordDetailPanel } from "@/features/records/components/record-detail-panel";
import { RecordLayout } from "@/features/records/components/record-layout";
import { formatDate, formatDay } from "@/features/records/components/room/room-format";

/**
 * One request for authority to dispose, shown as NAP Form No. 3.
 *
 * The certification the office signs is part of the form, so it is read here
 * in its own wording and in its own place on the sheet rather than paraphrased
 * into a card. See the disposition schedule's page for why the form itself is
 * the page.
 */
export function DisposalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: request, loading, refresh } = useDisposalRequest(id);
  const [confirmVoid, setConfirmVoid] = React.useState(false);

  // Only the first read waits on a spinner; a refresh keeps the page in place.
  if (loading && !request) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!request) {
    return (
      <PageTransition className="space-y-6">
        <PageHeader
          title="Request not found"
          description="This disposal request no longer exists."
        />
        <Button variant="outline" onClick={() => navigate("/records/disposal")}>
          Back to Disposal Requests
        </Button>
      </PageTransition>
    );
  }

  return (
    <>
      <PageTransition className="space-y-5">
        <RecordPageHeader
          back={{ to: "/records/disposal", label: "Authority to dispose" }}
          number={request.requestNo}
          status={request.status as DocumentStatus}
          description="Request for Authority to Dispose of Records"
        />

        {/* Every action of the record beside it, in one place (30 Oct 2026). */}
        <RecordLayout
          panel={
            <RecordDetailPanel
              kind="RAD"
              id={request.id}
              number={request.requestNo}
              status={request.status}
              facts={[
                { label: "Request date", value: formatDate(request.requestDate) },
                { label: "Items", value: request.items.length },
                { label: "Created", value: formatDay(request.createdAt) },
                { label: "Last changed", value: formatDay(request.updatedAt) },
              ]}
              editTo={`/records/disposal/${request.id}/edit`}
              onPrint={() => window.print()}
              onVoid={() => setConfirmVoid(true)}
              onMoved={() => void refresh()}
            />
          }
        >
          {request.status === "Cancelled" && (
            <VoidedNotice voidedAt={request.voidedAt} voidedBy={request.voidedBy} voidReason={request.voidReason} />
          )}
          <PaperSheet fit>
            <DisposalRequestSheet request={request} />
          </PaperSheet>
        </RecordLayout>
      </PageTransition>

      <DisposalPrintForm request={request} />

      <VoidRecordDialog
        open={confirmVoid}
        onOpenChange={setConfirmVoid}
        title={`Void ${request.requestNo}?`}
        description="The form becomes Cancelled. Its number, lines and filing history are kept — an approved form stays where it was filed — and the reason is recorded with your name and the time."
        onVoid={(reason) => voidRequest(request.id, reason)}
        onDone={() => void refresh()}
      />
    </>
  );
}
