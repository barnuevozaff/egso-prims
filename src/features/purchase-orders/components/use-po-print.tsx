import * as React from "react";

import { toast } from "@/components";
import { POPrintSheets } from "@/features/purchase-orders/components/po-print-sheet";
import { useCurrentPOSignatories } from "@/features/purchase-orders/components/use-po-signatories";
import type { PurchaseOrder } from "@/features/purchase-orders/types";

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The tab title while printing: Chrome offers it as the PDF's file name. */
const printTitle = (pos: PurchaseOrder[]) =>
  pos.length === 1 ? `Purchase Order ${pos[0].poNumber}` : `Purchase Orders (${pos.length})`;

/**
 * Prints official Purchase Orders from a list (21 Oct 2026), never the screen:
 * only the documents are mounted — each starting on a new sheet — and one
 * print dialog opens once Settings and the documents are ready. They go when
 * Chrome reports the dialog closed. The same pattern as usePRPrint.
 */
export function usePOPrint() {
  const [batch, setBatch] = React.useState<PurchaseOrder[] | null>(null);
  const current = useCurrentPOSignatories();
  const ready = !current.loading;

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

  const printed = React.useRef<PurchaseOrder[] | null>(null);
  React.useEffect(() => {
    if (!batch || !ready || printed.current === batch) return;
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
  }, [batch, ready]);

  const print = React.useCallback((pos: PurchaseOrder[]) => {
    if (pos.length === 0) return;
    toast.info(
      pos.length === 1
        ? `Opening ${pos[0].poNumber} for printing`
        : `Printing ${pos.length} purchase orders, each on its own pages`,
    );
    setBatch([...pos]);
  }, []);

  return { print, sheet: batch ? <POPrintSheets pos={batch} current={current} /> : null };
}
