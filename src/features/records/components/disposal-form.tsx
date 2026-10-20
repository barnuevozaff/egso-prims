import * as React from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button, DatePicker, IconButton, SelectField } from "@/components";
import { PaperSheet, SHEET_WIDTH } from "@/features/shared/paper-sheet";
import {
  CELL,
  EDITABLE_CELL,
  FieldLabel,
  FillLegend,
  INPUT,
  toDateOnly,
} from "@/features/records/components/nap-form-chrome";
import { SCHEDULE_STATUSES, type ScheduleStatus } from "@/features/records/types";
import {
  CERTIFICATION_TEXT,
  CERTIFIED_BY_CAPTION,
  DEFAULT_AGENCY,
  FORM_MARKINGS,
  type DisposalInput,
  type DisposalItemDraft,
  type DisposalRequestWithItems,
} from "@/features/records/disposal-types";

/**
 * The Request for Authority to Dispose of Records editor — NAP Form No. 3,
 * drawn as the paper, same as the two records forms beside it.
 *
 * The certification above the agency head's signature is printed, never typed:
 * it is the form's own wording and a legal undertaking, so the clerk supplies
 * the name and the form supplies the sentence.
 */

const blankItem = (): DisposalItemDraft => ({
  itemNumber: 0,
  grdsRdsItemNo: "",
  titleAndDescription: "",
  periodCovered: "",
  retentionAndProvisions: "",
});

/**
 * A free-text cell of the line.
 *
 * Alignment follows the accomplished form: the item number and the period sit
 * centred in their narrow columns, while the description and the retention
 * note read as prose from the left.
 */
function TextCell({
  value,
  onChange,
  label,
  rows = 2,
  centre = false,
}: {
  value?: string;
  onChange: (v: string) => void;
  label: string;
  rows?: number;
  centre?: boolean;
}) {
  return (
    <td className={EDITABLE_CELL}>
      <textarea
        aria-label={label}
        rows={rows}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT} resize-y ${centre ? "text-center" : ""}`}
      />
    </td>
  );
}

function Head({ children, colSpan }: { children: React.ReactNode; colSpan?: number }) {
  return (
    <td
      colSpan={colSpan}
      className={`${CELL} px-1 py-1 text-center align-middle text-[9px] font-bold uppercase leading-[1.25]`}
    >
      {children}
    </td>
  );
}

export function DisposalForm({
  initial,
  submitting,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: DisposalRequestWithItems;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (input: DisposalInput) => void;
  onCancel: () => void;
}) {
  const [header, setHeader] = React.useState({
    agencyName: initial?.agencyName ?? DEFAULT_AGENCY.name,
    agencyAddress: initial?.agencyAddress ?? DEFAULT_AGENCY.address,
    telephoneNumber: initial?.telephoneNumber ?? "",
    emailAddress: initial?.emailAddress ?? "",
    locationOfRecords: initial?.locationOfRecords ?? "",
    volumeCubicMeter: initial?.volumeCubicMeter ?? "",
    preparedBy: initial?.preparedBy ?? "",
    preparedByPosition: initial?.preparedByPosition ?? "",
    certifiedBy: initial?.certifiedBy ?? "",
    certifiedByPosition: initial?.certifiedByPosition ?? "",
  });
  const [requestDate, setRequestDate] = React.useState<Date | undefined>(
    initial ? new Date(`${initial.requestDate}T00:00:00`) : new Date(),
  );
  const [status, setStatus] = React.useState<ScheduleStatus>(
    initial?.status && initial.status !== "Cancelled" ? initial.status : "Draft",
  );
  const [items, setItems] = React.useState<DisposalItemDraft[]>(
    initial?.items.map((it) => ({
      itemNumber: it.itemNumber,
      grdsRdsItemNo: it.grdsRdsItemNo ?? "",
      titleAndDescription: it.titleAndDescription,
      periodCovered: it.periodCovered ?? "",
      retentionAndProvisions: it.retentionAndProvisions ?? "",
    })) ?? [blankItem()],
  );

  const setField = (key: keyof typeof header) => (v: string) =>
    setHeader((h) => ({ ...h, [key]: v }));

  const patch = (index: number, changes: Partial<DisposalItemDraft>) =>
    setItems((rows) => rows.map((r, i) => (i === index ? { ...r, ...changes } : r)));

  const addRow = () => setItems((rows) => [...rows, blankItem()]);

  // The last row is never removable: a request with no lines asks permission
  // to destroy nothing.
  const removeRow = (index: number) =>
    setItems((rows) => (rows.length === 1 ? rows : rows.filter((_, i) => i !== index)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestDate) return;
    onSubmit({ ...header, requestDate: toDateOnly(requestDate), status, items });
  };

  /**
   * A header field: caption above, a filled box beneath, in a ruled cell.
   *
   * Values are centred and the agency block takes more than one line, because
   * that is how an accomplished form reads: the agency name carries its
   * division under it, and the address runs to two lines.
   *
   * Called as a function, never rendered as <HeaderField />: defined inside
   * the form, it would be a new component type on every render, so React
   * would replace the input on each keystroke and the cursor would leave it.
   */
  const headerField = ({
    label,
    field,
    colSpan,
    rows,
  }: {
    label: string;
    field: keyof typeof header;
    colSpan?: number;
    /** Set for the fields the paper fills across more than one line. */
    rows?: number;
  }) => (
    <td colSpan={colSpan} className={EDITABLE_CELL}>
      <FieldLabel>{label}</FieldLabel>
      {rows ? (
        <textarea
          aria-label={label}
          rows={rows}
          value={header[field]}
          onChange={(e) => setField(field)(e.target.value)}
          className={`${INPUT} resize-y text-center`}
        />
      ) : (
        <input
          aria-label={label}
          value={header[field]}
          onChange={(e) => setField(field)(e.target.value)}
          className={`${INPUT} text-center`}
        />
      )}
    </td>
  );

  return (
    // The form is the sheet it becomes, so everything on the page — the
    // status field above it, the buttons below — lines up with its edges.
    <form
      onSubmit={submit}
      className="mx-auto w-full space-y-4"
      style={{ maxWidth: SHEET_WIDTH.portrait }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="disposal-status" className="text-xs font-medium text-neutral-700">
          Status
        </label>
        <SelectField
          id="disposal-status"
          value={status}
          onChange={(v) => setStatus(v as ScheduleStatus)}
          options={SCHEDULE_STATUSES.map((s) => ({ value: s, label: s }))}
          className="w-40"
        />
        <span className="text-xs text-neutral-500">
          Tracked by this system — it is not part of the National Archives form.
        </span>
        <FillLegend />
      </div>

      <PaperSheet>
        {/*
         * The row controls hang in the sheet's own right margin, so the ruled
         * columns keep exactly the width they have on the printed sheet and the
         * form lines up with the document it becomes.
         */}
        <div className="-mr-10">
          {/* The form's own margin notes, printed on the paper. */}
          <div className="mb-1 flex items-start justify-between text-[9.5px] leading-[1.35] text-black">
            <span className="whitespace-pre-line">{FORM_MARKINGS.reference}</span>
            <span>{FORM_MARKINGS.copies}</span>
          </div>

          <table className="w-full table-fixed border-collapse font-[Arial,Helvetica,sans-serif]">
            <colgroup>
              <col className="w-[13%]" />
              <col />
              <col className="w-[18%]" />
              <col className="w-[24%]" />
              <col className="w-10" />
            </colgroup>

            <tbody>
              {/* ---- Identity block, agency name and address ---- */}
              <tr>
                <td rowSpan={2} colSpan={2} className={`${CELL} px-2 py-3 text-center align-middle`}>
                  <div className="text-[11px] font-bold uppercase leading-[1.3]">
                    National Archives of the Philippines
                  </div>
                  <div className="text-[10px] italic leading-[1.35]">
                    Pambansang Sinupan ng Pilipinas
                  </div>
                  <div className="mt-2 text-[12.5px] font-bold uppercase leading-[1.3]">
                    Request for Authority to Dispose of Records
                  </div>
                </td>
                {headerField({ label: "Agency Name:", field: "agencyName", colSpan: 2, rows: 2 })}
                <td />
              </tr>
              <tr>
                {headerField({ label: "Address:", field: "agencyAddress", colSpan: 2, rows: 2 })}
                <td />
              </tr>

              {/* ---- Date, telephone, email ---- */}
              <tr>
                <td colSpan={2} className={EDITABLE_CELL}>
                  <FieldLabel>Date:</FieldLabel>
                  <DatePicker
                    id="request-date"
                    value={requestDate}
                    onChange={setRequestDate}
                    className="m-1 w-[calc(100%-0.5rem)] rounded-[3px] border-neutral-400 px-1.5 py-1 text-[12.5px]"
                  />
                </td>
                {headerField({ label: "Telephone Number:", field: "telephoneNumber" })}
                {headerField({ label: "Email Address:", field: "emailAddress" })}
                <td />
              </tr>

              {/* ---- Column headings ---- */}
              <tr>
                <Head>
                  GRDS/
                  <br />
                  RDS Item No.
                </Head>
                <Head>Record Series Title and Description</Head>
                <Head>Period Covered</Head>
                <Head>
                  Retention Period and Provision/s Complied{" "}
                  <span className="font-bold italic">(If Any)</span>
                </Head>
                <td />
              </tr>

              {/* ---- The lines ---- */}
              {items.map((row, i) => (
                <tr key={i}>
                  <TextCell
                    label={`Item ${i + 1} GRDS or RDS item number`}
                    value={row.grdsRdsItemNo}
                    onChange={(v) => patch(i, { grdsRdsItemNo: v })}
                    rows={4}
                    centre
                  />
                  <td className={EDITABLE_CELL}>
                    {/*
                     * Four lines, because a record series on this form is a
                     * heading with its kinds listed under it — "LISTS", then
                     * Associations, Committee, Cooperatives.
                     */}
                    <textarea
                      aria-label={`Item ${i + 1} record series title and description`}
                      rows={4}
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
                    rows={4}
                    centre
                  />
                  <TextCell
                    label={`Item ${i + 1} retention period and provisions complied`}
                    value={row.retentionAndProvisions}
                    onChange={(v) => patch(i, { retentionAndProvisions: v })}
                    rows={4}
                  />
                  <td className="pl-1.5 align-middle">
                    <IconButton
                      type="button"
                      size="icon-sm"
                      aria-label={`Remove item ${i + 1}`}
                      disabled={items.length === 1}
                      onClick={() => removeRow(i)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconButton>
                  </td>
                </tr>
              ))}

              {/* ---- Location and volume. The paper splits this band evenly. ---- */}
              <tr>
                {headerField({ label: "Location of Records:", field: "locationOfRecords", colSpan: 2 })}
                {headerField({ label: "Volume in Cubic Meter:", field: "volumeCubicMeter", colSpan: 2 })}
                <td />
              </tr>

              {/* ---- Prepared by and position ---- */}
              <tr>
                {headerField({ label: "Prepared by: (Name & Signature)", field: "preparedBy", colSpan: 2 })}
                {headerField({ label: "Position:", field: "preparedByPosition", colSpan: 2 })}
                <td />
              </tr>

              {/* ---- The certification ---- */}
              <tr>
                <td colSpan={4} className={`${CELL} px-2 py-2`}>
                  <div className="text-[9px] font-bold uppercase leading-[1.3]">
                    Certified and Approved by:
                  </div>
                  {/*
                   * Printed, never typed: the form's own wording, and a legal
                   * undertaking the agency head signs over.
                   */}
                  <p className="mx-auto mt-3 max-w-[36rem] text-center text-[11px] leading-[1.5]">
                    {CERTIFICATION_TEXT}
                  </p>
                  {/*
                   * Name and the position it is signed under — both are on the
                   * paper, and the position is the authority the certification
                   * rests on.
                   */}
                  <div className="mx-auto mt-6 max-w-[24rem] space-y-1">
                    <input
                      aria-label="Name of agency head or duly authorized representative"
                      placeholder="Name"
                      value={header.certifiedBy}
                      onChange={(e) => setField("certifiedBy")(e.target.value)}
                      className="w-full rounded-[3px] border border-neutral-400 bg-white px-1.5 py-1 text-center text-[12.5px] font-bold outline-none focus:border-neutral-600 focus:ring-2 focus:ring-(--accent-ring)"
                    />
                    <input
                      aria-label="Position of the certifying officer"
                      placeholder="Position"
                      value={header.certifiedByPosition}
                      onChange={(e) => setField("certifiedByPosition")(e.target.value)}
                      className="w-full rounded-[3px] border border-neutral-400 bg-white px-1.5 py-1 text-center text-[12.5px] font-bold outline-none focus:border-neutral-600 focus:ring-2 focus:ring-(--accent-ring)"
                    />
                    <div className="whitespace-pre-line pt-0.5 text-center text-[9.5px] leading-[1.35]">
                      {CERTIFIED_BY_CAPTION}
                    </div>
                  </div>
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </PaperSheet>

      <Button type="button" variant="outline" onClick={addRow}>
        <Plus className="mr-2 h-4 w-4" />
        Add Record Series
      </Button>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
