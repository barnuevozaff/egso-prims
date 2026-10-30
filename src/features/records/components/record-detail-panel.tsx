import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Ban, Pencil, Printer } from "lucide-react";

import { Button, toast } from "@/components";
import { useAuth } from "@/features/auth/auth-context";
import { can } from "@/features/auth/types";
import {
  PanelFacts,
  PanelHead,
  PanelSection,
  PanelShell,
  RoomBlock,
  StepButton,
  StepConfirm,
} from "@/features/records/components/record-layout";
import { moveRecordStatus } from "@/features/records/shelf-api";
import type { DocType } from "@/features/records/shelf-types";
import type { RecordsDocStatus, ScheduleStatus } from "@/features/records/types";
import { useDocumentLocation } from "@/features/records/use-document-location";
import { pageMoves, savedMessage, type RecordAction } from "@/features/records/workflow";

/**
 * A record's page, its working side (30 Oct 2026): where it stands, the next
 * step, and the Records Room — every action in one place beside the sheet
 * instead of across the header and the foot of the page.
 *
 * The next step is the one solid button: Approve a submitted form, Submit a
 * draft, Edit a returned one, Place an approved one that is in no box. A
 * step is taken as the form stands — its lines are not sent again — and
 * approving or returning is asked first. Only an approved form is offered
 * Place; any other status says why not, and the server refuses it as well.
 */
export function RecordDetailPanel({
  kind,
  id,
  number,
  status,
  facts,
  editTo,
  onPrint,
  onVoid,
  onMoved,
}: {
  kind: DocType;
  id: string;
  number: string;
  status: RecordsDocStatus;
  facts: { label: string; value: React.ReactNode }[];
  /** The form's edit page. */
  editTo: string;
  onPrint: () => void;
  onVoid: () => void;
  /** Reads the record again after a step. */
  onMoved: () => void;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = can(user, "manage:records");
  // A voided form may still stand in the box it was placed in.
  const location = useDocumentLocation(kind, id, status === "Approved" || status === "Cancelled");
  const [asking, setAsking] = React.useState<RecordAction | null>(null);
  const [moving, setMoving] = React.useState<ScheduleStatus | null>(null);

  const open = status !== "Cancelled";
  const moves = canManage ? pageMoves(status, number) : [];
  // A returned form is revised before it goes back; an approved one has its step in the Records Room.
  const editPrimary = status === "Returned";
  const editFirst = status === "Returned" || status === "Approved";
  const primaryMove = (a: RecordAction) => a.kind === "primary" && !editPrimary && status !== "Approved";

  const take = async (a: RecordAction) => {
    setMoving(a.to);
    try {
      await moveRecordStatus(kind, id, a.to);
      toast.success(savedMessage(number, status === "Cancelled" ? null : status, a.to));
      onMoved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The step could not be saved");
    }
    setMoving(null);
  };

  const edit = (
    <Button
      key="edit"
      variant={editPrimary ? "primary" : "secondary"}
      className="h-11 w-full text-[13px] @min-[640px]:w-auto"
      onClick={() => navigate(editTo)}
      disabled={moving !== null}
    >
      <Pencil />
      Edit
    </Button>
  );

  const room = <RoomBlock kind={kind} docId={id} status={status} location={location} canManage={canManage} />;

  return (
    <PanelShell label="Record status and actions">
      <PanelHead kind={kind} status={status} compact />

      {/* Approved, the next step is the Records Room; before that, the workflow. */}
      {status === "Approved" && room}

      {canManage && open && (
        <PanelSection label="Next step" className="flex flex-col gap-2 @min-[640px]:flex-row-reverse @min-[640px]:items-center">
          {editFirst && edit}
          {moves.map((a) => (
            <StepButton
              key={`${a.to}-${a.kind}`}
              action={a}
              primary={primaryMove(a)}
              busy={moving === a.to}
              disabled={moving !== null && moving !== a.to}
              onClick={() => (a.confirm ? setAsking(a) : void take(a))}
            />
          ))}
          {!editFirst && edit}
        </PanelSection>
      )}

      {status !== "Approved" && room}

      <PanelFacts facts={facts} />

      <PanelSection className="flex gap-2 pb-5">
        <Button variant="secondary" className="h-11 flex-1 text-[13px] @min-[640px]:flex-none" onClick={onPrint}>
          <Printer />
          Print
        </Button>
        {canManage && open && (
          <Button
            variant="outline"
            className="h-11 flex-1 text-[13px] text-[#b42318] hover:text-[#912018] @min-[640px]:flex-none"
            onClick={onVoid}
            disabled={moving !== null}
          >
            <Ban />
            Void
          </Button>
        )}
      </PanelSection>

      <StepConfirm
        asking={asking}
        onClose={() => setAsking(null)}
        onConfirm={(a) => {
          setAsking(null);
          void take(a);
        }}
      />
    </PanelShell>
  );
}
