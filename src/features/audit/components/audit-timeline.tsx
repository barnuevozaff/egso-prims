import * as React from "react";
import { format, isToday, isYesterday } from "date-fns";
import {
  Boxes,
  CalendarDays,
  ClipboardList,
  Droplets,
  FileText,
  Fuel,
  Settings,
  ShieldAlert,
  ShoppingCart,
  UserRound,
  Zap,
} from "lucide-react";

import { ActivityTimeline, Button, Caption, SkeletonText, EmptyState } from "@/components";
import type { ActivityTimelineItem } from "@/components";
import type { AuditEntry } from "@/features/audit/types";

/** Module → icon, matching the sidebar's iconography. */
const MODULE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  "Purchase Requests": FileText,
  "Purchase Orders": ShoppingCart,
  RIS: ClipboardList,
  Inventory: Boxes,
  Reservations: CalendarDays,
  "Energy Consumption": Zap,
  "Water Consumption": Droplets,
  "Fuel Consumption": Fuel,
  Authentication: UserRound,
  Settings,
  System: ShieldAlert,
};

/** Severity → the tinted disc the shared ActivityTimeline expects. */
const SEVERITY_TONE: Record<string, string> = {
  Critical: "text-red-600 bg-red-50",
  Error: "text-red-600 bg-red-50",
  Warning: "text-amber-600 bg-amber-50",
  Success: "text-(--tone-settled) bg-(--tone-settled-tint)",
  Information: "text-blue-600 bg-blue-50",
};

/** "Today" / "Yesterday" / "14 March 2026" heading for a day's entries. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "d MMMM yyyy");
}

/**
 * Optional timeline rendering of the same filtered entries the table shows.
 * Built on the shared ActivityTimeline so the styling matches the dashboard's
 * activity feed rather than introducing a second visual language.
 */
const PAGE_SIZE = 50;

export function AuditTimeline({
  entries,
  loading,
  onSelect,
}: {
  entries: AuditEntry[];
  loading?: boolean;
  onSelect?: (entry: AuditEntry) => void;
}) {
  // The register runs to thousands of rows; the table paginates, so the
  // timeline does too rather than mounting every entry at once.
  const [visible, setVisible] = React.useState(PAGE_SIZE);

  React.useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [entries]);

  const shown = React.useMemo(
    () => [...entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, visible),
    [entries, visible],
  );

  /** Entries grouped by calendar day, newest day first. */
  const groups = React.useMemo(() => {
    const map = new Map<string, AuditEntry[]>();
    for (const e of shown) {
      const key = e.timestamp.slice(0, 10);
      const list = map.get(key);
      if (list) list.push(e);
      else map.set(key, [e]);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([day, rows]) => ({
        day,
        rows: [...rows].sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
      }));
  }, [shown]);

  if (loading) return <SkeletonText lines={10} />;

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="No activity to show"
        description="Try widening the date range or clearing filters."
      />
    );
  }

  return (
    <div className="space-y-5 p-4">
      {groups.map((group) => (
        <section key={group.day}>
          <div className="mb-2.5 flex items-center gap-2">
            <Caption as="span" className="font-semibold uppercase tracking-wider">
              {dayLabel(group.day)}
            </Caption>
            <span className="h-px flex-1 bg-neutral-200" />
            <Caption as="span">
              {group.rows.length} activit{group.rows.length === 1 ? "y" : "ies"}
            </Caption>
          </div>
          <ActivityTimeline
            items={group.rows.map<ActivityTimelineItem>((e) => ({
              icon: MODULE_ICON[e.module] ?? ShieldAlert,
              tone: SEVERITY_TONE[e.severity] ?? "text-neutral-600 bg-neutral-100",
              time: format(new Date(e.timestamp), "h:mm a"),
              text: (
                <button
                  className="block text-left"
                  onClick={() => onSelect?.(e)}
                  disabled={!onSelect}
                >
                  <span className="font-medium text-neutral-800">{e.user}</span>
                  <span className="text-neutral-500"> · {e.module}</span>
                  <span className="block text-[12px] text-neutral-700">
                    {e.action}
                    {e.documentNumber && (
                      <span className="text-neutral-500"> — {e.documentNumber}</span>
                    )}
                  </span>
                  <span className="block text-[11.5px] text-neutral-500">{e.response}</span>
                </button>
              ),
            }))}
          />
        </section>
      ))}

      {entries.length > shown.length && (
        <div className="flex flex-col items-center gap-1.5 pt-1">
          <Button variant="secondary" size="xs" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
            Show older activity
          </Button>
          <Caption as="span">
            Showing {shown.length.toLocaleString("en-PH")} of{" "}
            {entries.length.toLocaleString("en-PH")}
          </Caption>
        </div>
      )}
    </div>
  );
}
