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
import type { ScheduleStatus } from "@/features/records/types";
import {
  DEFAULT_OFFICE,
  SIGNATORY_CAPTIONS,
  TIME_VALUES,
  UTILITY_VALUES,
  type AppraisalInput,
  type InventoryAppraisalWithRecords,
  type InventoryRecordDraft,
  type TimeValue,
  type UtilityValue,
} from "@/features/records/inventory-types";

/**
 * The Records Inventory and Appraisal editor, drawn as the National Archives
 * form itself — same approach as the Disposition Schedule beside it.
 *
 * Twenty numbered fields across fourteen columns is more than a laptop can
 * show at once, so the sheet scrolls sideways inside its own frame rather than
 * being folded into a narrower shape the paper does not have. The clerk is
 * copying from that paper, and a rearranged form would have to be translated.
 */

const blankRecord = (): InventoryRecordDraft => ({
  itemNumber: 0,
  titleAndDescription: "",
  periodCovered: "",
  volume: "",
  recordsMedium: "",
  restrictions: "",
  locationOfRecords: "",
  frequencyOfUse: "",
  duplication: "",
  timeValue: undefined,
  utilityValue: undefined,
  retentionActive: 0,
  retentionStorage: 0,
  dispositionProvision: "",
});

/** A free-text cell of the line, fields 10 through 16 and 20. */
function TextCell({
  value,
  onChange,
  label,
}: {
  value?: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <td className={EDITABLE_CELL}>
      <textarea
        aria-label={label}
        rows={2}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT} resize-y`}
      />
    </td>
  );
}

/** Whole years only, never negative — field 19. */
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

/** A header cell of the ruled table. */
function Head({
  children,
  rowSpan,
  colSpan,
}: {
  children: React.ReactNode;
  rowSpan?: number;
  colSpan?: number;
}) {
  return (
    <td
      rowSpan={rowSpan}
      colSpan={colSpan}
      className={`${CELL} px-1 py-1 text-center align-middle text-[8.5px] font-bold uppercase leading-[1.2]`}
    >
      {children}
    </td>
  );
}

/** One signature block at the foot of the form. */
function SignatureBlock({
  caption,
  label,
  value,
  onChange,
  extra,
}: {
  caption: string;
  label: string;
  value?: string;
  onChange: (v: string) => void;
  extra?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase text-black">{label}</div>
      <input
        aria-label={label}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-[3px] border border-neutral-400 bg-white px-1.5 py-1 text-[12.5px] outline-none focus:border-neutral-600 focus:ring-2 focus:ring-(--accent-ring)"
      />
      {extra}
      {/* The rule is signed over by hand after printing. */}
      <div className="mt-6 border-b border-black" />
      <div className="mt-1 text-center text-[9.5px] leading-[1.3]">{caption}</div>
    </div>
  );
}

export function AppraisalForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
}: {
  initial?: InventoryAppraisalWithRecords;
  submitting: boolean;
  onSubmit: (input: AppraisalInput) => void;
  onCancel: () => void;
}) {
  const [header, setHeader] = React.useState({
    officeName: initial?.officeName ?? DEFAULT_OFFICE.name,
    departmentDivision: initial?.departmentDivision ?? DEFAULT_OFFICE.departmentDivision,
    sectionUnit: initial?.sectionUnit ?? "",
    telephoneNo: initial?.telephoneNo ?? "",
    emailAddress: initial?.emailAddress ?? "",
    officeAddress: initial?.officeAddress ?? DEFAULT_OFFICE.address,
    personInCharge: initial?.personInCharge ?? "",
    preparedBy: initial?.preparedBy ?? "",
    preparedByPosition: initial?.preparedByPosition ?? "",
    assistedBy: initial?.assistedBy ?? "",
    approvedBy: initial?.approvedBy ?? "",
  });
  const [datePrepared, setDatePrepared] = React.useState<Date | undefined>(
    initial ? new Date(`${initial.datePrepared}T00:00:00`) : new Date(),
  );
  // Status is moved by the panel's actions, never typed (30 Oct 2026).
  const current: ScheduleStatus | null = initial && initial.status !== "Cancelled" ? initial.status : null;
  const { formRef, act, take, savingTo, focusLine } = useRecordForm(current);
  const [records, setRecords] = React.useState<InventoryRecordDraft[]>(
    initial?.records.map((r) => ({
      itemNumber: r.itemNumber,
      titleAndDescription: r.titleAndDescription,
      periodCovered: r.periodCovered ?? "",
      volume: r.volume ?? "",
      recordsMedium: r.recordsMedium ?? "",
      restrictions: r.restrictions ?? "",
      locationOfRecords: r.locationOfRecords ?? "",
      frequencyOfUse: r.frequencyOfUse ?? "",
      duplication: r.duplication ?? "",
      timeValue: r.timeValue,
      utilityValue: r.utilityValue,
      retentionActive: r.retentionActive,
      retentionStorage: r.retentionStorage,
      dispositionProvision: r.dispositionProvision ?? "",
    })) ?? [blankRecord()],
  );

  const setField = (key: keyof typeof header) => (v: string) =>
    setHeader((h) => ({ ...h, [key]: v }));

  const patch = (index: number, changes: Partial<InventoryRecordDraft>) =>
    setRecords((rows) => rows.map((r, i) => (i === index ? { ...r, ...changes } : r)));

  const addRow = () => {
    setRecords((rows) => [...rows, blankRecord()]);
    focusLine(records.length);
  };

  // The last row is never removable: an inventory with no records is not a
  // document the office can file.
  const removeRow = (index: number) =>
    setRecords((rows) => (rows.length === 1 ? rows : rows.filter((_, i) => i !== index)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!datePrepared) return;
    onSubmit({ ...header, datePrepared: toDateOnly(datePrepared), status: take(), records });
  };

  /**
   * A header field: caption above, a filled box beneath, in a ruled cell.
   *
   * Called as a function, never rendered as <HeaderField />: defined inside
   * the form, it would be a new component type on every render, so React
   * would replace the input on each keystroke and the cursor would leave it.
   */
  const headerField = ({
    label,
    field,
    colSpan,
    rowSpan,
  }: {
    label: string;
    field: keyof typeof header;
    colSpan: number;
    rowSpan?: number;
  }) => (
    <td colSpan={colSpan} rowSpan={rowSpan} className={EDITABLE_CELL}>
      <FieldLabel>{label}</FieldLabel>
      <input
        aria-label={label}
        value={header[field]}
        onChange={(e) => setField(field)(e.target.value)}
        className={INPUT}
      />
    </td>
  );

  return (
    // Status is the system's own, not the Archives': it lives in the panel,
    // so the sheet on screen stays the sheet on paper.
    <RecordFormFrame
      ref={formRef}
      orientation="landscape"
      onSubmit={submit}
      panel={
        <RecordFormPanel
          kind="RIA"
          number={initial?.inventoryNo}
          docId={initial?.id}
          current={current}
          facts={[
            { label: "Record series", value: records.length },
            { label: "Date prepared", value: datePrepared ? formatDate(toDateOnly(datePrepared)) : "—" },
          ]}
          addLabel="Add record series"
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

      {/*
       * Fourteen columns do not fit a laptop, so the sheet scrolls sideways
       * inside its own frame. Folding it into a narrower shape would be a form
       * the National Archives never printed.
       */}
      {/* Twenty columns need the long edge, so this one is the landscape
          sheet — the orientation it is viewed and printed in. */}
      <PaperSheet orientation="landscape" fit>
        {/*
         * The row controls hang in the sheet's own right margin, so the ruled
         * columns keep exactly the width they have on the printed sheet and the
         * form lines up with the document it becomes.
         */}
        <div className="-mr-10">
          <table className="w-full table-fixed border-collapse font-[Arial,Helvetica,sans-serif]">
            <colgroup>
              <col className="w-[13%]" />
              <col className="w-[8%]" />
              <col className="w-[5%]" />
              <col className="w-[6%]" />
              <col className="w-[6%]" />
              <col className="w-[8%]" />
              <col className="w-[6%]" />
              <col className="w-[6%]" />
              <col className="w-[6%]" />
              <col className="w-[7%]" />
              <col className="w-[4%]" />
              <col className="w-[4%]" />
              <col className="w-[4%]" />
              <col className="w-[13%]" />
              <col className="w-10" />
            </colgroup>

            <tbody>
              {/* ---- Identity block and fields 1-8 ---- */}
              <tr>
                <td rowSpan={3} colSpan={3} className={`${CELL} px-2 py-3 text-center align-middle`}>
                  <div className="text-[11px] font-bold uppercase leading-[1.3]">
                    National Archives of the Philippines
                  </div>
                  <div className="text-[10px] italic leading-[1.35]">
                    Pambansang Sinupan ng Pilipinas
                  </div>
                  <div className="mt-2 text-[12.5px] font-bold uppercase leading-[1.3]">
                    Records Inventory and Appraisal
                  </div>
                </td>
                {headerField({ label: "1. Name of Office:", field: "officeName", colSpan: 3, rowSpan: 2 })}
                {headerField({ label: "2. Department/Division:", field: "departmentDivision", colSpan: 4 })}
                {headerField({ label: "4. Telephone No.:", field: "telephoneNo", colSpan: 4 })}
                <td />
              </tr>
              <tr>
                {headerField({ label: "3. Section/Unit:", field: "sectionUnit", colSpan: 4 })}
                {headerField({ label: "5. Email Address:", field: "emailAddress", colSpan: 4 })}
                <td />
              </tr>
              <tr>
                {headerField({ label: "6. Address:", field: "officeAddress", colSpan: 3 })}
                {headerField({ label: "7. Person-in-Charge of Files:", field: "personInCharge", colSpan: 4 })}
                <td colSpan={4} className={EDITABLE_CELL}>
                  <FieldLabel>8. Date Prepared:</FieldLabel>
                  <DatePicker
                    id="date-prepared"
                    value={datePrepared}
                    onChange={setDatePrepared}
                    className="m-1 w-[calc(100%-0.5rem)] rounded-[3px] border-neutral-400 px-1.5 py-1 text-[12.5px]"
                  />
                </td>
                <td />
              </tr>

              {/* ---- Column headings, fields 9 to 20 ---- */}
              <tr>
                <Head rowSpan={2}>9. Records Series Title and Description</Head>
                <Head rowSpan={2}>
                  10. Period Covered /<br />
                  Inclusive Dates
                </Head>
                <Head rowSpan={2}>11. Volume</Head>
                <Head rowSpan={2}>12. Records Medium</Head>
                <Head rowSpan={2}>13. Restriction/s</Head>
                <Head rowSpan={2}>14. Location of Records</Head>
                <Head rowSpan={2}>15. Frequency of Use</Head>
                <Head rowSpan={2}>16. Duplication</Head>
                <Head rowSpan={2}>
                  17. Time Value
                  <br />
                  (T/P)
                </Head>
                <Head rowSpan={2}>
                  18. Utility Value
                  <br />
                  Adm/F/L/Arc
                </Head>
                <Head colSpan={3}>19. Retention Period</Head>
                <Head rowSpan={2}>20. Disposition Provision</Head>
                <td />
              </tr>
              <tr>
                <Head>Active</Head>
                <Head>Storage</Head>
                <Head>Total</Head>
                <td />
              </tr>

              {/* ---- The record lines ---- */}
              {records.map((row, i) => (
                <tr key={i} data-line={i}>
                  <td className={EDITABLE_CELL}>
                    <textarea
                      aria-label={`Item ${i + 1} records series title and description`}
                      rows={2}
                      value={row.titleAndDescription}
                      onChange={(e) => patch(i, { titleAndDescription: e.target.value })}
                      required
                      className={`${INPUT} resize-y`}
                    />
                  </td>
                  <TextCell
                    label={`Item ${i + 1} period covered`}
                    value={row.periodCovered}
                    onChange={(v) => patch(i, { periodCovered: v })}
                  />
                  <TextCell
                    label={`Item ${i + 1} volume`}
                    value={row.volume}
                    onChange={(v) => patch(i, { volume: v })}
                  />
                  <TextCell
                    label={`Item ${i + 1} records medium`}
                    value={row.recordsMedium}
                    onChange={(v) => patch(i, { recordsMedium: v })}
                  />
                  <TextCell
                    label={`Item ${i + 1} restrictions`}
                    value={row.restrictions}
                    onChange={(v) => patch(i, { restrictions: v })}
                  />
                  <TextCell
                    label={`Item ${i + 1} location of records`}
                    value={row.locationOfRecords}
                    onChange={(v) => patch(i, { locationOfRecords: v })}
                  />
                  <TextCell
                    label={`Item ${i + 1} frequency of use`}
                    value={row.frequencyOfUse}
                    onChange={(v) => patch(i, { frequencyOfUse: v })}
                  />
                  <TextCell
                    label={`Item ${i + 1} duplication`}
                    value={row.duplication}
                    onChange={(v) => patch(i, { duplication: v })}
                  />
                  {/*
                   * Fields 17 and 18 are a closed vocabulary — the form prints
                   * its own legend for them — so they are chosen, not typed.
                   */}
                  <td className={EDITABLE_CELL}>
                    <select
                      aria-label={`Item ${i + 1} time value`}
                      value={row.timeValue ?? ""}
                      onChange={(e) =>
                        patch(i, { timeValue: (e.target.value || undefined) as TimeValue | undefined })
                      }
                      className={INPUT}
                    >
                      <option value="">—</option>
                      {TIME_VALUES.map((v) => (
                        <option key={v.code} value={v.code}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={EDITABLE_CELL}>
                    <select
                      aria-label={`Item ${i + 1} utility value`}
                      value={row.utilityValue ?? ""}
                      onChange={(e) =>
                        patch(i, {
                          utilityValue: (e.target.value || undefined) as UtilityValue | undefined,
                        })
                      }
                      className={INPUT}
                    >
                      <option value="">—</option>
                      {UTILITY_VALUES.map((v) => (
                        <option key={v.code} value={v.code}>
                          {v.label}
                        </option>
                      ))}
                    </select>
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
                  <td
                    className={`${CELL} px-1 py-1 text-center text-[12.5px] font-medium tabular-nums`}
                  >
                    {row.retentionActive + row.retentionStorage}
                  </td>
                  <TextCell
                    label={`Item ${i + 1} disposition provision`}
                    value={row.dispositionProvision}
                    onChange={(v) => patch(i, { dispositionProvision: v })}
                  />
                  <td className="pl-1.5 align-middle">
                    <IconButton
                      type="button"
                      size="icon-sm"
                      aria-label={`Remove item ${i + 1}`}
                      disabled={records.length === 1}
                      onClick={() => removeRow(i)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </td>
                </tr>
              ))}

              {/* ---- Legend and signatures, as printed at the foot ---- */}
              <tr>
                <td colSpan={14} className={`${CELL} px-3 py-3`}>
                  <div className="text-[9.5px] leading-[1.6]">
                    <span className="font-bold">LEGEND:</span>
                    <div className="mt-1 flex flex-wrap gap-x-8">
                      <span>
                        <span className="font-bold">TIME VALUE:</span>{" "}
                        {TIME_VALUES.map((v) => v.label).join("   ")}
                      </span>
                      <span>
                        <span className="font-bold">UTILITY VALUE:</span>{" "}
                        {UTILITY_VALUES.map((v) => v.label).join("   ")}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-8 md:grid-cols-3">
                    <SignatureBlock
                      label="Prepared by:"
                      caption={SIGNATORY_CAPTIONS.preparedBy}
                      value={header.preparedBy}
                      onChange={setField("preparedBy")}
                      extra={
                        <input
                          aria-label="Position of the person who prepared this"
                          placeholder="Position"
                          value={header.preparedByPosition}
                          onChange={(e) => setField("preparedByPosition")(e.target.value)}
                          className="mt-1 w-full rounded-[3px] border border-neutral-400 bg-white px-1.5 py-1 text-[12.5px] outline-none focus:border-neutral-600 focus:ring-2 focus:ring-(--accent-ring)"
                        />
                      }
                    />
                    <SignatureBlock
                      label="Assisted by:"
                      caption={SIGNATORY_CAPTIONS.assistedBy}
                      value={header.assistedBy}
                      onChange={setField("assistedBy")}
                    />
                    <SignatureBlock
                      label="Approved by:"
                      caption={SIGNATORY_CAPTIONS.approvedBy}
                      value={header.approvedBy}
                      onChange={setField("approvedBy")}
                    />
                  </div>
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
        Add record series
      </Button>
    </RecordFormFrame>
  );
}
