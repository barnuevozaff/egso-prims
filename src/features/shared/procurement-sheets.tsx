import { PrintSheet, printDate } from "@/features/shared/procurement-print-form";
import { BRAND_LOGO } from "@/lib/brand";
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

/** Bold label followed by its value, as the paper order sets its meta lines. */
function Meta({ label, value }: { label: string; value?: string }) {
  return (
    <div className="text-[12.5px] leading-[1.45]">
      <span className="font-bold">{label}:</span> {value || "-"}
    </div>
  );
}

/**
 * The Purchase Order has its own sheet after the office's workbook
 * (21 Oct 2026): features/purchase-orders/components/po-print-sheet.tsx.
 */
export { POPrintSheet } from "@/features/purchase-orders/components/po-print-sheet";

/**
 * The Municipality of Alaminos requisition and issue slip. The table is split
 * into what was requisitioned and what was actually issued, and the signature
 * block is left blank to be signed on the printed copy.
 */
export function RISPrintSheet({ ris }: { ris: RequestForIssuance }) {
  // Blank lines carry the ruled grid down the sheet, as the paper form does.
  const GRID_LINES = 12;
  const blanks = Math.max(0, GRID_LINES - ris.items.length);
  const cell = "border border-black px-2 py-1 align-top";
  const head = `${cell} bg-[#efefef] text-center text-[11.5px] font-bold`;

  return (
    <PrintSheet>
      {/* Letterhead */}
      <div className="text-center">
        <img
          src={BRAND_LOGO}
          alt="Municipality of Alaminos seal"
          className="mx-auto h-[62px] w-[62px] object-contain"
        />
        <div className="mt-1.5 text-[13px] leading-[1.45]">Republic of the Philippines</div>
        <div className="text-[15px] font-bold leading-[1.45]">MUNICIPALITY OF ALAMINOS</div>
        <div className="text-[13px] leading-[1.45]">Province of Laguna</div>
        <div className="text-[13px] font-bold leading-[1.45]">GENERAL SERVICES OFFICE (GSO)</div>
        <div className="mt-1 text-[17px] font-bold tracking-tight">REQUISITION AND ISSUE SLIP</div>
      </div>

      {/* Slip references */}
      <div className="mt-4 grid grid-cols-2 gap-x-8">
        <div>
          <Meta label="LGU" value="Municipality of Alaminos" />
          <Meta label="Division" value={ris.division} />
          <Meta label="Office" value={departmentByCode(ris.departmentCode).name} />
        </div>
        <div>
          <Meta label="Fund" value={ris.fund} />
          <Meta label="FPP Code" value={ris.fppCode} />
          <Meta label="RIS No." value={ris.risNumber} />
          <Meta label="Date" value={printDate(ris.issueDate)} />
        </div>
      </div>

      {/* Requisitioned against issued */}
      <table className="mt-4 w-full table-fixed border-collapse text-[12.5px]">
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

      <p className="mt-3 text-[12.5px]">
        <span className="font-bold">Purpose:</span> {ris.purpose || ""}
      </p>

      {/* Signed on the printed copy, so every cell is left blank */}
      <table className="mt-4 w-full table-fixed border-collapse text-[12.5px]">
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
    </PrintSheet>
  );
}
