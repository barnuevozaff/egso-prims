import { PrintSheet, printDate } from "@/features/shared/procurement-print-form";
import type { InventoryItem, StockCardEntry } from "@/features/inventory/types";

/**
 * The official Stock Card, Appendix 53 (24 Oct 2026), laid out after the
 * municipality's Excel template: the Appendix label, STOCK CARD, LGU and
 * Fund; Item / Stock No., Description / Re-order Point and Unit of
 * Measurement; the movement table (Date, Reference, Receipt Qty., Issue Qty.
 * and Office, Balance Qty., No. of Days to Consume); and the "For Property
 * Office Use" box. Nothing is added to the form.
 *
 * Filled from what the system records: the LGU, the item's name, code and
 * unit, and each stock-card line in date order with its own reference,
 * quantity and the balance saved with it. Fund, Description, Re-order Point
 * and No. of Days to Consume are not recorded, so they print blank for
 * handwriting. Printing writes nothing.
 *
 * Portalled to <body> by PrintSheet, so only this document prints and it
 * runs onto further pages, repeating the table's column headings.
 */

const LGU = "Municipality of Alaminos, Laguna";
/**
 * Ruled lines on the first sheet. The template has 30 (rows 13-42); 28 keep
 * the whole form, footer included, on one A4 page with the margins this
 * system prints with. Longer histories continue on further pages.
 */
const MIN_LINES = 28;

/** The template's columns A-G, with Reference a little wider so a document number fits on one line. */
const COLS = ["12%", "16%", "11%", "11%", "20%", "11.5%", "18.5%"];
const cell = "border border-black px-1.5 align-middle";
const qty = (n: number) => n.toLocaleString("en-PH", { maximumFractionDigits: 2 });

/** A label with its value written on the line, or the line left for handwriting. */
function Blank({ value, width }: { value?: string; width: string }) {
  return (
    <span className="inline-block border-b border-black px-1 align-bottom leading-[1.15]" style={{ minWidth: width }}>
      {value ?? " "}
    </span>
  );
}

export function StockCardSheet({
  item,
  entries,
  offices = {},
}: {
  item: InventoryItem;
  /** The item's stock-card lines, any order; printed oldest first. */
  entries: StockCardEntry[];
  /** Requesting office per RIS number, for issue lines saved before the office was recorded. */
  offices?: Record<string, string>;
}) {
  const lines = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const blanks = Math.max(0, MIN_LINES - lines.length);

  return (
    <PrintSheet>
      <div className="mx-auto w-full max-w-[190mm] border-[1.5px] border-black font-['Times_New_Roman',Times,serif] text-[12px] leading-[1.25] text-black">
        <div className="flex h-[38px] items-start justify-end border-b-[1.5px] border-black px-1.5 pt-1 italic">Appendix 53</div>

        <div className="pb-2 pt-5 text-center text-[15px] font-bold tracking-[0.02em]">STOCK CARD</div>

        <div className="flex items-end justify-between gap-6 px-1.5 pb-1.5 pt-3">
          <span className="font-bold">
            LGU: <Blank value={LGU} width="62mm" />
          </span>
          <span className="font-bold">
            Fund : <Blank width="38mm" />
          </span>
        </div>

        {/* Item block */}
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col style={{ width: "71%" }} />
            <col style={{ width: "29%" }} />
          </colgroup>
          <tbody>
            <tr className="h-[27px]">
              <td className={`${cell} border-l-0 font-bold`}>
                Item : <span className="font-normal">{item.name}</span>
              </td>
              <td className={`${cell} border-r-0 font-bold`}>
                Stock No. : <span className="font-normal">{item.itemCode}</span>
              </td>
            </tr>
            <tr className="h-[27px]">
              <td className={`${cell} border-l-0 font-bold`}>Description :</td>
              <td className={`${cell} border-r-0 font-bold`}>Re-order Point :</td>
            </tr>
            <tr className="h-[27px]">
              <td className={`${cell} border-l-0 font-bold`}>
                Unit of Measurement : <span className="font-normal">{item.unit}</span>
              </td>
              <td className={`${cell} border-r-0`} />
            </tr>
          </tbody>
        </table>

        {/* Movements. The two heading rows repeat on every printed page. */}
        <table className="-mt-px w-full table-fixed border-collapse">
          <colgroup>
            {COLS.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} className={`${cell} border-l-0 font-bold`}>Date</th>
              <th rowSpan={2} className={`${cell} font-bold`}>Reference</th>
              <th className={`${cell} font-bold italic`}>Receipt</th>
              <th colSpan={2} className={`${cell} font-bold italic`}>Issue</th>
              <th className={`${cell} font-bold italic`}>Balance</th>
              <th rowSpan={2} className={`${cell} border-r-0 font-bold leading-[1.15]`}>
                No. of Days to
                <br />
                Consume
              </th>
            </tr>
            <tr>
              <th className={`${cell} font-bold`}>Qty.</th>
              <th className={`${cell} font-bold`}>Qty.</th>
              <th className={`${cell} font-bold`}>Office</th>
              <th className={`${cell} font-bold`}>Qty.</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((e) => (
              <tr key={e.id} className="h-[24px] break-inside-avoid">
                <td className={`${cell} border-l-0 text-center tabular-nums`}>{printDate(e.date)}</td>
                <td className={`${cell} whitespace-nowrap text-center text-[11.5px]`}>{e.documentNumber}</td>
                <td className={`${cell} text-center tabular-nums`}>{e.quantityIn > 0 ? qty(e.quantityIn) : ""}</td>
                <td className={`${cell} text-center tabular-nums`}>{e.quantityOut > 0 ? qty(e.quantityOut) : ""}</td>
                <td className={`${cell} text-center`}>
                  {e.quantityOut > 0 ? (e.office ?? offices[e.documentNumber] ?? "") : ""}
                </td>
                <td className={`${cell} text-center tabular-nums`}>{qty(e.balance)}</td>
                <td className={`${cell} border-r-0`} />
              </tr>
            ))}
            {Array.from({ length: blanks }).map((_, i) => (
              <tr key={`blank-${i}`} className="h-[24px]">
                {COLS.map((__, c) => (
                  <td key={c} className={`${cell} ${c === 0 ? "border-l-0" : ""} ${c === COLS.length - 1 ? "border-r-0" : ""}`}>
                    &nbsp;
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="-mt-px h-[62px] break-inside-avoid border-t-[1.5px] border-black px-5 pt-1 italic">For Property Office Use</div>
      </div>
    </PrintSheet>
  );
}
