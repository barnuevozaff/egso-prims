import * as React from "react";

/**
 * A document shown on screen at the size it comes out of the printer.
 *
 * The records forms are recreations of National Archives paper, and the office
 * is accountable for the paper. Summarising one into cards and revealing the
 * form itself only in the print dialog put a step between the clerk and the
 * document they are answerable for; this puts the sheet on the page.
 *
 * The dimensions are the real ones — A4 is 210mm x 297mm and the padding is
 * the margin the printed @page uses — so the screen is at the same scale as
 * the paper. CSS millimetres are physical units, so the browser does that
 * conversion itself and no scaling factor has to be maintained here.
 *
 * It never prints. Printing is still done by the portalled [data-print-form],
 * which is what escapes the app's fixed-height frame; this copy carries
 * data-print-hide so a page holding both puts only one of them on paper.
 */
export function PaperSheet({
  orientation = "portrait",
  fit = false,
  children,
}: {
  /** Landscape for the twenty-column Records Inventory and Appraisal. */
  orientation?: "portrait" | "landscape";
  /**
   * For a form being filled in (30 Oct 2026): the sheet is as tall as what is
   * on it, not a whole blank page, and sits at the start of its column so the
   * panel beside it stays close. The printed copy is unaffected.
   */
  fit?: boolean;
  children: React.ReactNode;
}) {
  const landscape = orientation === "landscape";
  return (
    // A sheet is a fixed physical width and does not reflow, so a narrow
    // window scrolls to it rather than squeezing it out of true.
    <div className="overflow-x-auto pb-1">
      <div
        data-print-hide=""
        className={`${fit ? "" : "mx-auto "}bg-white text-black shadow-sm ring-1 ring-neutral-300`}
        style={{
          width: landscape ? "297mm" : "210mm",
          minHeight: fit ? undefined : landscape ? "210mm" : "297mm",
          padding: landscape ? "10mm" : "14mm",
        }}
      >
        {children}
      </div>
    </div>
  );
}
