import * as React from "react";
import { addDays, format, isSameMonth, parseISO } from "date-fns";
import { ArrowRight, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { PageTransition, Skeleton, StatusBadge } from "@/components";
import { listPurchaseRequests } from "@/features/purchase-requests/api";
import {
  PENDING_PR_STATUSES,
  prTotal,
  type PurchaseRequest,
} from "@/features/purchase-requests/types";
import { listPurchaseOrders } from "@/features/purchase-orders/api";
import { poTotal, type PurchaseOrder } from "@/features/purchase-orders/types";
import { listInventoryItems } from "@/features/inventory/api";
import { stockStatusOf, type InventoryItem } from "@/features/inventory/types";
import { useAuth } from "@/features/auth/auth-context";
import { listReservations } from "@/features/reservations/api";
import { facilityById, type Reservation } from "@/features/reservations/types";
import { countRows } from "@/lib/db";
import { formatPHP } from "@/lib/format";
import { useRealtimeRefresh } from "@/features/shared/use-realtime";
import { reportLoadFailure } from "@/features/shared/load-guard";
import { cn } from "@/lib/utils";

/**
 * The admin's first screen, approved 15 Oct 2026 (canvas "Admin — Dashboard").
 *
 * It leads with what is waiting on the office, each row one click from the
 * work, then four figures in pesos, the newest requests, and the facilities
 * booked this week. The notification panel that used to sit here repeated the
 * bell in the top bar and is gone; so are the six gradient summary cards,
 * which restated counts shown elsewhere on the page.
 */

/** Document numbers only. Amounts and counts use Geist's tabular figures:
 *  the mono face's slashed zero made ₱43,000 read like code. */
const MONO = "font-['Geist_Mono',ui-monospace,monospace]";
const FIG = "tabular-nums";

interface DashboardData {
  prs: PurchaseRequest[];
  pos: PurchaseOrder[];
  risPending: number;
  risReleased: number;
  items: InventoryItem[];
  reservations: Reservation[];
}

function useDashboardData() {
  const [data, setData] = React.useState<DashboardData | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      const [prs, pos, risPending, risReleased, items, reservations] = await Promise.all([
        listPurchaseRequests(),
        listPurchaseOrders(),
        countRows("ris_requests", ["Pending Approval"]),
        countRows("ris_requests", ["Released", "Completed"]),
        listInventoryItems(),
        listReservations(),
      ]);
      setData({ prs, pos, risPending, risReleased, items, reservations });
    } catch (e) {
      // A failed load must not read as a quiet office.
      reportLoadFailure(e, "the dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  useRealtimeRefresh(
    ["purchase_requests", "purchase_orders", "ris_requests", "inventory_items", "reservations"],
    load,
  );

  return { data, loading };
}

const greeting = (d: Date) => {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "9:00 AM", from the stored "09:00". */
const clock = (hhmm: string) => format(parseISO(`2000-01-01T${hhmm}`), "h:mm a");

function Panel({
  title,
  aside,
  children,
  className,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const id = React.useId();
  return (
    <section
      aria-labelledby={id}
      className={cn("overflow-hidden rounded-[14px] border border-[#e6e6e3] bg-white", className)}
    >
      <div className="flex items-baseline justify-between gap-3 px-5 pb-3 pt-4">
        <h2 id={id} className="text-[15px] font-semibold text-neutral-900">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function TaskRow({
  count,
  title,
  detail,
  onOpen,
}: {
  count: number;
  title: string;
  detail: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-center gap-4 border-t border-[#f0f0ee] px-5 py-3.5 text-left transition-colors hover:bg-[#f7f7f6] focus-visible:bg-[#f7f7f6] focus-visible:outline-none"
    >
      <span className={cn("w-11 text-[24px] font-semibold tracking-[-0.03em]", FIG)}>{count}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-medium text-neutral-900">{title}</span>
        <span className="mt-0.5 block truncate text-[13px] text-[#5b606b]">{detail}</span>
      </span>
      <ArrowRight
        aria-hidden="true"
        className="h-[18px] w-[18px] text-[#8a8f98] transition-transform duration-150 ease-out group-hover:translate-x-[3px] group-hover:text-neutral-900"
      />
    </button>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="border-b border-[#f0f0ee] px-5 py-[18px] sm:border-b-0 sm:border-r last:border-0">
      <p className="text-[13px] text-[#5b606b]">{label}</p>
      <p className={cn("mt-2 text-[26px] font-semibold tracking-[-0.03em] text-neutral-900", FIG)}>
        {value}
      </p>
      <p className="mt-1 text-[12.5px] text-[#5b606b]">{note}</p>
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, loading } = useDashboardData();
  const now = new Date();

  const pendingPRs = (data?.prs ?? []).filter((p) => PENDING_PR_STATUSES.includes(p.status));
  const oldestPending = pendingPRs.reduce<string | null>(
    (min, p) => (min === null || p.createdAt < min ? p.createdAt : min),
    null,
  );
  const pendingOffices = [...new Set(pendingPRs.map((p) => p.departmentCode))].slice(0, 3);
  const pendingPOs = (data?.pos ?? []).filter((p) => p.status === "Pending Approval");
  const openPOs = (data?.pos ?? []).filter((p) => !["Completed", "Cancelled"].includes(p.status));
  const pendingRes = (data?.reservations ?? [])
    .filter((r) => r.status === "Pending")
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));

  const tasks = [
    pendingPRs.length > 0 && {
      count: pendingPRs.length,
      title: `${plural(pendingPRs.length, "Purchase request", "Purchase requests")} awaiting review`,
      detail: [
        oldestPending && `Oldest filed ${format(parseISO(oldestPending), "d MMM")}`,
        pendingOffices.join(", "),
      ]
        .filter(Boolean)
        .join(" · "),
      to: "/purchase-requests",
    },
    pendingPOs.length > 0 && {
      count: pendingPOs.length,
      title: `${plural(pendingPOs.length, "Purchase order", "Purchase orders")} awaiting approval`,
      detail: `${formatPHP(pendingPOs.reduce((s, p) => s + poTotal(p), 0))} in total`,
      to: "/purchase-orders",
    },
    (data?.risPending ?? 0) > 0 && {
      count: data!.risPending,
      title: `${plural(data!.risPending, "Requisition slip", "Requisition slips")} to approve`,
      detail: "Pending approval",
      to: "/ris",
    },
    pendingRes.length > 0 && {
      count: pendingRes.length,
      title: `${plural(pendingRes.length, "Facility reservation", "Facility reservations")} to confirm`,
      detail: `Earliest for ${format(parseISO(pendingRes[0].date), "EEE d MMM")}, ${clock(pendingRes[0].startTime)}`,
      to: "/reservations",
    },
  ].filter(Boolean) as { count: number; title: string; detail: string; to: string }[];

  const thisMonth = (data?.prs ?? []).filter((p) => isSameMonth(parseISO(p.createdAt), now));
  const stockValue = (data?.items ?? []).reduce((s, it) => s + it.onHand * it.unitPrice, 0);
  const lowStock = (data?.items ?? []).filter((it) => stockStatusOf(it) !== "Available").length;

  const weekDays = Array.from({ length: 7 }, (_, i) => format(addDays(now, i), "yyyy-MM-dd"));
  const thisWeek = weekDays
    .map((day) => ({
      day,
      bookings: (data?.reservations ?? [])
        .filter((r) => r.date === day && !["Cancelled", "Rejected"].includes(r.status))
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    }))
    .filter((d) => d.bookings.length > 0)
    .slice(0, 4);

  return (
    <PageTransition className="w-full max-w-[1180px] space-y-5 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-[#5b606b]">{format(now, "EEEE, d MMMM yyyy")}</p>
          <h1 className="mt-1.5 text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] text-neutral-900 sm:text-[30px]">
            {greeting(now)}, {user?.name ?? "Administrator"}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => navigate("/purchase-requests/new")}
          className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-neutral-900 px-4 text-[14px] font-medium text-white transition-[background-color,transform] duration-150 hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 active:scale-[0.98]"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          New purchase request
        </button>
      </div>

      <Panel
        title="Needs your attention"
        aside={
          !loading && (
            <span className="text-[13px] text-[#5b606b]">
              {tasks.length === 0
                ? "All clear"
                : `${tasks.reduce((s, t) => s + t.count, 0)} ${plural(tasks.reduce((s, t) => s + t.count, 0), "item", "items")}`}
            </span>
          )
        }
      >
        {loading ? (
          <div className="space-y-3 border-t border-[#f0f0ee] px-5 py-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <p className="border-t border-[#f0f0ee] px-5 py-5 text-[14px] text-[#5b606b]">
            Nothing is waiting on the office. New requests appear here as they come in.
          </p>
        ) : (
          tasks.map((t) => (
            <TaskRow key={t.to} count={t.count} title={t.title} detail={t.detail} onOpen={() => navigate(t.to)} />
          ))
        )}
      </Panel>

      <section
        aria-label="Key figures"
        className="grid overflow-hidden rounded-[14px] border border-[#e6e6e3] bg-white sm:grid-cols-2 lg:grid-cols-4"
      >
        {loading ? (
          [0, 1, 2, 3].map((i) => (
            <div key={i} className="px-5 py-[18px]">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-3 h-7 w-24" />
            </div>
          ))
        ) : (
          <>
            <Figure
              label="Requested this month"
              value={formatPHP(thisMonth.reduce((s, p) => s + prTotal(p), 0))}
              note={`${thisMonth.length} ${plural(thisMonth.length, "purchase request", "purchase requests")}`}
            />
            <Figure
              label="Open purchase orders"
              value={formatPHP(openPOs.reduce((s, p) => s + poTotal(p), 0))}
              note={`${openPOs.length} ${plural(openPOs.length, "order", "orders")}`}
            />
            <Figure
              label="Stock value"
              value={formatPHP(stockValue)}
              note={`${data?.items.length ?? 0} items · ${lowStock === 0 ? "none running low" : `${lowStock} running low`}`}
            />
            <Figure
              label="Slips released"
              value={String(data?.risReleased ?? 0)}
              note="Requisition and issue slips"
            />
          </>
        )}
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Panel
          title="Latest purchase requests"
          aside={
            <button
              type="button"
              onClick={() => navigate("/purchase-requests")}
              className="rounded text-[13px] text-[#5b606b] hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
            >
              View all
            </button>
          }
        >
          {loading ? (
            <div className="space-y-3 border-t border-[#f0f0ee] px-5 py-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : (data?.prs.length ?? 0) === 0 ? (
            <p className="border-t border-[#f0f0ee] px-5 py-5 text-[14px] text-[#5b606b]">
              No purchase requests yet.
            </p>
          ) : (
            data!.prs.slice(0, 5).map((pr) => (
              <button
                key={pr.id}
                type="button"
                onClick={() => navigate(`/purchase-requests/${pr.id}`)}
                className="flex w-full items-center gap-3 border-t border-[#f0f0ee] px-5 py-3 text-left transition-colors hover:bg-[#fafaf9] focus-visible:bg-[#fafaf9] focus-visible:outline-none"
              >
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[12.5px] font-medium text-neutral-900", MONO)}>
                    {pr.prNumber}
                  </span>
                  <span className="mt-0.5 block truncate text-[13.5px] text-[#4a4f59]">
                    {pr.purpose} · {pr.requester}
                  </span>
                </span>
                <span className={cn("shrink-0 text-[13.5px] font-medium text-neutral-900", FIG)}>
                  {formatPHP(prTotal(pr))}
                </span>
                <StatusBadge status={pr.status} className="w-[110px] shrink-0" />
              </button>
            ))
          )}
        </Panel>

        <Panel
          title="Facilities this week"
          aside={
            <button
              type="button"
              onClick={() => navigate("/reservations")}
              className="rounded text-[13px] text-[#5b606b] hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
            >
              Calendar
            </button>
          }
        >
          {loading ? (
            <div className="space-y-3 border-t border-[#f0f0ee] px-5 py-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : thisWeek.length === 0 ? (
            <p className="border-t border-[#f0f0ee] px-5 py-5 text-[14px] text-[#5b606b]">
              No facility is booked in the next seven days.
            </p>
          ) : (
            thisWeek.map(({ day, bookings }) => (
              <div key={day} className="flex gap-4 border-t border-[#f0f0ee] px-5 py-3">
                <div className="w-11 shrink-0 text-center">
                  <div className="text-[11.5px] uppercase text-[#5b606b]">
                    {format(parseISO(day), "EEE")}
                  </div>
                  <div className={cn("text-[18px] font-semibold text-neutral-900", FIG)}>
                    {format(parseISO(day), "d")}
                  </div>
                </div>
                <ul className="min-w-0 flex-1 space-y-2">
                  {bookings.map((r) => (
                    <li key={r.id}>
                      <div className="truncate text-[14px] font-medium text-neutral-900">
                        {facilityById(r.facilityId)?.name ?? "Facility"}
                      </div>
                      <div className="mt-0.5 truncate text-[13px] text-[#5b606b]">
                        {clock(r.startTime)}–{clock(r.endTime)} · {r.departmentCode} ·{" "}
                        {r.status === "Pending" ? "Waiting for you" : r.status}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </Panel>
      </div>
    </PageTransition>
  );
}
