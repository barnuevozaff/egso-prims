import * as React from "react";

import { Field, Textarea, WarningModal, toast } from "@/components";

/**
 * Confirms voiding the selected numbered documents and asks for the reason.
 * Voiding keeps the number, the record and its history; the status becomes
 * Cancelled and the reason goes into each document's approval timeline with
 * the name of whoever voided it. Each document is voided on its own, so one
 * that cannot be voided is reported without stopping the rest.
 *
 * Same dialog as the Purchase requests list (pr-list-page.tsx).
 */
export function VoidDialog<T>({
  open,
  onOpenChange,
  noun,
  rows,
  selectedCount,
  numberOf,
  voidOne,
  extraNote,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Singular, lower case: "purchase order". */
  noun: string;
  /** The selected documents that can be voided. */
  rows: T[];
  /** Everything selected, so the dialog can say how many are left alone. */
  selectedCount: number;
  numberOf: (row: T) => string;
  voidOne: (row: T, reason: string) => Promise<unknown>;
  /** Said after the standard description, e.g. that stock is returned. */
  extraNote?: string;
  onDone: () => void;
}) {
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | undefined>();
  const [voiding, setVoiding] = React.useState(false);

  const plural = (n: number) => `${n} ${noun}${n === 1 ? "" : "s"}`;
  const skipped = selectedCount - rows.length;

  const run = async () => {
    const text = reason.trim();
    if (!text) {
      setError(`Give a reason. It is kept in each ${noun}'s approval timeline.`);
      return;
    }
    setVoiding(true);
    const failed: string[] = [];
    for (const row of rows) {
      try {
        await voidOne(row, text);
      } catch (e) {
        failed.push(`${numberOf(row)}: ${e instanceof Error ? e.message : "could not be voided"}`);
      }
    }
    setVoiding(false);
    const voided = rows.length - failed.length;
    if (voided > 0) toast.success(`Voided ${plural(voided)}`);
    if (failed.length > 0) toast.error(failed.join(" · "));
    setReason("");
    onOpenChange(false);
    onDone();
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
      title={`Void ${plural(rows.length)}?`}
      description={[
        "The status becomes Cancelled. The number, the record and its history are kept, and the reason is recorded with your name.",
        extraNote,
        skipped > 0
          ? `${skipped} selected ${noun}${skipped === 1 ? " is" : "s are"} already final and will be left as ${skipped === 1 ? "it is" : "they are"}.`
          : undefined,
      ]
        .filter(Boolean)
        .join(" ")}
      confirmLabel="Void"
      loading={voiding}
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
