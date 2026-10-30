import * as React from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components";
import { useAuth } from "@/features/auth/auth-context";
import { can } from "@/features/auth/types";
import {
  PanelFacts,
  PanelHead,
  PanelSection,
  PanelShell,
  RecordLayout,
  RoomBlock,
  StepButton,
  StepConfirm,
} from "@/features/records/components/record-layout";
import type { DocType } from "@/features/records/shelf-types";
import type { ScheduleStatus } from "@/features/records/types";
import { useDocumentLocation } from "@/features/records/use-document-location";
import { recordActions, type RecordAction } from "@/features/records/workflow";

/**
 * A Records Management form being filled in: the sheet as a <form>, and the
 * panel beside it (record-layout.tsx). The panel stands outside the <form>;
 * its buttons submit through the form's ref, so the browser still checks
 * the required boxes.
 */
export function RecordFormFrame({
  ref,
  orientation = "portrait",
  onSubmit,
  panel,
  children,
}: {
  ref: React.Ref<HTMLFormElement>;
  orientation?: "portrait" | "landscape";
  onSubmit: (e: React.FormEvent) => void;
  panel: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <RecordLayout orientation={orientation} panel={panel}>
      <form ref={ref} onSubmit={onSubmit} className="space-y-3">
        {children}
      </form>
    </RecordLayout>
  );
}

/**
 * What the form is, where it stands and what to do next. Status is shown, not
 * chosen: the next step is an action (Submit, Approve, Return for revision),
 * saving without moving a quieter one beside it. Approving and returning are
 * asked first, and only an account that manages records is offered them.
 */
export function RecordFormPanel({
  kind,
  number,
  docId,
  current,
  facts,
  addLabel,
  onAdd,
  submitting,
  savingTo,
  validate,
  onAction,
  onCancel,
}: {
  kind: DocType;
  /** The document's number; none until it is first saved. */
  number?: string;
  docId?: string;
  /** Null for a form not saved yet. */
  current: ScheduleStatus | null;
  facts: { label: string; value: React.ReactNode }[];
  addLabel: string;
  onAdd: () => void;
  submitting: boolean;
  /** The status being saved, so its button shows the wait. */
  savingTo: ScheduleStatus | null;
  /** Checks the required boxes before a confirmation is asked. */
  validate: () => boolean;
  onAction: (to: ScheduleStatus) => void;
  onCancel: () => void;
}) {
  const { user } = useAuth();
  const canDecide = can(user, "manage:records");
  const actions = recordActions(current, number ?? "this form").filter(
    (a) => canDecide || (a.to !== "Approved" && a.kind !== "back") || a.to === current,
  );
  const [asking, setAsking] = React.useState<RecordAction | null>(null);
  const location = useDocumentLocation(kind, docId, current === "Approved");

  const run = (a: RecordAction) => {
    if (!a.confirm) return onAction(a.to);
    if (validate()) setAsking(a);
  };

  return (
    <PanelShell label="Form status and actions">
      <PanelHead kind={kind} number={number} status={current} />
      <PanelFacts facts={facts} />

      {current === "Approved" && (
        <RoomBlock kind={kind} docId={docId} status={current} location={location} canManage={canDecide} placeVariant="secondary" />
      )}

      <PanelSection>
        <Button variant="secondary" className="h-11 w-full text-[13px] @min-[640px]:w-auto" onClick={onAdd} disabled={submitting}>
          <Plus />
          {addLabel}
        </Button>
      </PanelSection>

      <PanelSection className="flex flex-col gap-2 pb-5 @min-[640px]:flex-row-reverse @min-[640px]:items-center">
        {actions.map((a) => (
          <StepButton
            key={`${a.to}-${a.kind}`}
            action={a}
            primary={a.kind === "primary"}
            busy={submitting && savingTo === a.to}
            disabled={submitting && savingTo !== a.to}
            onClick={() => run(a)}
          />
        ))}
        <Button variant="ghost" className="h-11 w-full text-[13px] @min-[640px]:w-auto" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
      </PanelSection>

      <StepConfirm
        asking={asking}
        onClose={() => setAsking(null)}
        onConfirm={(a) => {
          setAsking(null);
          onAction(a.to);
        }}
      />
    </PanelShell>
  );
}
