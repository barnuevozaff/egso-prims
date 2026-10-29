import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCount, type CountKind } from "@/lib/format";
import { useCountUp } from "@/hooks/use-count-up";
import { ContainerCard } from "@/components/cards/container-card";
import { MetricIcon, type MetricTone } from "@/components/cards/metric-icon";
import { IconButton } from "@/components/ui/button";
import { Skeleton } from "@/components/feedback/skeleton";

export interface MetricCardProps {
  label: string;
  value: number;
  /** Display format for the animated value. */
  kind?: CountKind;
  icon: React.ComponentType<{ className?: string }>;
  /**
   * The line under the value. `up` and `down` colour it green or red, so they
   * are for a direction that was actually measured; `none` is a plain caption
   * for a count that is only ever itself, and is the honest choice for a
   * standing figure like "awaiting review".
   */
  trend?: { label: string; direction: "up" | "down" | "none" };
  /** Called when the corner arrow action is clicked. */
  onOpen?: () => void;
  /** What the figure means, for its icon tint (see metric-icon.tsx). Neutral by default. */
  tone?: MetricTone;
  loading?: boolean;
  className?: string;
}

/**
 * Stat card, with the Dashboard's figure anatomy (24 Oct 2026) so every
 * module's summary row reads the same: the label on the left at 13px, a
 * compact tinted icon on the right whose colour follows one rule across the
 * app (metric-icon.tsx), the figure under it, and an optional caption.
 */
export function MetricCard({
  label,
  value,
  kind = "int",
  icon: Icon,
  trend,
  onOpen,
  tone = "neutral",
  loading = false,
  className,
}: MetricCardProps) {
  const animated = useCountUp(loading ? 0 : value);

  return (
    <ContainerCard className={cn("px-5 py-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <span className="pt-1 text-[13px] font-medium leading-5 text-[#5b606b]">{label}</span>
        {onOpen ? (
          <IconButton aria-label={`Open ${label}`} shape="circle" onClick={onOpen} className="-mr-1 bg-transparent text-[#8a8f98]">
            <ArrowUpRight />
          </IconButton>
        ) : (
          <MetricIcon icon={Icon} tone={loading ? "neutral" : tone} value={value} />
        )}
      </div>
      {loading ? (
        <Skeleton className="mt-1.5 h-7 w-24" />
      ) : (
        <div className="mt-1 text-[26px] font-semibold leading-8 tracking-[-0.03em] text-neutral-900 tabular-nums">
          {formatCount(animated, kind)}
        </div>
      )}
      {trend && !loading && (
        <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px]">
          {trend.direction !== "none" && (
            <span
              aria-hidden="true"
              className={cn("h-1.5 w-1.5 rounded-full", trend.direction === "up" ? "bg-green-600" : "bg-red-600")}
            />
          )}
          <span
            className={
              trend.direction === "none" ? "text-[#5b606b]" : trend.direction === "up" ? "text-green-700" : "text-red-700"
            }
          >
            {trend.label}
          </span>
        </div>
      )}
    </ContainerCard>
  );
}
