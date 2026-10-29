import { Ban, Download, Printer, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { Button } from "@/components";

/** Floating action bar shown while table rows are selected (shared across modules). */
export function BulkActionBar({
  count,
  onDelete,
  deleteLabel = "Delete",
  onVoid,
  voidLabel = "Void",
  voidTone = "danger",
  onExport,
  onPrint,
  printLabel = "Print",
  onClear,
}: {
  count: number;
  /** Omitted where records may not be deleted, such as the audit trail. */
  onDelete?: () => void;
  deleteLabel?: string;
  /**
   * Offered instead of Delete for numbered official documents: voiding keeps
   * the number, the record and its history.
   */
  onVoid?: () => void;
  /** e.g. "Void request": the record's own word for it. */
  voidLabel?: string;
  /** "neutral" where red is kept for genuine deletion (Purchase requests). */
  voidTone?: "danger" | "neutral";
  /** Omitted where the page has no export (Purchase requests, 21 Oct 2026). */
  onExport?: () => void;
  /** Optional: a list whose records print one at a time leaves it out (Inventory, 24 Oct 2026). */
  onPrint?: () => void;
  printLabel?: string;
  onClear: () => void;
}) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2"
        >
          {/* On a phone the actions wrap onto a second line rather than run off the screen. */}
          <div className="flex w-max max-w-[calc(100vw-2rem)] flex-wrap items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 shadow-lg">
            <span className="whitespace-nowrap px-1 text-[12.5px] font-medium text-neutral-800">
              {count} selected
            </span>
            <span className="hidden h-5 w-px bg-neutral-200 sm:block" />
            {onExport && (
              <Button variant="ghost" onClick={onExport}>
                <Download />
                Export
              </Button>
            )}
            {onPrint && (
              <Button variant="ghost" onClick={onPrint}>
                <Printer />
                {printLabel}
              </Button>
            )}
            {/* A shade darker than the variant's default: this one carries a
                word, not just an icon, so it sits at red-600. */}
            {onVoid && (
              <Button
                variant={voidTone === "danger" ? "danger" : "ghost"}
                className={voidTone === "danger" ? "text-red-600 hover:text-red-700" : undefined}
                onClick={onVoid}
              >
                <Ban />
                {voidLabel}
              </Button>
            )}
            {onDelete && (
              <Button
                variant="danger"
                className="text-red-600 hover:text-red-700"
                onClick={onDelete}
              >
                <Trash2 />
                {deleteLabel}
              </Button>
            )}
            <span className="hidden h-5 w-px bg-neutral-200 sm:block" />
            <Button variant="ghost" onClick={onClear} aria-label="Cancel selection">
              <X />
              Cancel
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
