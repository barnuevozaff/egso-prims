import { cn } from "@/lib/utils";

export interface StatusTab {
  value: string;
  label: string;
  count: number;
}

/**
 * Status tabs with counts, for a list's toolbar (Purchase requests, Purchase
 * orders, Requisition and issue slips). The selected tab takes the same
 * burgundy tint as the sidebar's current page (24 Oct 2026), so "where you
 * are" reads the same everywhere; the rest stay neutral.
 */
export function StatusTabs({
  tabs,
  value,
  onChange,
  label = "Filter by status",
}: {
  tabs: StatusTab[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1">
      {tabs.map((t) => {
        const selected = value === t.value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(t.value)}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[13.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ring)",
              selected ? "bg-[#f8edef] font-medium text-[#84272e]" : "text-[#5b606b] hover:bg-[#f4f4f2] hover:text-neutral-900",
            )}
          >
            {t.label}
            <span className={cn("text-[12px] tabular-nums", selected ? "text-[#a6323b]" : "text-[#6b707a]")}>{t.count}</span>
          </button>
        );
      })}
    </div>
  );
}
