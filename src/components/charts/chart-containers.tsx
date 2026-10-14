import type { ChartData, ChartOptions } from "chart.js";

import { InformationCard } from "@/components/cards/information-card";
import { Skeleton } from "@/components/feedback/skeleton";
import { ChartCanvas } from "@/components/charts/chart-canvas";

/** Default categorical palette drawn from the Design Foundation accents. */
export const chartPalette = [
  "#3b82f6", // blue-500
  "#10b981", // emerald-500
  "#8b5cf6", // violet-500
  "#f97316", // orange-500
  "#0ea5e9", // sky-500
  "#f43f5e", // rose-500
  "#f59e0b", // amber-500
];

export interface ChartCardProps {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: { label: string; onClick?: () => void };
  meta?: string;
  loading?: boolean;
  height?: number;
  className?: string;
  children: React.ReactNode;
}

/** Titled card that hosts any chart container. */
export function ChartCard({
  title,
  icon,
  action,
  meta,
  loading = false,
  height = 220,
  className,
  children,
}: ChartCardProps) {
  return (
    <InformationCard icon={icon} title={title} action={action} meta={meta} className={className}>
      {loading ? <Skeleton style={{ height }} className="w-full rounded-lg" /> : children}
    </InformationCard>
  );
}

const legendDefaults = {
  labels: {
    boxWidth: 8,
    boxHeight: 8,
    usePointStyle: true,
    pointStyle: "circle" as const,
  },
};

export function DonutChartContainer({
  data,
  options,
  height = 220,
  className,
  summary,
}: {
  data: ChartData<"doughnut">;
  options?: ChartOptions<"doughnut">;
  height?: number;
  className?: string;
  /** Sentence describing what the chart shows, for assistive technology. */
  summary?: string;
}) {
  return (
    <ChartCanvas
      height={height}
      className={className}
      summary={summary}
      config={{
        type: "doughnut",
        data,
        options: {
          cutout: "68%",
          plugins: { legend: { position: "bottom", ...legendDefaults } },
          ...options,
        },
      }}
    />
  );
}

export function BarChartContainer({
  data,
  options,
  height = 220,
  className,
  summary,
}: {
  data: ChartData<"bar">;
  options?: ChartOptions<"bar">;
  height?: number;
  className?: string;
  /** Sentence describing what the chart shows, for assistive technology. */
  summary?: string;
}) {
  return (
    <ChartCanvas
      height={height}
      className={className}
      summary={summary}
      config={{
        type: "bar",
        data,
        options: {
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false } },
            y: { border: { display: false }, ticks: { maxTicksLimit: 5 } },
          },
          ...options,
        },
      }}
    />
  );
}

export function LineChartContainer({
  data,
  options,
  height = 220,
  className,
  summary,
}: {
  data: ChartData<"line">;
  options?: ChartOptions<"line">;
  height?: number;
  className?: string;
  /** Sentence describing what the chart shows, for assistive technology. */
  summary?: string;
}) {
  return (
    <ChartCanvas
      height={height}
      className={className}
      summary={summary}
      config={{
        type: "line",
        data,
        options: {
          elements: {
            line: { tension: 0, borderWidth: 2 },
            point: { radius: 0, hoverRadius: 4 },
          },
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false } },
            y: { border: { display: false }, ticks: { maxTicksLimit: 5 } },
          },
          ...options,
        },
      }}
    />
  );
}
