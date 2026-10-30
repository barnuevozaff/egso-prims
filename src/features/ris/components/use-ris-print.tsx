import * as React from "react";

import { toast } from "@/components";
import type { RequestForIssuance } from "@/features/ris/types";
import { RISPrintSheets } from "@/features/shared/procurement-sheets";

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The tab title while printing: Chrome offers it as the PDF's file name. */
const printTitle = (slips: RequestForIssuance[]) =>
  slips.length === 1 ? `Requisition and Issue Slip ${slips[0].risNumber}` : `Requisition and Issue Slips (${slips.length})`;

/**
 * Prints official Requisition and Issue Slips from the list (30 Oct 2026),
 * never the screen: only the slips are mounted — each starting on a new
 * sheet — and one print dialog opens once they are ready. They go when Chrome
 * reports the dialog closed. The same pattern as usePOPrint.
 */
export function useRISPrint() {
  const [batch, setBatch] = React.useState<RequestForIssuance[] | null>(null);

  React.useEffect(() => {
    if (!batch) return;
    const title = document.title;
    const done = () => setBatch(null);
    window.addEventListener("afterprint", done);
    return () => {
      window.removeEventListener("afterprint", done);
      document.title = title;
    };
  }, [batch]);

  const printed = React.useRef<RequestForIssuance[] | null>(null);
  React.useEffect(() => {
    if (!batch || printed.current === batch) return;
    printed.current = batch;
    let cancelled = false;
    let started = false;
    void (async () => {
      for (let i = 0; i < 60 && !document.querySelector("body > [data-print-form]"); i++) await frame();
      const images = Array.from(document.querySelectorAll<HTMLImageElement>("body > [data-print-form] img"));
      await Promise.race([Promise.all(images.map((img) => img.decode().catch(() => undefined))), wait(3000)]);
      if (cancelled) return;
      started = true;
      document.title = printTitle(batch);
      window.print();
    })();
    return () => {
      cancelled = true;
      if (!started) printed.current = null;
    };
  }, [batch]);

  const print = React.useCallback((slips: RequestForIssuance[]) => {
    if (slips.length === 0) return;
    toast.info(
      slips.length === 1
        ? `Opening ${slips[0].risNumber} for printing`
        : `Printing ${slips.length} slips, each on its own page`,
    );
    setBatch([...slips]);
  }, []);

  return { print, sheet: batch ? <RISPrintSheets slips={batch} /> : null };
}
