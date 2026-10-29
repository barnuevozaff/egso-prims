import { cn } from "@/lib/utils";

/**
 * What a summary figure's icon tint means (24 Oct 2026). One rule for every
 * module, so colour always says something:
 *
 *   brand      the module's own register — at most one card per page
 *              (Total Inventory Items, Registered Accounts, Total Violators …)
 *   attention  waiting on staff (Pending …)
 *   positive   done, available or received (Approved, Completed, Collected)
 *   critical   a problem (Out of Stock, Failed Logins)
 *   neutral    everything else: money totals, today's counts, averages
 *
 * Attention, positive and critical colour a card only while its figure is
 * above zero, so colour appears only when there is something to see: a page
 * with nothing pending and nothing wrong shows no warning colour, and an
 * empty "Approved" is not painted as good news.
 */
export type MetricTone = "brand" | "attention" | "positive" | "critical" | "neutral";

const TONES: Record<MetricTone, string> = {
  brand: "bg-[#f8edef] text-[#a6323b]",
  attention: "bg-[#fdf3e3] text-[#b45309]",
  positive: "bg-[#eaf6ef] text-[#1f7a46]",
  critical: "bg-[#fdecec] text-[#b42318]",
  neutral: "bg-[#f3f3f1] text-[#5b606b]",
};

/**
 * The compact tinted icon in a summary card's corner. Pass the card's figure
 * as `value`: every tint but the register's own then shows only while it is
 * above zero.
 */
export function MetricIcon({
  icon: Icon,
  tone = "neutral",
  value,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone?: MetricTone;
  value?: number;
  className?: string;
}) {
  const shown = tone !== "brand" && tone !== "neutral" && !(Number(value) > 0) ? "neutral" : tone;
  return (
    <span aria-hidden="true" className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-[9px]", TONES[shown], className)}>
      <Icon className="h-4 w-4" />
    </span>
  );
}
