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
import { voidAppraisal } from "@/features/records/inventory-api";
import { useAppraisal } from "@/features/records/inventory-hooks";
import {
  AppraisalPrintForm,
  AppraisalSheet,
} from "@/features/records/components/appraisal-print-form";
import { PaperSheet } from "@/features/shared/paper-sheet";
import { FiledLocation } from "@/features/records/components/room/filed-location";
import { VoidButton, VoidedNotice, VoidRecordDialog } from "@/features/shared/void-record";

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
  const { user } = useAuth();
  const { data: appraisal, loading, refresh } = useAppraisal(id);
  const [confirmVoid, setConfirmVoid] = React.useState(false);

  if (loading) {
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
        <PageHeader
          title={appraisal.inventoryNo}
          description="Records Inventory and Appraisal"
          actions={
            <div className="flex items-center gap-2">
              <StatusBadge status={appraisal.status as DocumentStatus} />
              <Button variant="ghost" onClick={() => navigate("/records/inventory")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" />
                Print
              </Button>
              {can(user, "manage:records") && appraisal.status !== "Cancelled" && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/records/inventory/${appraisal.id}/edit`)}
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

        {appraisal.status === "Cancelled" && (
          <VoidedNotice voidedAt={appraisal.voidedAt} voidedBy={appraisal.voidedBy} voidReason={appraisal.voidReason} />
        )}

        <PaperSheet orientation="landscape">
          <AppraisalSheet appraisal={appraisal} />
        </PaperSheet>

        <FiledLocation type="RIA" sourceId={appraisal.id} />
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
