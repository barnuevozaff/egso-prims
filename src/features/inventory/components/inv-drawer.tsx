import * as React from "react";
import { FileDown, Pencil, Printer } from "lucide-react";

import {
  Button,
  Drawer,
  DrawerActions,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Skeleton,
  SkeletonText,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from "@/components";
import {
  addInventoryComment,
  removeInventoryAttachment,
} from "@/features/inventory/api";
import { useInventoryItem, useStockCard } from "@/features/inventory/hooks";
import { stockStatusOf } from "@/features/inventory/types";
import { listPurchaseOrders } from "@/features/purchase-orders/api";
import type { PurchaseOrder } from "@/features/purchase-orders/types";
import { AttachmentList } from "@/features/shared/attachment-list";
import { CommentThread } from "@/features/shared/comment-thread";
import { HistoryFeed } from "@/features/shared/history-feed";
import { InvOverview } from "@/features/inventory/components/inv-overview";
import { StockCardTable } from "@/features/inventory/components/inv-stock-card";
import { supplierById } from "@/features/purchase-orders/types";
import { reportLoadFailure } from "@/features/shared/load-guard";
import { useAuth } from "@/features/auth/auth-context";

/** Right slide-over: item overview + stock card + attachments/comments/history. */
export function InvDrawer({
  itemId,
  open,
  onOpenChange,
  onChanged,
  onEdit,
}: {
  itemId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
  onEdit?: (itemId: string) => void;
}) {
  const { user } = useAuth();
  const { data: item, loading, setData } = useInventoryItem(open ? itemId : null);
  const stockCard = useStockCard(open ? itemId : null);
  const [deliveries, setDeliveries] = React.useState<PurchaseOrder[]>([]);

  React.useEffect(() => {
    if (!item) {
      setDeliveries([]);
      return;
    }
    // Inventory still references the supplier register; orders are matched on
    // the name, which is what a purchase order now records.
    void listPurchaseOrders({ supplierName: supplierById(item.supplierId)?.name })
      .then((pos) =>
        setDeliveries(pos.filter((po) => ["Released", "Completed"].includes(po.status))),
      )
      .catch((e) => reportLoadFailure(e, "this item's deliveries"));
  }, [item?.supplierId, item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Drawer open={open} onOpenChange={onOpenChange} size="2xl">
      {loading || !item ? (
        <div className="p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-2 h-3 w-56" />
          <SkeletonText lines={6} className="mt-6" />
        </div>
      ) : (
        <>
          <DrawerHeader
            title={item.name}
            description={`${item.itemCode} · ${item.category}`}
            onClose={() => onOpenChange(false)}
          >
            <div className="mt-2">
              <StatusBadge status={stockStatusOf(item)} />
            </div>
          </DrawerHeader>
          <DrawerBody>
            <div className="space-y-5">
              <InvOverview
                item={item}
                recentDeliveries={deliveries}
                recentMovements={stockCard.data.slice(0, 4)}
              />

              <Tabs defaultValue="stock-card">
                <TabsList className="w-full justify-start bg-neutral-100">
                  <TabsTrigger value="stock-card" className="text-[12.5px]">
                    Stock Card
                  </TabsTrigger>
                  <TabsTrigger value="attachments" className="text-[12.5px]">
                    Attachments ({item.attachments.length})
                  </TabsTrigger>
                  <TabsTrigger value="comments" className="text-[12.5px]">
                    Comments ({item.comments.length})
                  </TabsTrigger>
                  <TabsTrigger value="history" className="text-[12.5px]">
                    History
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="stock-card" className="pt-3">
                  <StockCardTable entries={stockCard.data} loading={stockCard.loading} />
                </TabsContent>
                <TabsContent value="attachments" className="pt-3">
                  <AttachmentList
                    attachments={item.attachments}
                    onDelete={async (a) => {
                      const updated = await removeInventoryAttachment(item.id, a.id);
                      setData(updated);
                      onChanged?.();
                    }}
                  />
                </TabsContent>
                <TabsContent value="comments" className="pt-3">
                  <CommentThread
                    comments={item.comments}
                    onSubmit={async (text) => {
                      const updated = await addInventoryComment(item.id, {
                        author: user?.name ?? "Staff",
                        office: user?.office ?? "General Services Office",
                        text,
                      });
                      setData(updated);
                    }}
                  />
                </TabsContent>
                <TabsContent value="history" className="pt-3">
                  <HistoryFeed entries={item.history} />
                </TabsContent>
              </Tabs>
            </div>
          </DrawerBody>
          <DrawerFooter>
            <DrawerActions>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button
                variant="secondary"
                onClick={() => toast.success(`Exporting ${item.itemCode} stock card as PDF`)}
              >
                <FileDown />
                Export PDF
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  toast.info(`Preparing ${item.itemCode} for printing`);
                  window.print();
                }}
              >
                <Printer />
                Print
              </Button>
              <Button onClick={() => onEdit?.(item.id)}>
                <Pencil />
                Edit
              </Button>
            </DrawerActions>
          </DrawerFooter>
        </>
      )}
    </Drawer>
  );
}
