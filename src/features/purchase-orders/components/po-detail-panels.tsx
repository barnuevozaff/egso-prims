import { SectionTitle } from "@/components";
import { buildPOTimeline } from "@/features/purchase-orders/lib";
import type { PurchaseOrder } from "@/features/purchase-orders/types";
import { POOverview } from "@/features/purchase-orders/components/po-overview";
import { PRItemsTable } from "@/features/purchase-requests/components/pr-items-table";
import { ClosedNotice, RecordHistory } from "@/features/shared/record-history";

/** Full PO body: overview, ordered items, and — folded away — its history. */
export function PODetailPanels({ po }: { po: PurchaseOrder }) {
  return (
    <div className="space-y-5">
      <POOverview po={po} />
      <ClosedNotice status={po.status} approvals={po.approvals} />

      <section>
        <SectionTitle as="h3" className="mb-2">
          Items Ordered
        </SectionTitle>
        <PRItemsTable
          costHeader="Unit Cost"
          items={po.items.map((it) => ({
            id: it.id,
            description: it.description,
            quantity: it.quantity,
            unit: it.unit,
            estimatedCost: it.unitCost,
          }))}
        />
      </section>

      <RecordHistory steps={buildPOTimeline(po)} changes={po.history} updatedAt={po.updatedAt} />
    </div>
  );
}
