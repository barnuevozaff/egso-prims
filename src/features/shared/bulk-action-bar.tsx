import { Ban, Download, Printer, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { Button } from "@/components";

/** Floating action bar shown while table rows are selected (shared across modules). */
export function BulkActionBar({
  count,
  onDelete,
  onVoid,
  onExport,
  onPrint,
  onClear,
}: {
  count: number;
  /** Omitted where records may not be deleted, such as the audit trail. */
  onDelete?: () => void;
  /**
   * Offered instead of Delete for numbered official documents: voiding keeps
   * the number, the record and its history.
   */
  onVoid?: () => void;
  onExport: () => void;
  onPrint: () => void;
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
          <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 shadow-lg">
            <span className="px-1 text-[12.5px] font-medium text-neutral-800">
              {count} selected
            </span>
            <span className="h-5 w-px bg-neutral-200" />
            <Button variant="ghost" onClick={onExport}>
              <Download />
              Export
            </Button>
            <Button variant="ghost" onClick={onPrint}>
              <Printer />
              Print
            </Button>
            {/* A shade darker than the variant's default: this one carries a
                word, not just an icon, so it sits at red-600. */}
            {onVoid && (
              <Button
                variant="danger"
                className="text-red-600 hover:text-red-700"
                onClick={onVoid}
              >
                <Ban />
                Void
              </Button>
            )}
            {onDelete && (
              <Button
                variant="danger"
                className="text-red-600 hover:text-red-700"
                onClick={onDelete}
              >
                <Trash2 />
                Delete
              </Button>
            )}
            <span className="h-5 w-px bg-neutral-200" />
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
