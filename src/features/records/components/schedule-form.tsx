import * as React from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button, DatePicker, IconButton } from "@/components";
import { PaperSheet } from "@/features/shared/paper-sheet";
import { RecordFormFrame, RecordFormPanel } from "@/features/records/components/record-form-panel";
import { formatDate } from "@/features/records/components/room/room-format";
import { useRecordForm } from "@/features/records/use-record-form";
import {
  CELL,
  EDITABLE_CELL,
  FieldLabel,
  FillLegend,
  INPUT,
  toDateOnly,
} from "@/features/records/components/nap-form-chrome";
import {
  DEFAULT_AGENCY,
  type DispositionScheduleWithSeries,
  type RecordSeriesDraft,
  type ScheduleInput,
  type ScheduleStatus,
} from "@/features/records/types";

/**
 * The disposition schedule editor, drawn as the National Archives form itself.
 *
 * A clerk fills this in from the paper copy on the desk beside them, so the
 * screen is the same document: the boxed identity block, the eight numbered
 * fields, the ruled table and the RA 9470 footer, all in the same places. The
 * earlier card-per-field layout held the same data but read as a different
 * document, and the office had to translate between the two.
 *
 * One <table> carries the whole form. The header blocks are rows spanning the
 * column set, so every rule lines up with the one below it without a second
 * layout to keep in step. A trailing column holds the row controls; it is left
 * unruled so it reads as sitting outside the form rather than as a ninth field
 * the Archives never asked for.
 */

const blankSeries = (): RecordSeriesDraft => ({
  itemNumber: 0,
  titleAndDescription: "",
  retentionActive: 0,
  retentionStorage: 0,
  remarks: "",
});

/** Whole years only, never negative — the retention columns. */
function YearsCell({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
}) {
  return (
    <td className={EDITABLE_CELL}>
      <input
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        aria-label={label}
        value={String(value)}
        onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        className={`${INPUT} text-center tabular-nums`}
      />
    </td>
  );
}

export function ScheduleForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
}: {
  initial?: DispositionScheduleWithSeries;
  submitting: boolean;
  onSubmit: (input: ScheduleInput) => void;
  onCancel: () => void;
}) {
  const [agencyName, setAgencyName] = React.useState(initial?.agencyName ?? DEFAULT_AGENCY.name);
  const [agencyAddress, setAgencyAddress] = React.useState(
    initial?.agencyAddress ?? DEFAULT_AGENCY.address,
  );
  const [datePrepared, setDatePrepared] = React.useState<Date | undefined>(
    initial ? new Date(`${initial.datePrepared}T00:00:00`) : new Date(),
  );
  // Status is moved by the panel's actions, never typed (30 Oct 2026).
  const current: ScheduleStatus | null = initial && initial.status !== "Cancelled" ? initial.status : null;
  const { formRef, act, take, savingTo, focusLine } = useRecordForm(current);
  const [series, setSeries] = React.useState<RecordSeriesDraft[]>(
    initial?.series.map((s) => ({
      // Kept so the save updates these lines rather than replacing them.
      id: s.id,
      itemNumber: s.itemNumber,
      titleAndDescription: s.titleAndDescription,
      retentionActive: s.retentionActive,
      retentionStorage: s.retentionStorage,
      remarks: s.remarks ?? "",
    })) ?? [blankSeries()],
  );

  const patch = (index: number, changes: Partial<RecordSeriesDraft>) =>
    setSeries((rows) => rows.map((r, i) => (i === index ? { ...r, ...changes } : r)));

  const addRow = () => {
    setSeries((rows) => [...rows, blankSeries()]);
    focusLine(series.length);
  };

  // The last row is never removable: a schedule with no record series is not a
  // document the office can file.
  const removeRow = (index: number) =>
    setSeries((rows) => (rows.length === 1 ? rows : rows.filter((_, i) => i !== index)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!datePrepared) return;
    onSubmit({ agencyName, agencyAddress, datePrepared: toDateOnly(datePrepared), status: take(), series });
  };

  return (
    // Status is the system's own, not the Archives': it lives in the panel,
    // so the sheet on screen stays the sheet on paper.
    <RecordFormFrame
      ref={formRef}
      onSubmit={submit}
      panel={
        <RecordFormPanel
          kind="RDS"
          number={initial?.scheduleNo}
          docId={initial?.id}
          current={current}
          facts={[
            { label: "Record series", value: series.length },
            { label: "Date prepared", value: datePrepared ? formatDate(toDateOnly(datePrepared)) : "—" },
          ]}
          addLabel="Add series"
          onAdd={addRow}
          submitting={submitting}
          savingTo={savingTo}
          validate={() => formRef.current?.reportValidity() ?? true}
          onAction={act}
          onCancel={onCancel}
        />
      }
    >
      <FillLegend />

      <PaperSheet fit>
        {/*
         * The row controls hang in the sheet's own right margin, so the ruled
         * columns keep exactly the width they have on the printed sheet and the
         * form lines up with the document it becomes.
         */}
        <div className="-mr-10">
          <table className="w-full table-fixed border-collapse font-[Arial,Helvetica,sans-serif]">
            {/*
             * The row-control lane is a fixed 40px — just the icon. It used to be
             * a percentage, which on a wide screen reserved well over a hundred
             * pixels for one small button and left the ruled sheet ending short
             * of the page. The description column is left unsized so it absorbs
             * whatever the ruled columns do not need.
             */}
            <colgroup>
              <col className="w-[5%]" />
              <col />
              <col className="w-[7%]" />
              <col className="w-[7%]" />
              <col className="w-[7%]" />
              <col className="w-[26%]" />
              <col className="w-10" />
            </colgroup>

            <tbody>
              {/* ---- Identity block, fields 1 and 2 ---- */}
              <tr>
                <td rowSpan={2} colSpan={2} className={`${CELL} px-2 py-3 text-center align-middle`}>
                  <div className="text-[11px] font-bold uppercase leading-[1.3]">
                    National Archives of the Philippines
                  </div>
                  <div className="text-[10px] italic leading-[1.35]">
                    Pambansang Sinupan ng Pilipinas
                  </div>
                  <div className="mt-2 text-[12.5px] font-bold uppercase leading-[1.3]">
                    Records Disposition Schedule
                  </div>
                </td>
                <td colSpan={4} className={EDITABLE_CELL}>
                  <FieldLabel>1. Agency Name:</FieldLabel>
                  <input
                    aria-label="Agency name"
                    value={agencyName}
                    onChange={(e) => setAgencyName(e.target.value)}
                    required
                    className={INPUT}
                  />
                </td>
                <td />
              </tr>
              <tr>
                <td colSpan={4} className={EDITABLE_CELL}>
                  <FieldLabel>2. Address:</FieldLabel>
                  <input
                    aria-label="Agency address"
                    value={agencyAddress}
                    onChange={(e) => setAgencyAddress(e.target.value)}
                    required
                    className={INPUT}
                  />
                </td>
                <td />
              </tr>

              {/* ---- Fields 3 and 4 ---- */}
              <tr>
                <td colSpan={2} className={CELL}>
                  <FieldLabel>3. Schedule No.</FieldLabel>
                  <div className="px-1.5 py-1 text-[12.5px] leading-[1.4]">
                    {initial ? (
                      <span className="tabular-nums">{initial.scheduleNo}</span>
                    ) : (
                      <span className="text-neutral-500">Allocated when you save</span>
                    )}
                  </div>
                </td>
                <td colSpan={4} className={EDITABLE_CELL}>
                  <FieldLabel>4. Date Prepared:</FieldLabel>
                  <DatePicker
                    id="date-prepared"
                    value={datePrepared}
                    onChange={setDatePrepared}
                    className="m-1 w-[calc(100%-0.5rem)] rounded-[3px] border-neutral-400 px-1.5 py-1 text-[12.5px]"
                  />
                </td>
                <td />
              </tr>

              {/* ---- Column headings, fields 5 to 8 ---- */}
              <tr className="text-[9px] font-bold uppercase leading-[1.25]">
                <td rowSpan={2} className={`${CELL} px-1 py-1 text-center align-middle`}>
                  5. Item
                  <br />
                  Number
                </td>
                <td rowSpan={2} className={`${CELL} px-1 py-1 text-center align-middle`}>
                  6. Record Series Title and Description
                </td>
                <td colSpan={3} className={`${CELL} px-1 py-1 text-center`}>
                  7. Retention Period
                </td>
                <td rowSpan={2} className={`${CELL} px-1 py-1 text-center align-middle`}>
                  8. Remarks
                </td>
                <td />
              </tr>
              <tr className="text-[9px] font-bold leading-[1.25]">
                <td className={`${CELL} px-1 py-0.5 text-center`}>Active</td>
                <td className={`${CELL} px-1 py-0.5 text-center`}>Storage</td>
                <td className={`${CELL} px-1 py-0.5 text-center`}>Total</td>
                <td />
              </tr>

              {/* ---- The record series ---- */}
              {series.map((row, i) => (
                <tr key={i} data-line={i}>
                  <td className={`${CELL} px-1 py-1 text-center text-[12.5px] tabular-nums`}>
                    {i + 1}
                  </td>
                  <td className={EDITABLE_CELL}>
                    <textarea
                      aria-label={`Item ${i + 1} record series title and description`}
                      rows={2}
                      value={row.titleAndDescription}
                      onChange={(e) => patch(i, { titleAndDescription: e.target.value })}
                      required
                      className={`${INPUT} resize-y`}
                    />
                  </td>
                  <YearsCell
                    label={`Item ${i + 1} active retention in years`}
                    value={row.retentionActive}
                    onChange={(n) => patch(i, { retentionActive: n })}
                  />
                  <YearsCell
                    label={`Item ${i + 1} storage retention in years`}
                    value={row.retentionStorage}
                    onChange={(n) => patch(i, { retentionStorage: n })}
                  />
                  {/*
                   * Total is read-only here for the same reason it is a generated
                   * column in the database: the printed figure is arithmetic, and
                   * a typed one could disagree with its own parts.
                   */}
                  <td className={`${CELL} px-1 py-1 text-center text-[12.5px] font-medium tabular-nums`}>
                    {row.retentionActive + row.retentionStorage}
                  </td>
                  <td className={EDITABLE_CELL}>
                    <textarea
                      aria-label={`Item ${i + 1} remarks`}
                      rows={2}
                      value={row.remarks ?? ""}
                      onChange={(e) => patch(i, { remarks: e.target.value })}
                      className={`${INPUT} resize-y`}
                    />
                  </td>
                  <td className="pl-1.5 align-middle">
                    <IconButton
                      type="button"
                      size="icon-sm"
                      aria-label={`Remove item ${i + 1}`}
                      disabled={series.length === 1}
                      onClick={() => removeRow(i)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </td>
                </tr>
              ))}

              {/* ---- The statutory footer, in the form's own words ---- */}
              <tr>
                <td colSpan={6} className={`${CELL} px-2 py-1.5 text-[9.5px] leading-[1.45]`}>
                  <span className="font-bold">IMPORTANT:</span> Pursuant to Section 18, Article III,
                  RA 9470 s. 2007, &ldquo;No government department, bureau, agency and
                  instrumentality shall dispose of, destroy or authorize the disposal or destruction
                  of any public records, which are in the custody or under its control except with
                  the prior written authority of the executive director.&rdquo;
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </PaperSheet>

      {/* Where the panel has scrolled away (a narrow screen), Add is under the lines too. */}
      <Button variant="secondary" className="h-11 text-[13px] @min-[900px]:hidden" onClick={addRow} disabled={submitting}>
        <Plus />
        Add series
      </Button>
    </RecordFormFrame>
  );
}
