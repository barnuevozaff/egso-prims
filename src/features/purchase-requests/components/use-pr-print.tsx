import * as React from "react";

import { toast } from "@/components";
import { PRPrintSheets } from "@/features/purchase-requests/components/pr-print-sheet";
import { useCurrentSignatories } from "@/features/purchase-requests/components/use-current-signatories";
import type { PurchaseRequest } from "@/features/purchase-requests/types";

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The tab title while printing: Chrome offers it as the PDF's file name. */
function printTitle(prs: PurchaseRequest[]): string {
  if (prs.length === 1) {
    const pr = prs[0];
    return `Purchase Request ${pr.officialPrNumber || pr.prNumber}`;
  }
  return `Purchase Requests (${prs.length})`;
}

/**
 * Prints official Purchase Request documents from a list (21 Oct 2026).
 *
 * `print(prs)` mounts only the documents — one per request, each starting on
 * a new sheet — and opens a single print dialog. While they are mounted the
 * print rules show nothing else, so the list, sidebar and filters never go on
 * paper. The documents stay mounted until Chrome reports the dialog closed
 * (afterprint), then go. Render `sheet` once in the page.
 */
export function usePRPrint() {
  const [batch, setBatch] = React.useState<PurchaseRequest[] | null>(null);
  // Read with the page, so the names are usually in before Print is pressed;
  // a draft printed before Settings answers would show no signatories.
  const current = useCurrentSignatories();
  const ready = !current.loading;

  // The documents go when the dialog closes; the tab title comes back.
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

  // One dialog per batch, once the documents, their seal and Settings are in.
  const printed = React.useRef<PurchaseRequest[] | null>(null);
  React.useEffect(() => {
    if (!batch || !ready || printed.current === batch) return;
    printed.current = batch;
    let cancelled = false;
    let started = false;

    void (async () => {
      // The sheet portals itself into <body> one render later.
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
      // Interrupted before the dialog opened (Settings reloading): try again when ready.
      if (!started) printed.current = null;
    };
  }, [batch, ready]);

  const print = React.useCallback((prs: PurchaseRequest[]) => {
    if (prs.length === 0) return;
    toast.info(
      prs.length === 1
        ? `Opening ${prs[0].officialPrNumber || prs[0].prNumber} for printing`
        : `Printing ${prs.length} purchase requests, each on its own pages`,
    );
    setBatch([...prs]);
  }, []);

  return { print, sheet: batch ? <PRPrintSheets prs={batch} current={current} /> : null };
}
