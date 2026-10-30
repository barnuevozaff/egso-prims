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
  /** Who made the change, where the entry records it (Cloud Functions do). */
  by?: string;
  /** What was added, removed or changed, one line each (purchase orders since 30 Oct 2026). */
  lines?: string[];
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

/** Chronological change log shared across document modules, newest first. */
export function HistoryFeed({ entries }: { entries: HistoryEntry[] }) {
  if (entries.length === 0) {
    return (
      <EmptyState title="No changes recorded" description="Changes to this record will be listed here." />
    );
  }
  const items = [...entries]
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((h) => ({
      icon: presentationOf(h.kind).icon,
      tone: presentationOf(h.kind).tone,
      text: h.lines?.length ? (
        <>
          {h.text}
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] text-[#4a4f59]">
            {h.lines.map((line, i) => (
              <li key={i} className="break-words">
                {line}
              </li>
            ))}
          </ul>
        </>
      ) : (
        h.text
      ),
      // The name only where the text does not already say who.
      time: `${format(new Date(h.at), "d MMM yyyy · h:mm a")}${h.by && !h.text.includes(h.by) ? ` · ${h.by}` : ""}`,
    }));
  return <ActivityTimeline items={items} />;
}
