import * as React from "react";
import { addDays, differenceInCalendarDays, format, getISOWeek, isSameMonth, parseISO } from "date-fns";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  Package,
  Plus,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import hall1600 from "@/assets/portal/alaminos-municipal-hall-1600.webp";
import hall960 from "@/assets/portal/alaminos-municipal-hall-960.webp";
import { PageTransition, Skeleton, StatusBadge } from "@/components";
import { listPurchaseRequests } from "@/features/purchase-requests/api";
import {
  PENDING_PR_STATUSES,
  prTotal,
  type PurchaseRequest,
  prSummary,
} from "@/features/purchase-requests/types";
import { listPurchaseOrders } from "@/features/purchase-orders/api";
import { poTotal, type PurchaseOrder } from "@/features/purchase-orders/types";
import { listInventoryItems } from "@/features/inventory/api";
import { stockStateOf, type InventoryItem } from "@/features/inventory/types";
import { useAuth } from "@/features/auth/auth-context";
import { can } from "@/features/auth/types";
import { listReservations } from "@/features/reservations/api";
import { facilityName, type Reservation } from "@/features/reservations/types";
import { countRecords } from "@/features/shared/record-counts";
import { formatPHP } from "@/lib/format";
import { useRealtimeRefresh } from "@/features/shared/use-realtime";
import { reportLoadFailure } from "@/features/shared/load-guard";
import { cn } from "@/lib/utils";

/**
 * The admin's first screen. Redesigned 21 Oct 2026 for daily monitoring:
 *
 *   1. Today — the date as a calendar tile and in words, the greeting, how
 *      much is waiting, and the quick actions, on the Alaminos red with the
 *      Municipal Hall photo (the portal's banner, made compact).
 *   2. Needs your attention — one card per queue, each one click from the
 *      work, with how long the oldest has waited.
 *   3. Four figures, each opening its module.
 *   4. The newest purchase requests beside the facilities booked this week.
 *
 * Data, counts and routes are unchanged from the 15 Oct 2026 dashboard.
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
        countRecords("ris_requests", ["Pending Approval"]),
        // Issued: approved since 22 Oct 2026 (approval issues the stock), or released earlier.
        countRecords("ris_requests", ["Approved", "Released", "Completed"]),
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

type Icon = React.ComponentType<{ className?: string }>;

interface Task {
  key: string;
  icon: Icon;
  count: number;
  title: string;
  detail: string;
  /** e.g. "Oldest waiting 3 days" — shown in red when it has waited a while. */
  age?: { text: string; overdue: boolean };
  to: string;
}

/* ------------------------------------------------------------------ */
/* 1. Today                                                            */
/* ------------------------------------------------------------------ */

function DateTile({ now }: { now: Date }) {
  return (
    <div
      aria-hidden="true"
      className="w-[84px] shrink-0 overflow-hidden rounded-[14px] bg-white text-center shadow-[0_1px_2px_rgba(0,0,0,0.12),0_8px_24px_rgba(60,10,16,0.22)]"
    >
      <div className="bg-[#a6323b] py-1 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-white">
        {format(now, "MMM")}
      </div>
      <div className={cn("pt-1.5 text-[34px] font-semibold leading-none tracking-[-0.03em] text-[#16181d]", FIG)}>
        {format(now, "d")}
      </div>
      <div className="pb-2 pt-1 text-[12px] font-medium text-[#5b606b]">{format(now, "EEE")}</div>
    </div>
  );
}

function TodayBanner({
  now,
  name,
  summary,
  actions,
}: {
  now: Date;
  name: string;
  summary: string;
  actions: { label: string; to: string; primary?: boolean }[];
}) {
  const navigate = useNavigate();
  return (
    <section aria-labelledby="dashboard-title" className="relative overflow-hidden rounded-[16px] bg-[#84272e] text-white">
      {/* The Municipal Hall, joined to the red on its left. Hidden on small screens. */}
      <div className="absolute inset-y-0 right-0 hidden w-[34%] md:block min-[1400px]:w-[44%]">
        <img
          src={hall1600}
          srcSet={`${hall960} 960w, ${hall1600} 1600w`}
          sizes="(min-width: 1280px) 600px, 44vw"
          width={1600}
          height={900}
          alt="Alaminos Municipal Hall, with its sign reading Pamahalaang Bayan ng Alaminos"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-[50%_32%]"
        />
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(90deg,#84272e_0%,rgba(132,39,46,0.78)_22%,rgba(132,39,46,0.25)_62%,rgba(132,39,46,0.1)_100%)]"
        />
        {/* CC BY-SA 4.0 credit, required wherever the photo is shown (src/assets/portal/ATTRIBUTION.md). */}
        <p className="absolute bottom-2 right-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] leading-snug text-white">
          Photo:{" "}
          <a
            href="https://commons.wikimedia.org/wiki/File:Alaminos_Municipal_Hall,_Laguna,_July_2023.jpg"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Ralff Nestor Nacor
          </a>
          ,{" "}
          <a
            href="https://creativecommons.org/licenses/by-sa/4.0/"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            CC BY-SA 4.0
          </a>{" "}
          · adapted
        </p>
      </div>

      <div className="relative flex flex-col gap-5 px-6 py-6 sm:flex-row sm:items-center sm:gap-6 sm:px-8 sm:py-7 md:max-w-[74%] min-[1400px]:max-w-[64%]">
        <DateTile now={now} />
        <div className="min-w-0">
          <p className="text-[14.5px] font-medium text-white/90">
            <time dateTime={format(now, "yyyy-MM-dd")}>{format(now, "EEEE, d MMMM yyyy")}</time>
            <span className="text-white/70"> · Week {getISOWeek(now)}</span>
          </p>
          <h1
            id="dashboard-title"
            className="mt-1 text-[26px] font-semibold leading-[1.15] tracking-[-0.03em] min-[1400px]:text-[30px]"
          >
            {greeting(now)}, {name}
          </h1>
          <p className="mt-1.5 text-[14.5px] text-white/85">{summary}</p>
          {actions.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {actions.map((a) => (
                <button
                  key={a.to}
                  type="button"
                  onClick={() => navigate(a.to)}
                  className={cn(
                    "inline-flex h-11 items-center gap-2 rounded-[10px] px-4 text-[14px] font-medium transition-[background-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#84272e] active:scale-[0.98]",
                    a.primary
                      ? "bg-white text-[#84272e] hover:bg-[#f8edef]"
                      : "border border-white/35 text-white hover:bg-white/10",
                  )}
                >
                  {a.primary && <Plus aria-hidden="true" className="h-4 w-4" />}
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Needs your attention                                             */
/* ------------------------------------------------------------------ */

function SectionTitle({ id, title, aside }: { id: string; title: string; aside?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-[16px] font-semibold tracking-[-0.01em] text-neutral-900">
        {title}
      </h2>
      {aside}
    </div>
  );
}

function TaskCard({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const Icon = task.icon;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex min-h-[148px] flex-col rounded-[14px] border border-[#e6e6e3] bg-white p-4 text-left transition-[border-color,box-shadow] duration-150 hover:border-[#dcc3c6] hover:shadow-[0_2px_10px_rgba(132,39,46,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a6323b]"
    >
      <span className="flex items-center justify-between gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#f8edef] text-[#a6323b]">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        {task.age && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[12px] font-medium",
              task.age.overdue ? "bg-[#f8edef] text-[#84272e]" : "bg-[#f4f4f2] text-[#5b606b]",
            )}
          >
            {task.age.text}
          </span>
        )}
      </span>
      <span className="mt-3 flex items-baseline gap-2">
        <span className={cn("text-[30px] font-semibold leading-none tracking-[-0.03em] text-neutral-900", FIG)}>
          {task.count}
        </span>
        <span className="text-[14.5px] font-medium leading-snug text-neutral-900">{task.title}</span>
      </span>
      <span className="mt-1.5 line-clamp-2 text-[13px] text-[#5b606b]">{task.detail}</span>
      <span className="mt-auto inline-flex items-center gap-1.5 pt-3 text-[13.5px] font-medium text-[#a6323b]">
        Review
        <ArrowRight
          aria-hidden="true"
          className="h-4 w-4 transition-transform duration-150 ease-out group-hover:translate-x-[3px]"
        />
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Figures                                                          */
/* ------------------------------------------------------------------ */

function Figure({
  icon: Icon,
  label,
  value,
  note,
  onOpen,
}: {
  icon: Icon;
  label: string;
  value: string;
  note: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col rounded-[14px] border border-[#e6e6e3] bg-white px-5 py-4 text-left transition-colors hover:bg-[#fafaf9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a6323b]"
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-[#5b606b]">{label}</span>
        <Icon aria-hidden="true" className="h-4 w-4 text-[#8a8f98]" />
      </span>
      <span className={cn("mt-2 text-[26px] font-semibold tracking-[-0.03em] text-neutral-900", FIG)}>{value}</span>
      <span className="mt-0.5 text-[12.5px] text-[#5b606b]">{note}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Latest requests and facilities                                   */
/* ------------------------------------------------------------------ */

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
      <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-4">
        <h2 id={id} className="text-[15px] font-semibold text-neutral-900">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function PanelLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-[#a6323b] hover:bg-[#f8edef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a6323b]"
    >
      {label}
      <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="border-t border-[#f0f0ee] px-5 py-6 text-[14px] text-[#5b606b]">{children}</p>
);

const Loading = ({ rows }: { rows: number }) => (
  <div className="space-y-3 border-t border-[#f0f0ee] px-5 py-4">
    {Array.from({ length: rows }).map((_, i) => (
      <Skeleton key={i} className="h-10 w-full" />
    ))}
  </div>
);

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
  // Out of stock (24 Oct 2026): reorder and critical levels are no longer part of the workflow.
  const lowItems = (data?.items ?? []).filter((it) => stockStateOf(it) === "Out of Stock");

  /** How long the oldest request has waited; red from three days. */
  const waited = (iso: string | null): Task["age"] => {
    if (!iso) return undefined;
    const days = differenceInCalendarDays(now, parseISO(iso));
    if (days <= 0) return { text: "Filed today", overdue: false };
    return { text: `Oldest waiting ${days} ${plural(days, "day", "days")}`, overdue: days >= 3 };
  };

  const tasks = [
    pendingPRs.length > 0 && {
      key: "prs",
      icon: FileText,
      count: pendingPRs.length,
      title: `${plural(pendingPRs.length, "purchase request", "purchase requests")} awaiting review`,
      detail: [oldestPending && `Oldest filed ${format(parseISO(oldestPending), "d MMM")}`, pendingOffices.join(", ")]
        .filter(Boolean)
        .join(" · "),
      age: waited(oldestPending),
      to: "/purchase-requests",
    },
    pendingPOs.length > 0 && {
      key: "pos",
      icon: ShoppingCart,
      count: pendingPOs.length,
      title: `${plural(pendingPOs.length, "purchase order", "purchase orders")} awaiting approval`,
      detail: `${formatPHP(pendingPOs.reduce((s, p) => s + poTotal(p), 0))} in total`,
      to: "/purchase-orders",
    },
    (data?.risPending ?? 0) > 0 && {
      key: "ris",
      icon: ClipboardList,
      count: data!.risPending,
      title: `${plural(data!.risPending, "requisition slip", "requisition slips")} to approve`,
      detail: "Pending approval",
      to: "/ris",
    },
    pendingRes.length > 0 && {
      key: "res",
      icon: CalendarDays,
      count: pendingRes.length,
      title: `${plural(pendingRes.length, "facility reservation", "facility reservations")} to confirm`,
      detail: `Earliest: ${facilityName(pendingRes[0].facilityId)}, ${format(parseISO(pendingRes[0].date), "EEE d MMM")}, ${clock(pendingRes[0].startTime)}`,
      age: (() => {
        const days = differenceInCalendarDays(parseISO(pendingRes[0].date), now);
        if (days < 0) return undefined;
        return {
          text: days === 0 ? "Earliest is today" : `Earliest in ${days} ${plural(days, "day", "days")}`,
          overdue: days <= 2,
        };
      })(),
      to: "/reservations",
    },
    lowItems.length > 0 && {
      key: "stock",
      icon: Package,
      count: lowItems.length,
      title: `${plural(lowItems.length, "item", "items")} out of stock`,
      detail: lowItems
        .slice(0, 2)
        .map((it) => it.name)
        .join(", "),
      to: "/inventory",
    },
  ].filter(Boolean) as Task[];
  const waiting = tasks.reduce((s, t) => s + t.count, 0);

  const thisMonth = (data?.prs ?? []).filter((p) => isSameMonth(parseISO(p.createdAt), now));
  const stockValue = (data?.items ?? []).reduce((s, it) => s + it.onHand * it.unitPrice, 0);

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
  const today = format(now, "yyyy-MM-dd");

  // Each quick action only for those allowed to use it (the routes check too).
  const actions = [
    can(user, "manage:purchase-requests") && { label: "New purchase request", to: "/purchase-requests/new", primary: true },
    can(user, "manage:ris") && { label: "New requisition slip", to: "/ris/new" },
    can(user, "manage:reservations") && { label: "Book a facility", to: "/reservations/new" },
  ].filter(Boolean) as { label: string; to: string; primary?: boolean }[];

  const summary = loading
    ? "Checking what is waiting on the office…"
    : waiting === 0
      ? "Nothing is waiting on the office today."
      : `${waiting} ${plural(waiting, "item needs", "items need")} your attention today.`;

  return (
    <PageTransition className="w-full max-w-[1400px] space-y-7 pb-10">
      <TodayBanner now={now} name={user?.name ?? "Administrator"} summary={summary} actions={actions} />

      <section aria-labelledby="attention-title">
        <SectionTitle
          id="attention-title"
          title="Needs your attention"
          aside={
            !loading && (
              <span className="text-[13px] text-[#5b606b]">
                {tasks.length === 0 ? "All clear" : `${waiting} ${plural(waiting, "item", "items")}`}
              </span>
            )
          }
        />
        {loading ? (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[148px] w-full rounded-[14px]" />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex items-center gap-4 rounded-[14px] border border-[#e6e6e3] bg-white px-5 py-5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#eaf5ee] text-[#1f7a45]">
              <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-[14.5px] font-medium text-neutral-900">All clear</span>
              <span className="mt-0.5 block text-[13.5px] text-[#5b606b]">
                Nothing is waiting on the office. New requests appear here as they come in.
              </span>
            </span>
          </div>
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
            {tasks.map((t) => (
              <TaskCard key={t.key} task={t} onOpen={() => navigate(t.to)} />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="figures-title">
        <SectionTitle
          id="figures-title"
          title="At a glance"
          aside={<span className="text-[13px] text-[#5b606b]">{format(now, "MMMM yyyy")}</span>}
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {loading ? (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[112px] w-full rounded-[14px]" />)
          ) : (
            <>
              <Figure
                icon={FileText}
                label="Requested this month"
                value={formatPHP(thisMonth.reduce((s, p) => s + prTotal(p), 0))}
                note={`${thisMonth.length} ${plural(thisMonth.length, "purchase request", "purchase requests")}`}
                onOpen={() => navigate("/purchase-requests")}
              />
              <Figure
                icon={ShoppingCart}
                label="Open purchase orders"
                value={formatPHP(openPOs.reduce((s, p) => s + poTotal(p), 0))}
                note={`${openPOs.length} ${plural(openPOs.length, "order", "orders")}`}
                onOpen={() => navigate("/purchase-orders")}
              />
              <Figure
                icon={Wallet}
                label="Stock value"
                value={formatPHP(stockValue)}
                note={`${data?.items.length ?? 0} ${plural(data?.items.length ?? 0, "item", "items")} · ${lowItems.length === 0 ? "none out of stock" : `${lowItems.length} out of stock`}`}
                onOpen={() => navigate("/inventory")}
              />
              <Figure
                icon={ClipboardList}
                label="Slips issued"
                value={String(data?.risReleased ?? 0)}
                note="Requisition and issue slips"
                onOpen={() => navigate("/ris")}
              />
            </>
          )}
        </div>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <Panel
          title="Latest purchase requests"
          aside={<PanelLink label="View all" onClick={() => navigate("/purchase-requests")} />}
        >
          {loading ? (
            <Loading rows={5} />
          ) : (data?.prs.length ?? 0) === 0 ? (
            <Empty>No purchase requests yet. Requests filed on the portal or here appear first in this list.</Empty>
          ) : (
            data!.prs.slice(0, 6).map((pr) => (
              <button
                key={pr.id}
                type="button"
                onClick={() => navigate(`/purchase-requests/${pr.id}`)}
                className="flex w-full items-center gap-4 border-t border-[#f0f0ee] px-5 py-3 text-left transition-colors hover:bg-[#fafaf9] focus-visible:bg-[#fafaf9] focus-visible:outline-none"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-neutral-900">{prSummary(pr)}</span>
                  <span className="mt-0.5 block truncate text-[12.5px] text-[#5b606b]">
                    <span className={MONO}>{pr.prNumber}</span> · {pr.requester} · {pr.departmentCode} ·{" "}
                    {format(parseISO(pr.createdAt), "d MMM")}
                  </span>
                </span>
                <span className={cn("shrink-0 text-[14px] font-medium text-neutral-900", FIG)}>
                  {formatPHP(prTotal(pr))}
                </span>
                <StatusBadge status={pr.status} className="hidden w-[104px] shrink-0 sm:inline-flex" />
              </button>
            ))
          )}
        </Panel>

        <Panel
          title="Facilities this week"
          aside={<PanelLink label="Calendar" onClick={() => navigate("/reservations")} />}
        >
          {loading ? (
            <Loading rows={3} />
          ) : thisWeek.length === 0 ? (
            <Empty>No facility is booked in the next seven days.</Empty>
          ) : (
            thisWeek.map(({ day, bookings }) => (
              <div key={day} className="flex gap-4 border-t border-[#f0f0ee] px-5 py-3.5">
                <div
                  className={cn(
                    "h-fit w-12 shrink-0 rounded-[10px] py-1.5 text-center",
                    day === today ? "bg-[#a6323b] text-white" : "bg-[#f8edef] text-[#84272e]",
                  )}
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.06em]">
                    {day === today ? "Today" : format(parseISO(day), "EEE")}
                  </div>
                  <div className={cn("text-[18px] font-semibold leading-tight", FIG)}>{format(parseISO(day), "d")}</div>
                </div>
                <ul className="min-w-0 flex-1 space-y-2.5">
                  {bookings.map((r) => (
                    <li key={r.id} className="min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-[14px] font-medium text-neutral-900">{facilityName(r.facilityId)}</span>
                        <span className={cn("shrink-0 text-[12.5px] text-[#5b606b]", FIG)}>
                          {clock(r.startTime)}–{clock(r.endTime)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-[#5b606b]">
                        {r.departmentCode} ·
                        {r.status === "Pending" ? (
                          <span className="font-medium text-[#84272e]">Waiting for you</span>
                        ) : (
                          <span>{r.status}</span>
                        )}
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
