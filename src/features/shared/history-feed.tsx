import { format } from "date-fns";
import {
  FilePlus2,
  Hash,
  MessageSquare,
  Paperclip,
  PenLine,
  ShoppingCart,
  Workflow,
} from "lucide-react";

import { ActivityTimeline, EmptyState } from "@/components";

export interface HistoryEntry {
  id: string;
  kind:
    | "create"
    | "update"
    | "status"
    | "comment"
    | "attachment"
    // 21 Oct 2026: the official PR number, the purchase order created with an
    // approval, and a correction to an approved order.
    | "official-number"
    | "purchase-order"
    | "correction";
  text: string;
  at: string;
}

type Presentation = { icon: React.ComponentType<{ className?: string }>; tone: string };

const kindPresentation: Record<HistoryEntry["kind"], Presentation> = {
  create: { icon: FilePlus2, tone: "text-emerald-600 bg-emerald-50" },
  update: { icon: PenLine, tone: "text-blue-600 bg-blue-50" },
  status: { icon: Workflow, tone: "text-violet-600 bg-violet-50" },
  comment: { icon: MessageSquare, tone: "text-sky-600 bg-sky-50" },
  attachment: { icon: Paperclip, tone: "text-amber-600 bg-amber-50" },
  "official-number": { icon: Hash, tone: "text-violet-600 bg-violet-50" },
  "purchase-order": { icon: ShoppingCart, tone: "text-emerald-600 bg-emerald-50" },
  correction: { icon: PenLine, tone: "text-amber-700 bg-amber-50" },
};

/** An entry of a kind this screen does not know still shows, as a plain update. */
const presentationOf = (kind: string): Presentation =>
  kindPresentation[kind as HistoryEntry["kind"]] ?? kindPresentation.update;

/** Chronological audit feed shared across document modules. */
export function HistoryFeed({ entries }: { entries: HistoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <EmptyState title="No history" description="Changes to this record will be logged here." />
    );
  }
  const items = [...entries]
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((h) => ({
      icon: presentationOf(h.kind).icon,
      tone: presentationOf(h.kind).tone,
      text: h.text,
      time: format(new Date(h.at), "d MMM yyyy · h:mm a"),
    }));
  return <ActivityTimeline items={items} />;
}
