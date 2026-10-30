import { MunicipalLetterhead, PrintSheet, printDate } from "@/features/shared/procurement-print-form";
import { departmentByCode } from "@/features/purchase-requests/types";
import type { RequestForIssuance } from "@/features/ris/types";

/**
 * Print sheets for the three procurement documents.
 *
 * The purchase request uses the generic ProcurementPrintForm. The order and
 * the issue slip are the office's own forms — each with its own meta block,
 * table shape and signature panel — so they are laid out here directly. All
 * three share PrintSheet, which handles the portal, page setup and print
 * isolation.
 */

const qty = (n: number) => n.toLocaleString("en-PH", { maximumFractionDigits: 2 });

/**
 * The Purchase Request has its own sheet after the office's template
 * (21 Oct 2026): features/purchase-requests/components/pr-print-sheet.tsx.
 * Re-exported here so the drawer and the detail page keep their import.
 */
export { PRPrintSheet } from "@/features/purchase-requests/components/pr-print-sheet";

/**
 * "Label :" and its writing line, as Appendix 48 rules its fields (30 Oct
 * 2026): the value is printed on the line, and a blank keeps the line for
 * handwriting. The line runs to the end of its column.
 */
function FieldLine({ label, value, className }: { label: string; value?: string; className?: string }) {
  return (
    <div className={`flex min-w-0 items-baseline gap-1 ${className ?? ""}`}>
      <span className="shrink-0 font-bold">{label}</span>
      <span className="min-w-[40px] flex-1 break-words border-b border-black">{value?.trim() || " "}</span>
    </div>
  );
}

/**
 * The Purchase Order has its own sheet after the office's workbook
 * (21 Oct 2026): features/purchase-orders/components/po-print-sheet.tsx.
 */
export { POPrintSheet } from "@/features/purchase-orders/components/po-print-sheet";

/**
 * The Municipality of Alaminos requisition and issue slip, Appendix 48. The
 * table is split into what was requisitioned and what was actually issued,
 * and the signature block is left blank to be signed on the printed copy.
 *
 * The top section follows the Appendix 48 workbook (30 Oct 2026): Times New
 * Roman; "Appendix 48" at the top right; one box holding the title, LGU and
 * Fund, a rule, then Division and FPP Code, and Office, RIS No. and Date, each
 * on its own writing line; the table continues the box. The municipal
 * letterhead above the box is the one the PR and the PO carry.
 *
 * One slip's document, used by the single and the batch sheet.
 */
function RISDocument({ ris }: { ris: RequestForIssuance }) {
  // Blank lines carry the ruled grid down the sheet, as the paper form does.
  const GRID_LINES = 12;
  const blanks = Math.max(0, GRID_LINES - ris.items.length);
  const cell = "border border-black px-2 py-1 align-top";
  const head = `${cell} bg-[#efefef] text-center text-[11.5px] font-bold`;

  return (
    <div>
      <div className="font-['Times_New_Roman',Times,serif] text-[12.5px] leading-[1.3] text-black">
        <div className="text-right text-[12px] italic">Appendix 48</div>
        <MunicipalLetterhead />

        {/* The slip's box: title; LGU and Fund; a rule; Division, FPP Code; Office, RIS No., Date. */}
        <div className="mt-2 border border-black">
          <div className="pb-3 pt-2 text-center text-[15px] font-bold">REQUISITION AND ISSUE SLIP</div>
          <div className="grid grid-cols-[55%_45%] px-2 pb-2">
            <FieldLine label="LGU :" value="Municipality of Alaminos" className="pr-10" />
            <FieldLine label="Fund :" value={ris.fund} className="pr-8" />
          </div>
          <div className="grid grid-cols-[37.5%_38.5%_24%] gap-y-1.5 border-t border-black px-2 pb-2 pt-2.5">
            <FieldLine label="Division :" value={ris.division} className="pr-4" />
            <FieldLine label="FPP Code:" value={ris.fppCode} className="pr-6" />
            <div />
            <FieldLine label="Office :" value={departmentByCode(ris.departmentCode).name} className="pr-4" />
            <FieldLine label="RIS No. :" value={ris.risNumber} className="pr-6" />
            <FieldLine label="Date:" value={printDate(ris.issueDate)} />
          </div>
        </div>

        {/* Requisitioned against issued; it continues the box above. */}
        <table className="-mt-px w-full table-fixed border-collapse text-[12.5px]">
          {/*
           * Widths live in the colgroup, not on the header cells: under
           * table-layout: fixed the browser takes column widths from the first
           * row, which here is the Requisition/Issuance span — so widths set on
           * the second row are ignored and every column comes out equal.
           * Description is given the lion's share so the item reads in full.
           */}
          <colgroup>
            <col style={{ width: "13%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "41%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "13%" }} />
          </colgroup>
          <thead>
            <tr>
              <th className={head} colSpan={4}>
                Requisition
              </th>
              <th className={head} colSpan={2}>
                Issuance
              </th>
            </tr>
            <tr>
              <th className={head}>Stock No.</th>
              <th className={head}>Unit</th>
              <th className={head}>Description</th>
              <th className={head}>Quantity</th>
              <th className={head}>Quantity</th>
              <th className={head}>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {ris.items.map((it, i) => (
              <tr key={i}>
                <td className={cell}>{it.stockNo ?? ""}</td>
                <td className={cell}>{it.unit}</td>
                <td className={cell}>{it.name}</td>
                <td className={`${cell} text-right`}>{qty(it.requestedQty)}</td>
                <td className={`${cell} text-right`}>{qty(it.issuedQty)}</td>
                <td className={cell} />
              </tr>
            ))}
            {Array.from({ length: blanks }).map((_, i) => (
              <tr key={`blank-${i}`}>
                {Array.from({ length: 6 }).map((__, j) => (
                  <td key={j} className={cell}>
                    &nbsp;
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Purpose is a row of the same box (30 Oct 2026): ruled at both sides, joining the table above and the signatures below. */}
        <p className="-mt-px border border-black px-2 py-1.5 text-[12.5px]">
          <span className="font-bold">Purpose:</span> {ris.purpose || ""}
        </p>

        {/* Signed on the printed copy, so every cell is left blank */}
        <table className="-mt-px w-full table-fixed border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className={head} style={{ width: "20%" }} />
              <th className={head}>Requested by:</th>
              <th className={head}>Approved by:</th>
              <th className={head}>Issued by:</th>
              <th className={head}>Received by:</th>
            </tr>
          </thead>
          <tbody>
            {["Signature", "Printed Name", "Designation", "Date"].map((label) => (
              <tr key={label}>
                <td className={`${cell} font-bold`}>{label} :</td>
                <td className={cell}>&nbsp;</td>
                <td className={cell}>&nbsp;</td>
                <td className={cell}>&nbsp;</td>
                <td className={cell}>&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** One printed slip. */
export function RISPrintSheet({ ris }: { ris: RequestForIssuance }) {
  return (
    <PrintSheet>
      <RISDocument ris={ris} />
    </PrintSheet>
  );
}

/**
 * Several slips in one print job (printed from the list, 30 Oct 2026), each
 * starting on a new sheet; nothing of the list itself is printed.
 */
export function RISPrintSheets({ slips }: { slips: RequestForIssuance[] }) {
  return (
    <PrintSheet>
      {slips.map((ris, i) => (
        <div
          key={ris.id}
          data-ris-document={ris.risNumber}
          style={i > 0 ? { breakBefore: "page", pageBreakBefore: "always" } : undefined}
        >
          <RISDocument ris={ris} />
        </div>
      ))}
    </PrintSheet>
  );
}
