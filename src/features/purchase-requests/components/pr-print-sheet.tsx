import { MunicipalLetterhead, PrintSheet, printAmount, printDate } from "@/features/shared/procurement-print-form";
import {
  useCurrentSignatories,
  type CurrentSignatories,
} from "@/features/purchase-requests/components/use-current-signatories";
import {
  capitalizeFirstLetter,
  type PRSignatory,
  type PurchaseRequest,
} from "@/features/purchase-requests/types";

/**
 * The official Municipality of Alaminos Purchase Request (21 Oct 2026), laid
 * out after the office's Excel template (screenshots, sheet "PR Other
 * Supplies 1Q"): LGU and Fund; Department, PR No. and Date; Section and FPP;
 * the six-column item table with its group headings; the grand total; the
 * Purpose line; and the Requested by / Cash Availability / Approved by block
 * with Signature, Printed Name and Designation rows.
 *
 * Provisional, pending the office's confirmation: the seal letterhead above
 * the title (the template sheet shows only the title), the A4 page, and the
 * official number's prefix. The system tracking reference is printed small
 * at the foot, for lookup only.
 *
 * Signatories: an approved request prints the names it was approved with;
 * before approval the sheet is a draft and previews the current Settings.
 */

/** Ruled lines kept on a short request, so it still reads like the paper form. */
const MIN_LINES = 8;

const qty = (n: number) => n.toLocaleString("en-PH", { maximumFractionDigits: 2 });
const upper = (s: string | undefined) => (s ?? "").toLocaleUpperCase("en-PH");

type Line =
  | { kind: "heading"; text: string }
  | { kind: "item"; no: number; unit: string; description: string; quantity: number; unitCost: number };

/** Items in their order, with each heading placed above the item it belongs to. */
function lines(pr: PurchaseRequest): Line[] {
  const headings = [...(pr.headings ?? [])].sort((a, b) => a.position - b.position);
  const out: Line[] = [];
  pr.items.forEach((it, i) => {
    for (const h of headings) if (h.position === i) out.push({ kind: "heading", text: h.text });
    out.push({
      kind: "item",
      no: i + 1,
      unit: it.unit,
      description: capitalizeFirstLetter(it.description),
      quantity: it.quantity,
      unitCost: it.estimatedCost,
    });
  });
  return out;
}

const cell = "border border-black px-1.5 py-[3px] align-top";

/**
 * A label and its writing line (30 Oct 2026): the value is printed on the
 * line, and a blank keeps the line, to the cell's edge, for handwriting.
 */
function Field({ label, value }: { label: string; value?: string }) {
  return (
    <span className="flex min-w-0 items-baseline gap-1 font-bold">
      <span className="shrink-0">{label}</span>
      <span className="min-w-[48px] flex-1 break-words border-b border-black">{value?.trim() || " "}</span>
    </span>
  );
}

function SignatoryCells({ who }: { who: PRSignatory | null }) {
  return who ? (
    <>
      {/* Exactly as set: the PR template reads "Hon. ERICSON R. LOPEZ". */}
      <div className="font-bold">{who.name}</div>
      <div>{who.designation}</div>
    </>
  ) : (
    // Not configured: nothing is invented. Approval is refused until it is set.
    <div className="italic text-neutral-600">(not yet configured)</div>
  );
}

/** One printed Purchase Request. */
export function PRPrintSheet({ pr }: { pr: PurchaseRequest }) {
  const current = useCurrentSignatories();
  return (
    <PrintSheet>
      <PRDocument pr={pr} current={current} />
    </PrintSheet>
  );
}

/**
 * Several Purchase Requests in one print job (printed from the list, 21 Oct
 * 2026). Each starts on a new sheet; nothing of the list itself is printed.
 * The caller reads the signatories, so it can wait for them before printing.
 */
export function PRPrintSheets({ prs, current }: { prs: PurchaseRequest[]; current: CurrentSignatories }) {
  return (
    <PrintSheet>
      {prs.map((pr, i) => (
        <div
          key={pr.id}
          data-pr-document={pr.prNumber}
          style={i > 0 ? { breakBefore: "page", pageBreakBefore: "always" } : undefined}
        >
          <PRDocument pr={pr} current={current} />
        </div>
      ))}
    </PrintSheet>
  );
}

function PRDocument({ pr, current }: { pr: PurchaseRequest; current: CurrentSignatories }) {
  const approved = !!pr.signatories;
  const closedMark = pr.status === "Cancelled" ? "VOIDED" : pr.status === "Rejected" ? "REJECTED" : null;
  const closedOn = closedMark ? pr.approvals.findLast((a) => a.step === pr.status)?.at : undefined;
  const signatories = pr.signatories ?? {
    // The General Services Officer, whoever filed the request.
    requestedBy: current.requestedBy,
    cashAvailability: current.cash,
    approvedBy: current.approved,
  };

  const rows = lines(pr);
  const grand = pr.items.reduce((s, it) => s + it.quantity * it.estimatedCost, 0);
  const blanks = Math.max(0, MIN_LINES - rows.length);

  return (
    <div className="font-['Tahoma','Arial',sans-serif] text-[11.5px] leading-[1.35] text-black">
      {/* Letterhead — provisional (see above); shared with the PO and the RIS. */}
      <MunicipalLetterhead />
      <div className="mb-2 mt-2 text-center text-[17px] font-bold tracking-[0.02em]">PURCHASE REQUEST</div>
      {/* A voided or rejected request printed for the file must not pass for a valid one. */}
      {closedMark && (
        <div className="-mt-1 mb-2 text-center text-[13px] font-bold tracking-[0.08em]">
          {closedMark}
          {closedOn ? ` ${printDate(closedOn)}` : ""}
        </div>
      )}

      {/* Header block, as on the template: three ruled rows. */}
      <table className="w-full table-fixed border-collapse">
        <colgroup>
          <col style={{ width: "34%" }} />
          <col style={{ width: "40%" }} />
          <col style={{ width: "26%" }} />
        </colgroup>
        <tbody>
          <tr>
            <td colSpan={2} className={cell}>
              <Field label="LGU:" value="Municipality of Alaminos" />
            </td>
            <td className={cell}>
              <Field label="Fund:" value={pr.fundingSource} />
            </td>
          </tr>
          <tr>
            <td className={cell}>
              <Field label="Department :" value={upper(pr.departmentCode)} />
            </td>
            <td className={cell}>
              <Field label="PR No.:" value={pr.officialPrNumber} />
            </td>
            <td className={cell}>
              <Field label="Date:" value={printDate(pr.requestDate)} />
            </td>
          </tr>
          <tr>
            <td className={cell}>
              <Field label="Section:" value={pr.section} />
            </td>
            <td colSpan={2} className={cell}>
              <Field label="FPP :" value={pr.fpp} />
            </td>
          </tr>
        </tbody>
      </table>

      {/* Item table. The column heads repeat on every page; a line never splits. */}
      <table className="-mt-px w-full table-fixed border-collapse">
        <colgroup>
          <col style={{ width: "10%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "44%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "13%" }} />
          <col style={{ width: "15%" }} />
        </colgroup>
        <thead>
          <tr>
            {["Item No.", "Unit", "Item Description", "Quantity", "Unit Cost", "Total Cost"].map((h) => (
              <th key={h} className={`${cell} whitespace-nowrap py-1.5 text-center text-[12px] font-bold`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) =>
            r.kind === "heading" ? (
              <tr key={`h-${i}`} className="break-inside-avoid">
                <td className={cell} />
                <td className={cell} />
                <td className={`${cell} font-bold`}>{r.text}</td>
                <td className={cell} />
                <td className={cell} />
                <td className={cell} />
              </tr>
            ) : (
              <tr key={`i-${r.no}`} className="break-inside-avoid">
                <td className={`${cell} text-center tabular-nums`}>{r.no}</td>
                <td className={`${cell} text-center`}>{r.unit}</td>
                <td className={`${cell} break-words`}>{r.description}</td>
                <td className={`${cell} text-center tabular-nums`}>{qty(r.quantity)}</td>
                <td className={`${cell} text-right tabular-nums`}>{printAmount(r.unitCost)}</td>
                <td className={`${cell} text-right tabular-nums`}>{printAmount(r.quantity * r.unitCost)}</td>
              </tr>
            ),
          )}
          {Array.from({ length: blanks }).map((_, i) => (
            <tr key={`b-${i}`}>
              {Array.from({ length: 6 }).map((__, c) => (
                <td key={c} className={cell}>
                  &nbsp;
                </td>
              ))}
            </tr>
          ))}
          <tr className="break-inside-avoid">
            <td colSpan={5} className={cell} />
            <td className={`${cell} text-right text-[13px] font-bold tabular-nums`}>{printAmount(grand)}</td>
          </tr>
        </tbody>
      </table>

      {/* Purpose and signatures stay together on the last page. */}
      <div className="break-inside-avoid">
        <table className="-mt-px w-full table-fixed border-collapse">
          <tbody>
            <tr>
              <td className={`${cell} py-1.5`}>
                <span className="font-bold">Purpose:</span>{" "}
                {pr.purpose.trim() || <span className="inline-block h-[12px] w-[60%] border-b border-black align-bottom" />}
              </td>
            </tr>
          </tbody>
        </table>
        <table className="-mt-px w-full table-fixed border-collapse">
          <colgroup>
            <col style={{ width: "13%" }} />
            <col style={{ width: "33%" }} />
            <col style={{ width: "26%" }} />
            <col style={{ width: "28%" }} />
          </colgroup>
          <tbody>
            <tr>
              <td className="border-l border-t border-black px-1.5 py-1" />
              {["Requested by:", "Cash Availability:", "Approved by:"].map((h) => (
                <td key={h} className="border-r border-t border-black px-1.5 py-1 text-center text-[12px]">
                  {h}
                </td>
              ))}
            </tr>
            <tr>
              <td className="border-l border-black px-1.5 pt-3 align-top">Signature :</td>
              {[0, 1, 2].map((i) => (
                <td key={i} className="border-r border-black px-3 pb-1 pt-8">
                  <div className="border-b border-black" />
                </td>
              ))}
            </tr>
            <tr>
              <td className="border-b border-l border-black px-1.5 pb-1.5 align-top">
                <div>Printed Name :</div>
                <div>Designation :</div>
              </td>
              {[signatories.requestedBy, signatories.cashAvailability, signatories.approvedBy].map((who, i) => (
                <td key={i} className="border-b border-r border-black px-1.5 pb-1.5 text-center align-top text-[12px]">
                  <SignatoryCells who={who} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>

        {/* For lookup in GSO PRIMS; not part of the official form. */}
        <div className="mt-2 flex justify-between gap-4 text-[9.5px] text-neutral-700">
          <span>
            GSO PRIMS reference {pr.prNumber} · filed {printDate(pr.requestDate)} by {pr.requester}
          </span>
          <span>
            {closedMark
              ? `${closedMark} — not a valid request`
              : approved
                ? `Approved${pr.officialPrNumberAssignedAt ? ` ${printDate(pr.officialPrNumberAssignedAt)}` : ""}`
                : "DRAFT — not yet approved; signatories shown from current Settings"}
          </span>
        </div>
      </div>
    </div>
  );
}
