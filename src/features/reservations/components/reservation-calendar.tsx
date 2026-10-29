import * as React from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "motion/react";

import {
  Button,
  Caption,
  ContainerCard,
  IconButton,
  SectionTitle,
  Skeleton,
  StatusBadge,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components";
import { cn } from "@/lib/utils";
import { formatTime, facilityById, type Reservation, type ReservationStatus } from "@/features/reservations/types";

type CalendarView = "month" | "week" | "day";

/** Calendar chip/dot tints per workflow status. */
const chipTone: Record<ReservationStatus, string> = {
  Pending: "bg-amber-50 text-amber-700 hover:bg-amber-100",
  Approved: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  Completed: "bg-neutral-100 text-neutral-600 hover:bg-neutral-200/70",
  Draft: "bg-neutral-100 text-neutral-500 hover:bg-neutral-200/70",
  Rejected: "bg-red-50 text-red-600 hover:bg-red-100",
  Cancelled: "bg-neutral-100 text-neutral-400 line-through hover:bg-neutral-200/70",
};

const dotTone: Record<ReservationStatus, string> = {
  Pending: "bg-amber-500",
  Approved: "bg-emerald-500",
  Completed: "bg-neutral-400",
  Draft: "bg-neutral-300",
  Rejected: "bg-red-500",
  Cancelled: "bg-neutral-300",
};

function EventPreview({ reservation }: { reservation: Reservation }) {
  const facility = facilityById(reservation.facilityId);
  return (
    <div className="space-y-1 py-0.5">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-semibold text-neutral-900">{reservation.resNumber}</span>
        <StatusBadge status={reservation.status} />
      </div>
      <div className="text-[11.5px] text-neutral-700">
        {facility?.name} · {formatTime(reservation.startTime)} – {formatTime(reservation.endTime)}
      </div>
      <div className="text-[11.5px] text-neutral-500">
        {reservation.borrower} · {reservation.departmentCode}
      </div>
      <div className="max-w-[220px] truncate text-[11px] text-neutral-400">{reservation.purpose}</div>
    </div>
  );
}

function EventChip({
  reservation,
  onOpen,
  showTime = true,
}: {
  reservation: Reservation;
  onOpen?: (reservation: Reservation) => void;
  showTime?: boolean;
}) {
  const facility = facilityById(reservation.facilityId);
  // Read-only on the public portal: with no handler the chip renders as a span,
  // so it neither takes focus nor invites a click it cannot answer.
  const Tag = onOpen ? "button" : "span";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Tag
          onClick={
            onOpen
              ? (e: React.MouseEvent) => {
                  e.stopPropagation();
                  onOpen(reservation);
                }
              : undefined
          }
          className={cn(
            "flex w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-left text-[10.5px] font-medium transition",
            chipTone[reservation.status],
            !onOpen && "cursor-default",
          )}
        >
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotTone[reservation.status])} />
          <span className="truncate">
            {showTime && <span className="tabular-nums">{reservation.startTime}</span>}{" "}
            {facility?.shortName}
          </span>
        </Tag>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="border border-neutral-200 bg-white text-neutral-900 shadow-lg">
        <EventPreview reservation={reservation} />
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Interactive facility reservation calendar — month/week/day views with
 * status-colored indicators, today highlight, hover previews, and
 * click-through to the reservation drawer.
 */
export function ReservationCalendar({
  reservations,
  loading = false,
  onSelectReservation,
  className,
}: {
  reservations: Reservation[];
  loading?: boolean;
  /**
   * Omit to render the calendar read-only.
   *
   * The public reserve page used to pass `() => {}` here, which left every
   * booking looking clickable and doing nothing — the worst kind of control.
   * Out there the calendar answers one question, "is this date already taken",
   * and a visitor has no business opening another office's reservation anyway.
   */
  onSelectReservation?: (reservation: Reservation) => void;
  className?: string;
}) {
  const [view, setView] = React.useState<CalendarView>("month");
  const [cursor, setCursor] = React.useState(() => new Date());

  const byDate = React.useMemo(() => {
    const map = new Map<string, Reservation[]>();
    for (const r of reservations) {
      const list = map.get(r.date) ?? [];
      list.push(r);
      map.set(r.date, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return map;
  }, [reservations]);

  const eventsOn = (d: Date) => byDate.get(format(d, "yyyy-MM-dd")) ?? [];

  const step = (dir: 1 | -1) =>
    setCursor((c) =>
      view === "month" ? addMonths(c, dir) : view === "week" ? addWeeks(c, dir) : addDays(c, dir),
    );

  const title =
    view === "month"
      ? format(cursor, "MMMM yyyy")
      : view === "week"
        ? `${format(startOfWeek(cursor), "d MMM")} – ${format(endOfWeek(cursor), "d MMM yyyy")}`
        : format(cursor, "EEEE, d MMMM yyyy");

  const openDay = (d: Date) => {
    setCursor(d);
    setView("day");
  };

  return (
    <TooltipProvider delayDuration={200}>
      <ContainerCard className={className}>
        {/* Header */}
        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-100 px-5 py-4">
          <SectionTitle>Reservation Calendar</SectionTitle>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <IconButton aria-label="Previous" onClick={() => step(-1)}>
                <ChevronLeft />
              </IconButton>
              <span className="min-w-[150px] text-center text-[12.5px] font-medium text-neutral-800">
                {title}
              </span>
              <IconButton aria-label="Next" onClick={() => step(1)}>
                <ChevronRight />
              </IconButton>
            </div>
            <Button variant="secondary" onClick={() => setCursor(new Date())}>
              Today
            </Button>
            {/* View switcher */}
            <div className="flex items-center rounded-lg bg-neutral-100 p-0.5">
              {(["month", "week", "day"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[12px] font-medium capitalize transition",
                    view === v
                      ? "bg-white text-neutral-900 shadow-sm"
                      : "text-neutral-500 hover:text-neutral-800",
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-7 gap-px p-5">
            {Array.from({ length: 21 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-none first:rounded-tl-lg" />
            ))}
          </div>
        ) : (
          <motion.div
            key={`${view}-${format(cursor, "yyyy-MM-dd")}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {view === "month" && (
              <MonthView cursor={cursor} eventsOn={eventsOn} onOpenDay={openDay} onOpen={onSelectReservation} />
            )}
            {view === "week" && (
              <WeekView cursor={cursor} eventsOn={eventsOn} onOpenDay={openDay} onOpen={onSelectReservation} />
            )}
            {view === "day" && <DayView cursor={cursor} eventsOn={eventsOn} onOpen={onSelectReservation} />}
          </motion.div>
        )}
      </ContainerCard>
    </TooltipProvider>
  );
}

/* ---------------- Month ---------------- */

function MonthView({
  cursor,
  eventsOn,
  onOpenDay,
  onOpen,
}: {
  cursor: Date;
  eventsOn: (d: Date) => Reservation[];
  onOpenDay: (d: Date) => void;
  onOpen?: (r: Reservation) => void;
}) {
  const start = startOfWeek(startOfMonth(cursor));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-7 border-b border-neutral-100">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div
              key={d}
              className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-neutral-400"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const inMonth = isSameMonth(d, cursor);
            const events = eventsOn(d);
            return (
              <div
                key={i}
                onClick={() => onOpenDay(d)}
                className={cn(
                  "min-h-[96px] cursor-pointer border-b border-r border-neutral-100 p-1.5 transition hover:bg-neutral-50/70 [&:nth-child(7n)]:border-r-0",
                  !inMonth && "bg-neutral-50/50",
                )}
              >
                <div className="mb-1 flex justify-end">
                  <span
                    className={cn(
                      "grid h-5 w-5 place-items-center rounded-full text-[11px] tabular-nums",
                      // Today in the municipal burgundy, as the current page is in the sidebar.
                      isToday(d)
                        ? "bg-[#a6323b] font-semibold text-white"
                        : inMonth
                          ? "text-neutral-700"
                          : "text-neutral-300",
                    )}
                  >
                    {format(d, "d")}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {events.slice(0, 3).map((r) => (
                    <EventChip key={r.id} reservation={r} onOpen={onOpen} />
                  ))}
                  {events.length > 3 && (
                    <div className="px-1.5 text-[10px] font-medium text-neutral-400">
                      +{events.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Week ---------------- */

function WeekView({
  cursor,
  eventsOn,
  onOpenDay,
  onOpen,
}: {
  cursor: Date;
  eventsOn: (d: Date) => Reservation[];
  onOpenDay: (d: Date) => void;
  onOpen?: (r: Reservation) => void;
}) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[840px] grid-cols-7">
        {days.map((d, i) => {
          const events = eventsOn(d);
          return (
            <div key={i} className="min-h-[280px] border-r border-neutral-100 last:border-r-0">
              <button
                onClick={() => onOpenDay(d)}
                className={cn(
                  "flex w-full items-baseline justify-center gap-1.5 border-b border-neutral-100 px-2 py-2 transition hover:bg-neutral-50",
                  isSameDay(d, cursor) && "bg-neutral-50/70",
                )}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                  {format(d, "EEE")}
                </span>
                <span
                  className={cn(
                    "grid h-5 w-5 place-items-center rounded-full text-[11.5px] tabular-nums",
                    isToday(d) ? "bg-[#a6323b] font-semibold text-white" : "text-neutral-800",
                  )}
                >
                  {format(d, "d")}
                </span>
              </button>
              <div className="space-y-1 p-1.5">
                {events.length === 0 ? (
                  <div className="py-4 text-center text-[10.5px] text-neutral-300">—</div>
                ) : (
                  events.map((r) => {
                    const facility = facilityById(r.facilityId);
                    return (
                      <Tooltip key={r.id}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={onOpen ? () => onOpen(r) : undefined}
                            className={cn(
                              "w-full rounded-lg px-2 py-1.5 text-left transition",
                              chipTone[r.status],
                            )}
                          >
                            <div className="flex items-center gap-1 text-[10px] font-semibold tabular-nums">
                              <span className={cn("h-1.5 w-1.5 rounded-full", dotTone[r.status])} />
                              {r.startTime}–{r.endTime}
                            </div>
                            <div className="mt-0.5 truncate text-[11px] font-medium">
                              {facility?.shortName}
                            </div>
                            <div className="truncate text-[10px] opacity-75">{r.departmentCode}</div>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="bottom"
                          className="border border-neutral-200 bg-white text-neutral-900 shadow-lg"
                        >
                          <EventPreview reservation={r} />
                        </TooltipContent>
                      </Tooltip>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Day ---------------- */

function DayView({
  cursor,
  eventsOn,
  onOpen,
}: {
  cursor: Date;
  eventsOn: (d: Date) => Reservation[];
  onOpen?: (r: Reservation) => void;
}) {
  const events = eventsOn(cursor);
  if (events.length === 0) {
    return (
      <div className="px-6 py-10 text-center">
        <div className="text-[13px] font-semibold text-neutral-900">No reservations</div>
        <Caption as="p" className="mt-1">
          No facilities are booked on this day.
        </Caption>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-neutral-100">
      {events.map((r) => {
        const facility = facilityById(r.facilityId);
        return (
          <li key={r.id}>
            <button
              onClick={onOpen ? () => onOpen(r) : undefined}
              className="flex w-full items-center gap-4 px-5 py-3 text-left transition hover:bg-neutral-50/70"
            >
              <span className="w-32 shrink-0 text-[12px] font-medium tabular-nums text-neutral-700">
                {formatTime(r.startTime)} – {formatTime(r.endTime)}
              </span>
              <span className={cn("h-2 w-2 shrink-0 rounded-full", facility?.color)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium text-neutral-900">
                  {facility?.name} — {r.purpose}
                </span>
                <span className="block text-[11.5px] text-neutral-500">
                  {r.resNumber} · {r.borrower} · {r.departmentCode}
                </span>
              </span>
              <StatusBadge status={r.status} className="shrink-0" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
