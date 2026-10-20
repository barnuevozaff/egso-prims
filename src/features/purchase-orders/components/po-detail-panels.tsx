import {
  ApprovalTimeline,
  CurrencyDisplay,
  SectionTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components";
import {
  addPurchaseOrderComment,
  removePurchaseOrderAttachment,
} from "@/features/purchase-orders/api";
import { buildPOTimeline } from "@/features/purchase-orders/lib";
import { poTotal, type PurchaseOrder } from "@/features/purchase-orders/types";
import { POOverview } from "@/features/purchase-orders/components/po-overview";
import { PRItemsTable } from "@/features/purchase-requests/components/pr-items-table";
import { AttachmentList } from "@/features/shared/attachment-list";
import { CommentThread } from "@/features/shared/comment-thread";
import { HistoryFeed } from "@/features/shared/history-feed";
import { useAuth } from "@/features/auth/auth-context";

/** Full PO body: overview, ordered items, financial summary, tabbed panels. */
export function PODetailPanels({
  po,
  onUpdated,
}: {
  po: PurchaseOrder;
  onUpdated: (po: PurchaseOrder) => void;
}) {
  const { user } = useAuth();
  const subtotal = poTotal(po);
  return (
    <div className="space-y-5">
      <POOverview po={po} />

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

      <section className="rounded-lg bg-neutral-50/60 p-3.5">
        <SectionTitle as="h3" className="mb-2 text-[12px]">
          Financial Summary
        </SectionTitle>
        <dl className="space-y-1.5 text-[12.5px]">
          <div className="flex items-center justify-between">
            <dt className="text-neutral-500">Subtotal ({po.items.length} items)</dt>
            <dd>
              <CurrencyDisplay amount={subtotal} muted />
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-neutral-500">Taxes &amp; charges</dt>
            <dd className="text-neutral-500">Included</dd>
          </div>
          <div className="flex items-center justify-between border-t border-neutral-200 pt-1.5">
            <dt className="font-medium text-neutral-900">Total Order Amount</dt>
            <dd>
              <CurrencyDisplay amount={subtotal} className="text-[14px] font-semibold" />
            </dd>
          </div>
        </dl>
      </section>

      <Tabs defaultValue="timeline">
        <TabsList className="w-full justify-start bg-neutral-100">
          <TabsTrigger value="timeline" className="text-[12.5px]">
            Timeline
          </TabsTrigger>
          <TabsTrigger value="attachments" className="text-[12.5px]">
            Attachments ({po.attachments.length})
          </TabsTrigger>
          <TabsTrigger value="comments" className="text-[12.5px]">
            Comments ({po.comments.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="text-[12.5px]">
            History
          </TabsTrigger>
        </TabsList>
        <TabsContent value="timeline" className="pt-3">
          <ApprovalTimeline steps={buildPOTimeline(po)} />
        </TabsContent>
        <TabsContent value="attachments" className="pt-3">
          <AttachmentList
            attachments={po.attachments}
            onDelete={async (a) => {
              onUpdated(await removePurchaseOrderAttachment(po.id, a.id));
            }}
          />
        </TabsContent>
        <TabsContent value="comments" className="pt-3">
          <CommentThread
            comments={po.comments}
            onSubmit={async (text) => {
              onUpdated(
                await addPurchaseOrderComment(po.id, {
                  author: user?.name ?? "Staff",
                  office: user?.office ?? "General Services Office",
                  text,
                }),
              );
            }}
          />
        </TabsContent>
        <TabsContent value="history" className="pt-3">
          <HistoryFeed entries={po.history} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
