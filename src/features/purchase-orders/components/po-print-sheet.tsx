import { amountInWords, PrintSheet, printAmount, printDate } from "@/features/shared/procurement-print-form";
import {
  supplierById,
  poTotal,
  type POSignatory,
  type PurchaseOrder,
} from "@/features/purchase-orders/types";
import {
  useCurrentPOSignatories,
  type CurrentPOSignatories,
} from "@/features/purchase-orders/components/use-po-signatories";

/**
 * The official Municipality of Alaminos Purchase Order (21 Oct 2026), laid
 * out after the office's workbook "P.O AND ACCEPTANCE (3).xlsx", sheet
 * PURCHASE ORDER: Times New Roman; the title, "Municipality of Alaminos,
 * Laguna" underlined and "LGU"; the boxed supplier and order block (Supplier,
 * Address, TIN, Contact Number | P.O. No., Date, Mode of Procurement, PR
 * No./s); "Gentlemen:"; delivery and payment terms; the six-column table
 * (Stock/Property No., Unit, Description, Quantity, Unit Cost, Amount) ruled
 * to seventeen lines; the total in words; the penalty clause; Conforme and
 * "Very truly yours," signatures; and the negotiated-purchase portion with
 * the BAC resolution and the BAC Secretary's certification.
 *
 * Column widths follow the workbook's (9.1, 10, 42.4, 10.3, 11.4, 18.1).
 * The template has no item-number column, so none is added; lines print in
 * the order's order. Long orders run onto further sheets with the column heads
 * repeated, and the total, clauses and signatures follow the last line.
 *
 * Provisional: the A4 page (the workbook sets no paper size).
 *
 * Signatories: an approved order prints the names it was approved with;
 * orders typed before 21 Oct 2026 print their typed names; before approval
 * the sheet is a draft and previews Settings → Purchase Order signatories.
 * Nothing is dated or signed on a draft.
 */

/** The template's minimum of ruled item lines (rows 15–31). */
const MIN_LINES = 17;
const COLS = ["9%", "9.9%", "41.8%", "10.1%", "11.3%", "17.9%"];

const qty = (n: number) => n.toLocaleString("en-PH", { maximumFractionDigits: 2 });

/**
 * "Label :" with its value, or a ruled line to the edge of the cell for
 * handwriting. The line takes the room that is left rather than a fixed
 * width, and a long value wraps, so nothing runs past the paper's edge.
 */
function Labelled({ label, value, small }: { label: string; value?: string; small?: boolean }) {
  const text = value?.trim();
  return (
    // Baseline: the label sits on the first line of a long value, and a blank line sits on the text's baseline.
    <div className="flex min-w-0 items-baseline gap-1 font-bold">
      <span className={small ? "shrink-0 text-[10.5px]" : "shrink-0"}>{label}</span>
      {text ? (
        <span className={small ? "min-w-0 break-words text-[12.5px]" : "min-w-0 break-words"}>{text}</span>
      ) : (
        <span aria-hidden="true" className="h-[1em] min-w-[48px] flex-1 border-b border-black" />
      )}
    </div>
  );
}

function SignatureName({ who, fallback }: { who: POSignatory | null | undefined; fallback: string }) {
  return who ? (
    <>
      {/* Exactly as set: the PO template reads "ERICSON R. LOPEZ", without "Hon.". */}
      <div className="font-bold">{who.name}</div>
      <div>{who.designation}</div>
    </>
  ) : (
    <>
      {/* Not set in Settings when the order was authorized: a line to sign over, nothing invented. */}
      <div className="mx-auto h-[1.2em] w-[72%] border-b border-black" />
      <div>{fallback}</div>
    </>
  );
}

/** Who signs this order, and whether the names are final. */
function signatoriesOf(po: PurchaseOrder, current: CurrentPOSignatories) {
  if (po.signatories) return { ...po.signatories, final: true };
  // Typed on the order before 21 Oct 2026.
  if (po.municipalMayor || po.bacSecretary) {
    const strip = (s: string) => s.replace(/^Hon\.\s*/i, "");
    return {
      approvedBy: po.municipalMayor ? { name: strip(po.municipalMayor), designation: "Municipal Mayor" } : null,
      bacSecretary: po.bacSecretary ? { name: po.bacSecretary, designation: "BAC Secretary" } : null,
      final: po.status !== "Draft" && po.status !== "Pending Approval",
    };
  }
  return { approvedBy: current.approvedBy, bacSecretary: current.bacSecretary, final: false };
}

/** The order's printed date: set at approval; older approved orders use their issue date. */
function orderDate(po: PurchaseOrder): string | undefined {
  if (po.poDate) return po.poDate;
  if (["Approved", "Released", "Completed"].includes(po.status)) return po.issuedDate;
  return undefined;
}

export function PODocument({ po, current }: { po: PurchaseOrder; current: CurrentPOSignatories }) {
  const total = poTotal(po);
  const blanks = Math.max(0, MIN_LINES - po.items.length);
  const signers = signatoriesOf(po, current);
  const date = orderDate(po);
  const voided = po.status === "Cancelled";
  const cell = "border border-black px-1.5 py-px align-top";

  return (
    <div className="w-full max-w-full font-['Times_New_Roman',Times,serif] text-[12.5px] leading-[1.22] text-black [overflow-wrap:break-word]">
      <div className="text-center">
        <div className="text-[16px] font-bold">PURCHASE ORDER</div>
        <div className="text-[20px] leading-[1.2] underline underline-offset-[3px]">Municipality of Alaminos, Laguna</div>
        <div className="text-[13px] font-bold">LGU</div>
        {voided && <div className="mt-0.5 text-[14px] font-bold tracking-[0.08em]">VOIDED</div>}
      </div>

      {/* Supplier and order block, rows 5–13 of the sheet. */}
      <table className="mt-2 w-full table-fixed border-collapse">
        <colgroup>
          <col style={{ width: "59.9%" }} />
          <col style={{ width: "40.1%" }} />
        </colgroup>
        <tbody>
          <tr>
            <td className="border-l border-t border-black px-1.5 pt-1">
              {/* Blank on a new order until completed, here or by hand. */}
              <Labelled label="Supplier :" value={po.supplierName?.trim() || supplierById(po.supplierId)?.name} />
            </td>
            <td className="border-l border-r border-t border-black px-1.5 pt-1">
              <Labelled label="P.O. No. :" value={po.poNumber} />
            </td>
          </tr>
          <tr>
            <td className="border-l border-black px-1.5">
              <Labelled label="Address :" value={po.supplierAddress} />
            </td>
            <td className="border-l border-r border-black px-1.5">
              <Labelled label="Date:" value={date ? printDate(date) : undefined} />
            </td>
          </tr>
          <tr>
            <td className="border-l border-black px-1.5 py-1">
              <Labelled label="TIN :" value={po.supplierTin} />
            </td>
            <td className="border-l border-r border-black px-1.5 py-1">
              <Labelled label="Mode of Procurement :" value={po.modeOfProcurement} small />
            </td>
          </tr>
          <tr>
            <td className="border-b border-l border-black px-1.5 pb-1">
              <Labelled label="Contact Number:" value={po.supplierContact} />
            </td>
            <td className="border-b border-l border-r border-black px-1.5 pb-1">
              <Labelled label="PR No./s" value={po.prOfficialNumber || po.prNumber} />
            </td>
          </tr>
          <tr>
            <td colSpan={2} className="border-l border-r border-black px-1.5 pt-1">
              &nbsp;Gentlemen:
            </td>
          </tr>
          <tr>
            <td colSpan={2} className="border-b border-l border-r border-black px-1.5 pb-2 pl-6">
              Please furnish this Office the following articles subject to the terms and conditions contained herein:
            </td>
          </tr>
          <tr>
            <td className="border-l border-black px-1.5 pt-1">
              <Labelled label="Place of Delivery :" value={po.deliveryAddress} />
            </td>
            <td className="border-l border-r border-black px-1.5 pt-1">
              <Labelled label="Delivery Term :" value={po.deliveryTerm} />
            </td>
          </tr>
          <tr>
            <td className="border-l border-black px-1.5 pb-1">
              <Labelled
                label="Date of Delivery :"
                value={po.expectedDelivery ? printDate(po.expectedDelivery) : undefined}
              />
            </td>
            <td className="border-l border-r border-black px-1.5 pb-1">
              <Labelled label="Payment Term :" value={po.paymentTerm} />
            </td>
          </tr>
        </tbody>
      </table>

      {/* The items. Column heads repeat on every sheet; a line never splits. */}
      <table className="-mt-px w-full table-fixed border-collapse">
        <colgroup>
          {COLS.map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {["Stock/ Property No.", "Unit", "Description", "Quantity", "Unit Cost", "Amount"].map((h) => (
              <th key={h} className={`${cell} py-1 text-center align-middle font-bold leading-[1.15]`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {po.items.map((it, i) => (
            <tr key={it.id || i} className="break-inside-avoid">
              <td className={`${cell} text-center`}>{it.stockNo ?? ""}</td>
              <td className={`${cell} text-center`}>{it.unit}</td>
              <td className={`${cell} break-words`}>{it.description}</td>
              <td className={`${cell} text-center tabular-nums`}>{qty(it.quantity)}</td>
              <td className={`${cell} text-right tabular-nums`}>{printAmount(it.unitCost)}</td>
              <td className={`${cell} text-right tabular-nums`}>{printAmount(it.quantity * it.unitCost)}</td>
            </tr>
          ))}
          {Array.from({ length: blanks }).map((_, i) => (
            <tr key={`b-${i}`}>
              {COLS.map((__, c) => (
                <td key={c} className={cell}>
                  &nbsp;
                </td>
              ))}
            </tr>
          ))}
          <tr className="break-inside-avoid">
            <td colSpan={2} className={`${cell} align-middle text-[9.5px] font-bold`}>
              (Total Amount in Words)
            </td>
            <td colSpan={3} className={`${cell} align-middle text-[12px] italic`}>
              {amountInWords(total)}
            </td>
            <td className={`${cell} align-middle text-right text-[15px] font-bold tabular-nums`}>{printAmount(total)}</td>
          </tr>
        </tbody>
      </table>

      {/* Clauses, signatures and the reference line stay together after the last line. */}
      <div className="break-inside-avoid">
        <div className="border-b border-l border-r border-black px-2 pb-2">
          <p className="pt-2 indent-10 text-justify">
            In case of failure to make the full delivery within the time specified above, a penalty of one-tenth (1/10)
            of one percent for every day of delay shall be imposed on the undelivered item/s.
          </p>

          <div className="mt-2 grid grid-cols-[59.9%_40.1%]">
            <div className="pl-10">Conforme:</div>
            <div>Very truly yours,</div>
          </div>
          <div className="mt-5 grid grid-cols-[59.9%_40.1%] items-end text-center">
            <div className="px-6">
              <div className="mx-auto w-[86%] border-b border-black" />
              <div className="mt-0.5">Signature over Printed Name of Supplier</div>
            </div>
            <div>
              <SignatureName who={signers.approvedBy} fallback="Municipal Mayor" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-[59.9%_40.1%] text-center">
            <div className="px-6">
              <div className="mx-auto w-[66%] border-b border-black" />
              <div className="mt-0.5">Date</div>
            </div>
            <div />
          </div>

          {/* The negotiated-purchase portion, filled in only for such a purchase. */}
          <p className="mt-2 text-center">
            (In case of Negotiated Purchase pursuant to Section 369 (a) of RA 7160, this portion must be accomplished.)
          </p>
          <p className="pl-10">
            Approved per Sanggunian BAC Resolution No,{" "}
            {po.bacResolutionNo ? (
              <span className="underline">{po.bacResolutionNo}</span>
            ) : (
              <span className="inline-block w-[60px] border-b border-black" />
            )}{" "}
            Series of{" "}
            {po.bacResolutionSeries ? (
              <span className="underline">{po.bacResolutionSeries}</span>
            ) : (
              <span className="inline-block w-[48px] border-b border-black" />
            )}
          </p>
          <div className="mt-2 grid grid-cols-[59.9%_40.1%] text-center">
            <div>Certified Correct:</div>
            <div />
          </div>
          <div className="mt-4 grid grid-cols-[59.9%_40.1%] items-end text-center">
            <div>
              <SignatureName who={signers.bacSecretary} fallback="BAC Secretary" />
            </div>
            <div>
              <div className="mx-auto w-[46%] border-b border-black" />
              <div className="mt-0.5">Date</div>
            </div>
          </div>
        </div>

        {/* For lookup in GSO PRIMS; not part of the official form. */}
        <div className="mt-2 flex justify-between gap-4 font-sans text-[9.5px] text-neutral-700">
          <span>
            GSO PRIMS · from {po.prNumber}
            {po.prOfficialNumber ? ` (official PR No. ${po.prOfficialNumber})` : ""} · {po.items.length}{" "}
            {po.items.length === 1 ? "line" : "lines"}
          </span>
          <span>
            {voided
              ? "VOIDED — not a valid order"
              : po.authorization === "pr-approval"
                ? // Authorization only: nothing here says the order was signed, issued or delivered.
                  `Authorized by the approval of ${po.prOfficialNumber || po.prNumber}${date ? ` on ${printDate(date)}` : ""}`
                : signers.final
                  ? `Approved${date ? ` ${printDate(date)}` : ""}`
                  : "DRAFT — not yet approved; signatories shown from current Settings"}
          </span>
        </div>
      </div>
    </div>
  );
}

/** One printed Purchase Order. */
export function POPrintSheet({ po }: { po: PurchaseOrder }) {
  const current = useCurrentPOSignatories();
  return (
    <PrintSheet>
      <PODocument po={po} current={current} />
    </PrintSheet>
  );
}

/** Several orders in one print job, each starting on a new sheet. */
export function POPrintSheets({ pos, current }: { pos: PurchaseOrder[]; current: CurrentPOSignatories }) {
  return (
    <PrintSheet>
      {pos.map((po, i) => (
        <div
          key={po.id}
          data-po-document={po.poNumber}
          style={i > 0 ? { breakBefore: "page", pageBreakBefore: "always" } : undefined}
        >
          <PODocument po={po} current={current} />
        </div>
      ))}
    </PrintSheet>
  );
}
