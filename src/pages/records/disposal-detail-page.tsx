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
import { voidRequest } from "@/features/records/disposal-api";
import { useDisposalRequest } from "@/features/records/disposal-hooks";
import {
  DisposalPrintForm,
  DisposalRequestSheet,
} from "@/features/records/components/disposal-print-form";
import { PaperSheet } from "@/features/shared/paper-sheet";
import { FiledLocation } from "@/features/records/components/room/filed-location";
import { VoidButton, VoidedNotice, VoidRecordDialog } from "@/features/shared/void-record";

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
  const { user } = useAuth();
  const { data: request, loading, refresh } = useDisposalRequest(id);
  const [confirmVoid, setConfirmVoid] = React.useState(false);

  if (loading) {
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
        <PageHeader
          title={request.requestNo}
          description="Request for Authority to Dispose of Records — NAP Form No. 3"
          actions={
            <div className="flex items-center gap-2">
              <StatusBadge status={request.status as DocumentStatus} />
              <Button variant="ghost" onClick={() => navigate("/records/disposal")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" />
                Print
              </Button>
              {can(user, "manage:records") && request.status !== "Cancelled" && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/records/disposal/${request.id}/edit`)}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                  <VoidButton onClick={() => setConfirmVoid(true)} />
                </>
              )}
            </div>
          }
        />

        {request.status === "Cancelled" && (
          <VoidedNotice voidedAt={request.voidedAt} voidedBy={request.voidedBy} voidReason={request.voidReason} />
        )}

        <PaperSheet>
          <DisposalRequestSheet request={request} />
        </PaperSheet>

        <FiledLocation type="RAD" sourceId={request.id} status={request.status} />
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
