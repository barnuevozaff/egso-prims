import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Button, PageHeader, PageTransition, Spinner, type DocumentStatus } from "@/components";
import { voidAppraisal } from "@/features/records/inventory-api";
import { useAppraisal } from "@/features/records/inventory-hooks";
import {
  AppraisalPrintForm,
  AppraisalSheet,
} from "@/features/records/components/appraisal-print-form";
import { PaperSheet } from "@/features/shared/paper-sheet";
import { VoidedNotice, VoidRecordDialog } from "@/features/shared/void-record";
import { RecordPageHeader } from "@/features/shared/record-page";
import { RecordDetailPanel } from "@/features/records/components/record-detail-panel";
import { RecordLayout } from "@/features/records/components/record-layout";
import { formatDate, formatDay } from "@/features/records/components/room/room-format";

/**
 * One records inventory, shown as the inventory.
 *
 * The twenty columns need the long edge of the sheet, so this one is displayed
 * landscape — the same way the workbook is set up and the same way it prints.
 * See the disposition schedule's page for why the form itself is the page.
 */
export function InventoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: appraisal, loading, refresh } = useAppraisal(id);
  const [confirmVoid, setConfirmVoid] = React.useState(false);

  // Only the first read waits on a spinner; a refresh keeps the page in place.
  if (loading && !appraisal) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!appraisal) {
    return (
      <PageTransition className="space-y-6">
        <PageHeader
          title="Inventory not found"
          description="This records inventory no longer exists."
        />
        <Button variant="outline" onClick={() => navigate("/records/inventory")}>
          Back to Records Inventory
        </Button>
      </PageTransition>
    );
  }

  return (
    <>
      <PageTransition className="space-y-5">
        <RecordPageHeader
          back={{ to: "/records/inventory", label: "Inventory and appraisal" }}
          number={appraisal.inventoryNo}
          status={appraisal.status as DocumentStatus}
          description="Records Inventory and Appraisal"
        />

        {/* Every action of the record beside it, in one place (30 Oct 2026). */}
        <RecordLayout orientation="landscape"
          panel={
            <RecordDetailPanel
              kind="RIA"
              id={appraisal.id}
              number={appraisal.inventoryNo}
              status={appraisal.status}
              facts={[
                { label: "Date prepared", value: formatDate(appraisal.datePrepared) },
                { label: "Record series", value: appraisal.records.length },
                { label: "Created", value: formatDay(appraisal.createdAt) },
                { label: "Last changed", value: formatDay(appraisal.updatedAt) },
              ]}
              editTo={`/records/inventory/${appraisal.id}/edit`}
              onPrint={() => window.print()}
              onVoid={() => setConfirmVoid(true)}
              onMoved={() => void refresh()}
            />
          }
        >
          {appraisal.status === "Cancelled" && (
            <VoidedNotice voidedAt={appraisal.voidedAt} voidedBy={appraisal.voidedBy} voidReason={appraisal.voidReason} />
          )}
          <PaperSheet orientation="landscape" fit>
            <AppraisalSheet appraisal={appraisal} />
          </PaperSheet>
        </RecordLayout>
      </PageTransition>

      <AppraisalPrintForm appraisal={appraisal} />

      <VoidRecordDialog
        open={confirmVoid}
        onOpenChange={setConfirmVoid}
        title={`Void ${appraisal.inventoryNo}?`}
        description="The form becomes Cancelled. Its number, lines and filing history are kept — an approved form stays where it was filed — and the reason is recorded with your name and the time."
        onVoid={(reason) => voidAppraisal(appraisal.id, reason)}
        onDone={() => void refresh()}
      />
    </>
  );
}
