import { format } from "date-fns";
import { ChevronRight } from "lucide-react";

import {
  ApprovalTimeline,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type ApprovalTimelineStep,
} from "@/components";
import { HistoryFeed, type HistoryEntry } from "@/features/shared/history-feed";
import type { WorkflowRecord } from "@/features/shared/workflow-steps";

/**
 * A record's history, the same in every module (30 Oct 2026): Approval steps,
 * the workflow as recorded, and Changes, the record's own log. Comments,
 * attachments and a separate authorization list are not shown; whatever a
 * record already holds stays stored.
 */
export function HistoryTabs({ steps, changes }: { steps: ApprovalTimelineStep[]; changes: HistoryEntry[] }) {
  return (
    <Tabs defaultValue="steps">
      <TabsList className="bg-neutral-100 group-data-[orientation=horizontal]/tabs:h-auto">
        <TabsTrigger value="steps" className="min-h-11 px-3.5 text-[12.5px]">
          Approval steps
        </TabsTrigger>
        <TabsTrigger value="changes" className="min-h-11 px-3.5 text-[12.5px]">
          Changes
        </TabsTrigger>
      </TabsList>
      <TabsContent value="steps" className="pt-3">
        <ApprovalTimeline steps={steps} />
      </TabsContent>
      <TabsContent value="changes" className="pt-3">
        <HistoryFeed entries={changes} />
      </TabsContent>
    </Tabs>
  );
}

/** A rejected or voided record says why, without opening its history. */
export function ClosedNotice({ status, approvals }: { status: string; approvals: WorkflowRecord[] }) {
  if (status !== "Cancelled" && status !== "Rejected") return null;
  const step = [...approvals].reverse().find((a) => a.step === status);
  return (
    <p role="status" className="rounded-[12px] border border-[#ececea] bg-[#fafaf9] px-4 py-3 text-[13.5px] text-neutral-900">
      {status === "Cancelled" ? "Voided" : "Rejected"}
      {step?.at ? ` on ${format(new Date(step.at), "d MMM yyyy")}` : ""}
      {step?.by ? ` by ${step.by}` : ""}
      {step?.remarks ? <>: <span className="text-[#4a4f59]">{step.remarks}</span></> : "."}
    </p>
  );
}

/** The history folded away under one line, below a record's review. */
export function RecordHistory({
  steps,
  changes,
  updatedAt,
}: {
  steps: ApprovalTimelineStep[];
  changes: HistoryEntry[];
  updatedAt?: string;
}) {
  return (
    <details className="group rounded-[12px] border border-[#ececea]">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-[13.5px] font-medium text-neutral-900 marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#a6323b]">
        <ChevronRight aria-hidden="true" className="h-4 w-4 text-[#7c818b] transition-transform group-open:rotate-90" />
        History
        <span className="font-normal text-[#5b606b]">
          · {changes.length} {changes.length === 1 ? "entry" : "entries"}
          {updatedAt ? ` · last ${format(new Date(updatedAt), "d MMM yyyy")}` : ""}
        </span>
      </summary>
      <div className="border-t border-[#f0f0ee] px-4 pb-4 pt-3">
        <HistoryTabs steps={steps} changes={changes} />
      </div>
    </details>
  );
}
