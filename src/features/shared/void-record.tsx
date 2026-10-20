import * as React from "react";
import { format } from "date-fns";
import { Ban } from "lucide-react";

import { Button, Field, Textarea, WarningModal, toast } from "@/components";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { FinalizedRecord, RecordRevision } from "@/features/shared/revisions";

/**
 * Voiding one finalized record — a Records form, a bill, a fuel purchase or
 * a trip — and showing that it was voided (approved policy, 2026-10-20). A
 * void keeps the record and its number; the reason is required and is kept
 * with the account and the time. Same dialog as the list pages' VoidDialog,
 * for a single record.
 */
export function VoidRecordDialog({
  open,
  onOpenChange,
  title,
  description,
  onVoid,
  onDone,
  confirmLabel = "Void",
  doneMessage = "Voided",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** e.g. "Void RDS-2026-000001?" */
  title: string;
  description: string;
  onVoid: (reason: string) => Promise<unknown>;
  onDone?: () => void;
  /** The module's own word, e.g. "Cancel Violation". */
  confirmLabel?: string;
  doneMessage?: string;
}) {
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | undefined>();
  const [busy, setBusy] = React.useState(false);

  const run = async () => {
    const text = reason.trim();
    if (!text) {
      setError("Give a reason. It is kept with the record, with your name and the time.");
      return;
    }
    setBusy(true);
    try {
      await onVoid(text);
      toast.success(doneMessage);
      setReason("");
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not be voided");
    } finally {
      setBusy(false);
    }
  };

  return (
    <WarningModal
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setReason("");
          setError(undefined);
        }
      }}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      loading={busy}
      onConfirm={() => void run()}
    >
      <Field label="Reason" required error={error} className="mt-4">
        <Textarea
          value={reason}
          maxLength={500}
          rows={3}
          onChange={(e) => {
            setReason(e.target.value);
            if (error) setError(undefined);
          }}
        />
      </Field>
    </WarningModal>
  );
}

/** The button that opens the dialog, in a page header. */
export function VoidButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" onClick={onClick}>
      <Ban className="mr-2 h-4 w-4" />
      Void
    </Button>
  );
}

/** Who voided the record, when and why — shown wherever the record is. */
export function VoidedNotice({
  voidedAt,
  voidedBy,
  voidReason,
  className,
}: {
  voidedAt?: string;
  voidedBy?: string;
  voidReason?: string;
  className?: string;
}) {
  return (
    <div
      role="note"
      className={`rounded-[10px] border border-[#e6e6e3] bg-[#fafaf9] px-4 py-3 text-[13px] text-[#16181d] ${className ?? ""}`}
    >
      <span className="font-semibold">Voided</span>
      {voidedAt ? ` on ${format(new Date(voidedAt), "d MMM yyyy, h:mm a")}` : ""}
      {voidedBy ? ` by ${voidedBy}` : ""}
      {voidReason ? (
        <>
          {". "}
          <span className="text-[#5b606b]">Reason: {voidReason}</span>
        </>
      ) : null}
      <span className="mt-1 block text-[12.5px] text-[#5b606b]">
        The record keeps its number and history and no longer counts in active totals.
      </span>
    </div>
  );
}

const show = (v: unknown) =>
  v === null || v === undefined || v === "" ? "—" : typeof v === "number" ? v.toLocaleString("en-PH") : String(v);

/** A record's corrections, newest first: each changed field before and after, the reason, who and when. */
export function RevisionList({ revisions, labels }: { revisions: RecordRevision[]; labels?: Record<string, string> }) {
  if (revisions.length === 0) return null;
  return (
    <ol className="space-y-3">
      {[...revisions].reverse().map((r) => (
        <li key={r.id} className="rounded-[10px] border border-[#ececea] px-3 py-2.5 text-[12.5px]">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-semibold text-[#16181d]">Corrected by {r.by || "—"}</span>
            <span className="tabular-nums text-[#5b606b]">{format(new Date(r.at), "d MMM yyyy, h:mm a")}</span>
          </div>
          <p className="mt-0.5 text-[#5b606b]">Reason: {r.reason}</p>
          <ul className="mt-1.5 space-y-0.5">
            {Object.entries(r.changes).map(([field, c]) => (
              <li key={field} className="tabular-nums text-[#16181d]">
                {labels?.[field] ?? field.replaceAll("_", " ")}: <s className="text-[#6b707a]">{show(c.from)}</s> → {show(c.to)}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

/**
 * A finalized record's history: whether and why it was voided, and every
 * correction with the values before and after. Opened from a drawer row.
 */
export function RecordHistoryDialog({
  open,
  onOpenChange,
  title,
  record,
  labels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  record: FinalizedRecord | null;
  labels?: Record<string, string>;
}) {
  const revisions = record?.revisions ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-3 p-5">
        <DialogTitle className="text-[14px] font-semibold text-[#16181d]">{title}</DialogTitle>
        <DialogDescription className="text-[12.5px] text-[#5b606b]">
          Corrections keep the previous values; a void keeps the record and takes it out of totals.
        </DialogDescription>
        {record?.voided && (
          <VoidedNotice voidedAt={record.voidedAt} voidedBy={record.voidedBy} voidReason={record.voidReason} />
        )}
        {revisions.length > 0 ? (
          <div className="max-h-[50vh] overflow-y-auto">
            <RevisionList revisions={revisions} labels={labels} />
          </div>
        ) : (
          !record?.voided && <p className="text-[12.5px] text-[#5b606b]">No corrections.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

