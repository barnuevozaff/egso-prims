import { ContainerCard, Skeleton } from "@/components";
import { MetricIcon, type MetricTone } from "@/components/cards/metric-icon";
import { useCountUp } from "@/hooks/use-count-up";
import { cn } from "@/lib/utils";

/**
 * Operational stat card for the trip dashboard. Same anatomy and animation as
 * MetricCard, but the value carries a unit (litres, kilometres, km/L) that the
 * integer-only formatter cannot express.
 */
export function FuelMetricCard({
  label,
  value,
  unit,
  decimals = 0,
  icon: Icon,
  hint,
  tone = "neutral",
  loading = false,
  className,
}: {
  label: string;
  value: number;
  /** Suffix rendered after the number, e.g. "L" or "km". */
  unit?: string;
  decimals?: number;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
  /** What the figure means, for its icon tint (see metric-icon.tsx). */
  tone?: MetricTone;
  loading?: boolean;
  className?: string;
}) {
  const animated = useCountUp(loading ? 0 : value);

  return (
    // The same figure anatomy as MetricCard (24 Oct 2026), with the unit after the number.
    <ContainerCard className={cn("px-5 py-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <span className="pt-1 text-[13px] font-medium leading-5 text-[#5b606b]">{label}</span>
        <MetricIcon icon={Icon} tone={loading ? "neutral" : tone} value={value} />
      </div>
      {loading ? (
        <Skeleton className="mt-1.5 h-7 w-24" />
      ) : (
        <>
          <div className="mt-1 text-[26px] font-semibold leading-8 tracking-[-0.03em] text-neutral-900 tabular-nums">
            {animated.toLocaleString("en-PH", {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            })}
            {unit && <span className="ml-1 text-[14px] font-medium tracking-normal text-[#5b606b]">{unit}</span>}
          </div>
          {hint && <p className="mt-0.5 text-[12.5px] text-[#5b606b]">{hint}</p>}
        </>
      )}
    </ContainerCard>
  );
}
