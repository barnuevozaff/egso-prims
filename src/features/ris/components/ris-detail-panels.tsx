import {
  ApprovalTimeline,
  SectionTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components";
import { addRequestComment, removeRequestAttachment } from "@/features/ris/api";
import { buildRISTimeline } from "@/features/ris/lib";
import type { RequestForIssuance } from "@/features/ris/types";
import { RISItemsTable } from "@/features/ris/components/ris-items-table";
import { RISOverview } from "@/features/ris/components/ris-overview";
import { AttachmentList } from "@/features/shared/attachment-list";
import { CommentThread } from "@/features/shared/comment-thread";
import { HistoryFeed } from "@/features/shared/history-feed";
import { useAuth } from "@/features/auth/auth-context";

/** Full RIS body: overview, items issued, tabbed timeline/attachments/comments/history. */
export function RISDetailPanels({
  ris,
  onUpdated,
}: {
  ris: RequestForIssuance;
  onUpdated: (ris: RequestForIssuance) => void;
}) {
  const { user } = useAuth();
  return (
    <div className="space-y-5">
      <RISOverview ris={ris} />

      <section>
        <SectionTitle as="h3" className="mb-2">
          Items Issued
        </SectionTitle>
        <RISItemsTable items={ris.items} />
      </section>

      <Tabs defaultValue="timeline">
        <TabsList className="w-full justify-start bg-neutral-100">
          <TabsTrigger value="timeline" className="text-[12.5px]">
            Timeline
          </TabsTrigger>
          <TabsTrigger value="attachments" className="text-[12.5px]">
            Attachments ({ris.attachments.length})
          </TabsTrigger>
          <TabsTrigger value="comments" className="text-[12.5px]">
            Comments ({ris.comments.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="text-[12.5px]">
            History
          </TabsTrigger>
        </TabsList>
        <TabsContent value="timeline" className="pt-3">
          <ApprovalTimeline steps={buildRISTimeline(ris)} />
        </TabsContent>
        <TabsContent value="attachments" className="pt-3">
          <AttachmentList
            attachments={ris.attachments}
            onDelete={async (a) => {
              onUpdated(await removeRequestAttachment(ris.id, a.id));
            }}
          />
        </TabsContent>
        <TabsContent value="comments" className="pt-3">
          <CommentThread
            comments={ris.comments}
            onSubmit={async (text) => {
              onUpdated(
                await addRequestComment(ris.id, {
                  author: user?.name ?? "Staff",
                  office: user?.office ?? "General Services Office",
                  text,
                }),
              );
            }}
          />
        </TabsContent>
        <TabsContent value="history" className="pt-3">
          <HistoryFeed entries={ris.history} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
