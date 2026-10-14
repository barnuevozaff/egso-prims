import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Activity,
  AlertTriangle,
  Bell,
  Boxes,
  Calendar,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  History,
  Package,
  Plus,
  ShoppingCart,
  Workflow,
} from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

import {
  ActivityTimeline,
  Button,
  CardCarousel,
  Caption,
  CurrencyDisplay,
  DocumentNumber,
  EmptyState,
  EnterpriseTable,
  InfoChip,
  InformationCard,
  MetricCard,
  NotificationCard,
  PageHeader,
  PageTransition,
  ProgressBar,
  ScheduleCard,
  StatusBadge,
  SummaryCard,
  TableCard,
  toast,
  type DocumentStatus,
} from "@/components";
import { listPurchaseRequests } from "@/features/purchase-requests/api";
import {
  departmentByCode,
  prTotal,
  PENDING_PR_STATUSES,
  type PurchaseRequest,
} from "@/features/purchase-requests/types";
import { listInventoryItems } from "@/features/inventory/api";
import { stockStatusOf, type InventoryItem } from "@/features/inventory/types";
import { useAuth } from "@/features/auth/auth-context";
import { useNotifications } from "@/features/notifications/hooks";
import { markAllNotificationsRead } from "@/features/notifications/api";
import { notificationRoute } from "@/features/notifications/types";
import { MODULE_ICON, moduleTone } from "@/features/notifications/module-icons";
import { listReservations } from "@/features/reservations/api";
import { facilityById, type Reservation } from "@/features/reservations/types";
import { listAuditEntries } from "@/features/audit/api";
import { countRows } from "@/lib/db";
import type { AuditEntry } from "@/features/audit/types";
import { useRealtimeRefresh } from "@/features/shared/use-realtime";
import { reportLoadFailure } from "@/features/shared/load-guard";

/* ---------------- live data ---------------- */

interface DashboardData {
  prs: PurchaseRequest[];
  poPending: number;
  risPending: number;
  risIssued: number;
  items: InventoryItem[];
  reservations: Reservation[];
  audit: AuditEntry[];
  poCount: number;
}

function useDashboardData() {
  const [data, setData] = React.useState<DashboardData | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      /*
       * Purchase orders and issue slips only ever reach this screen as four
       * numbers, and the activity panel only ever shows the newest five
       * entries. They were being loaded whole: every order and every slip in
       * the office crossed the wire so that four tiles could print a count,
       * and the entire audit trail — the fastest-growing table there is — so
       * that five lines could be listed. The counts are counted by the
       * database now and the trail is asked for five rows.
       */
      const [prs, poPending, poCount, risPending, risIssued, items, reservations, audit] =
        await Promise.all([
          listPurchaseRequests(),
          countRows("purchase_orders", ["Pending Approval"]),
          countRows("purchase_orders"),
          countRows("ris_requests", ["Pending Approval"]),
          countRows("ris_requests", ["Released", "Completed"]),
          listInventoryItems(),
          listReservations(),
          listAuditEntries({ limit: DASHBOARD_ACTIVITY_LIMIT }),
        ]);
      setData({
        prs,
        poPending,
        poCount,
        risPending,
        risIssued,
        items,
        reservations,
        audit,
      });
    } catch (e) {
      // Without this the six fetches rejected into nothing: `data` stayed null,
      // every tile read zero and every panel read empty, and the first screen
      // after sign-in reported a quiet office instead of a failed load. Every
      // other list in the system already says so; this one now does too.
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

/* ---------------- presentation mappers ---------------- */


const moduleActivity: Record<string, { icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  "Purchase Requests": { icon: FileText, tone: "text-emerald-600 bg-emerald-50" },
  "Purchase Orders": { icon: ShoppingCart, tone: "text-blue-600 bg-blue-50" },
  RIS: { icon: ClipboardList, tone: "text-violet-600 bg-violet-50" },
  Inventory: { icon: Boxes, tone: "text-amber-600 bg-amber-50" },
  Reservations: { icon: CalendarDays, tone: "text-sky-600 bg-sky-50" },
  Authentication: { icon: History, tone: "text-neutral-600 bg-neutral-100" },
  Reports: { icon: Activity, tone: "text-blue-600 bg-blue-50" },
  System: { icon: Workflow, tone: "text-orange-600 bg-orange-50" },
};

/** How many notifications the dashboard panel shows before deferring to the drawer. */
const DASHBOARD_NOTIFICATION_LIMIT = 5;

/** How many audit entries the activity panel shows — and asks the database for. */
const DASHBOARD_ACTIVITY_LIMIT = 5;

/* ---------------- Page ---------------- */

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, loading } = useDashboardData();
  const today = format(new Date(), "yyyy-MM-dd");

  const {
    data: notifications,
    loading: notificationsLoading,
    refresh: refreshNotifications,
    unreadCount,
  } = useNotifications({ limit: DASHBOARD_NOTIFICATION_LIMIT });

  const markAllRead = React.useCallback(async () => {
    try {
      await markAllNotificationsRead();
      await refreshNotifications();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to mark notifications read.");
    }
  }, [refreshNotifications]);

  const pendingPRs = data?.prs.filter((p) => PENDING_PR_STATUSES.includes(p.status)).length ?? 0;
  const lowStock =
    data?.items.filter((it) => stockStatusOf(it) !== "Available").length ?? 0;
  const totalUnits = data?.items.reduce((s, it) => s + it.onHand, 0) ?? 0;

  /*
   * Each tile counts what is standing on the desk right now; none of them
   * compares today with anything, so none of them has a direction. They used
   * to claim one anyway, and the claim contradicted itself: "awaiting
   * approval" was printed in green under Purchase Orders and in red under the
   * Requisition and Issue Slips directly beside it. The line under the value
   * is a caption now, and the colour is spent where it means something.
   */
  const stats = [
    { label: "Pending Purchase Requests", value: pendingPRs, icon: FileText, trend: { label: "awaiting review", direction: "none" as const } },
    { label: "Pending Purchase Orders", value: data?.poPending ?? 0, icon: ShoppingCart, trend: { label: "awaiting approval", direction: "none" as const } },
    { label: "Pending Requisition and Issue Slips", value: data?.risPending ?? 0, icon: ClipboardList, trend: { label: "awaiting approval", direction: "none" as const } },
    { label: "Inventory Alerts", value: lowStock, icon: AlertTriangle, trend: { label: "low, critical & out of stock", direction: "none" as const } },
  ];

  const prColumns = React.useMemo<ColumnDef<PurchaseRequest, unknown>[]>(
    () => [
      {
        header: "PR Number",
        accessorKey: "prNumber",
        cell: ({ row }) => (
          <DocumentNumber
            value={row.original.prNumber}
            chipColor={departmentByCode(row.original.departmentCode).color}
          />
        ),
      },
      { header: "Department", accessorKey: "departmentCode", meta: { className: "text-neutral-600" } },
      { header: "Requester", accessorKey: "requester", meta: { className: "text-neutral-600" } },
      {
        header: "Purpose",
        accessorKey: "purpose",
        cell: ({ getValue }) => (
          <span className="block max-w-[240px] truncate">{getValue<string>()}</span>
        ),
        meta: { className: "text-neutral-600" },
      },
      {
        header: "Amount",
        id: "amount",
        accessorFn: (pr) => prTotal(pr),
        cell: ({ row }) => <CurrencyDisplay amount={prTotal(row.original)} />,
      },
      {
        header: "Status",
        accessorKey: "status",
        cell: ({ getValue }) => <StatusBadge status={getValue<DocumentStatus>()} />,
      },
      {
        header: "Created",
        accessorKey: "createdAt",
        cell: ({ getValue }) => (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-neutral-500">
            <Clock className="h-3.5 w-3.5" />
            {formatDistanceToNow(new Date(getValue<string>()), { addSuffix: true })}
          </span>
        ),
      },
    ],
    [],
  );

  const operationalSummary = [
    { name: "Inventory Summary", meta: "Live stock position", gradient: "from-blue-100 to-cyan-100", icon: Package, stat: `${totalUnits.toLocaleString()} units` },
    { name: "Recent Purchase Orders", meta: "Across all suppliers", gradient: "from-violet-100 to-fuchsia-100", icon: ShoppingCart, stat: `${data?.poCount ?? 0} orders` },
    { name: "Recent RIS", meta: "Released & completed", gradient: "from-emerald-100 to-lime-100", icon: ClipboardList, stat: `${data?.risIssued ?? 0} issued` },
    { name: "Upcoming Reservations", meta: "Pending & approved", gradient: "from-sky-100 to-indigo-100", icon: CalendarDays, stat: `${data?.reservations.filter((r) => ["Pending", "Approved"].includes(r.status)).length ?? 0} scheduled` },
    { name: "Low Stock Items", meta: "Requires attention", gradient: "from-rose-100 to-orange-100", icon: AlertTriangle, stat: `${lowStock} items` },
    { name: "Pending Approvals", meta: "Across departments", gradient: "from-amber-100 to-yellow-100", icon: ClipboardCheck, stat: `${pendingPRs + (data?.poPending ?? 0) + (data?.risPending ?? 0)} pending` },
  ];

  /**
   * Stock on hand measured against the point the office reorders at.
   *
   * The bar used to fill against `reorderLevel * 3`. There is no capacity or
   * maximum-stock column in the schema, so that ×3 was not a figure the office
   * keeps — it was picked to make a bar move, and it rendered as a percentage
   * of nothing. `reorderLevel` is a real number a supply officer sets and can
   * state, so the bar now fills towards it and the caption says so. Full means
   * "at or above the reorder point", not "as much as we could hold".
   */
  const inventoryHealth = (data?.items ?? []).slice(0, 5).map((it) => {
    const status = stockStatusOf(it);
    return {
      name: it.name,
      onHand: it.onHand,
      reorderLevel: it.reorderLevel,
      unit: it.unit,
      pct: Math.min(100, Math.round((it.onHand / Math.max(1, it.reorderLevel)) * 100)),
      tone: status === "Available" ? ("success" as const) : status === "Low Stock" ? ("warning" as const) : ("danger" as const),
    };
  });

  const todaysReservations = (data?.reservations ?? [])
    .filter((r) => r.date === today && !["Cancelled", "Rejected"].includes(r.status))
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .slice(0, 4)
    .map((r) => {
      const facility = facilityById(r.facilityId);
      return {
        time: r.startTime,
        title: `${facility?.name ?? "Facility"} — ${r.purpose}`,
        meta: departmentByCode(r.departmentCode).code,
        tone: facility?.color ?? "bg-blue-500",
      };
    });

  const recentActivity = (data?.audit ?? []).slice(0, DASHBOARD_ACTIVITY_LIMIT).map((e) => {
    const pres = moduleActivity[e.module] ?? moduleActivity.System;
    return {
      icon: pres.icon,
      tone: pres.tone,
      text: `${e.action}${e.documentNumber ? ` · ${e.documentNumber}` : ""} — ${e.user}`,
      time: formatDistanceToNow(new Date(e.timestamp), { addSuffix: true }),
    };
  });

  return (
    <PageTransition className="space-y-6">
      <PageHeader
        title={`Welcome back, ${user?.name ?? "Administrator"}`}
        description="Monitor procurement requests, inventory, issuances, and facility reservations across all municipal departments."
        actions={
          <>
            <InfoChip icon={Calendar} className="hidden sm:flex">
              {format(new Date(), "d MMMM yyyy")}
            </InfoChip>
            <Button onClick={() => navigate("/purchase-requests/new")}>
              <Plus />
              New Purchase Request
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <MetricCard key={s.label} {...s} loading={loading} />
        ))}
      </div>

      <TableCard
        title="Recent Purchase Requests"
        action={{ label: "View All", onClick: () => navigate("/purchase-requests") }}
      >
        <EnterpriseTable
          columns={prColumns}
          data={(data?.prs ?? []).slice(0, 6)}
          loading={loading}
          skeletonRows={6}
          onRowClick={(pr) => navigate(`/purchase-requests/${pr.id}`)}
        />
      </TableCard>

      <CardCarousel title="Operational Summary">
        {operationalSummary.map((card) => (
          <SummaryCard key={card.name} {...card} />
        ))}
      </CardCarousel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <InformationCard
          icon={Boxes}
          title="Inventory Health"
          action={{ label: "View", onClick: () => navigate("/inventory") }}
        >
          <Caption className="mb-3 block">On hand against reorder point</Caption>
          <ul className="space-y-3">
            {inventoryHealth.map((item) => (
              <li key={item.name}>
                <div className="flex items-center justify-between gap-3 text-[12.5px]">
                  <span className="truncate text-neutral-700">{item.name}</span>
                  <span className="shrink-0 tabular-nums text-neutral-500">
                    {item.onHand.toLocaleString()} / {item.reorderLevel.toLocaleString()} {item.unit}
                  </span>
                </div>
                <ProgressBar value={item.pct} tone={item.tone} className="mt-1.5" />
              </li>
            ))}
          </ul>
        </InformationCard>

        <ScheduleCard meta="Today" events={todaysReservations} />

        <InformationCard
          icon={Activity}
          title="Recent Activity"
          action={{ label: "Audit Trail", onClick: () => navigate("/audit") }}
        >
          <ActivityTimeline items={recentActivity} />
        </InformationCard>

        <InformationCard
          icon={Bell}
          title="System Notifications"
          action={
            unreadCount > 0
              ? { label: "Mark all read", onClick: () => void markAllRead() }
              : undefined
          }
        >
          {notifications.length === 0 ? (
            <EmptyState
              icon={Bell}
              title={notificationsLoading ? "Loading notifications…" : "Nothing to review"}
              description={
                notificationsLoading
                  ? undefined
                  : "Notifications appear here as requests move through approval."
              }
            />
          ) : (
            <ul className="space-y-3">
              {notifications.map((n) => {
                const route = notificationRoute(n);
                return (
                  <li key={n.id}>
                    <NotificationCard
                      icon={MODULE_ICON[n.module] ?? Bell}
                      tone={moduleTone(n.module)}
                      title={n.title}
                      body={n.description}
                      time={formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      unread={!n.isRead}
                      onClick={route ? () => navigate(route) : undefined}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </InformationCard>
      </div>

      <div className="h-4" />
    </PageTransition>
  );
}
