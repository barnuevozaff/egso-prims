import { PageHeader, PageTransition } from "@/components";
import { InvImport } from "@/features/inventory/components/inv-import/inv-import";

/** Scan / Import Inventory Items: read a document, review its rows, confirm (22 Oct 2026). */
export function InventoryImportPage() {
  return (
    <PageTransition className="space-y-4">
      <PageHeader
        title="Scan / Import Inventory Items"
        description="Read a stock list, scan or PDF, review the items it lists, and save the ones you confirm."
      />
      <InvImport />
    </PageTransition>
  );
}
