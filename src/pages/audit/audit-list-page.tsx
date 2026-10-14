import * as React from "react";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import {
  Activity,
  FileDown,
  FileSpreadsheet,
  GitCommitVertical,
  History,
  ServerCog,
  ShieldAlert,
  Table as TableIcon,
  UserRound,
  Users,
} from "lucide-react";

import {
  ContainerCard,
  DepartmentChip,
  DropdownFilter,
  Button,
  EnterpriseTable,
  FilterBar,
  MetricCard,
  PageHeader,
  PageTransition,
  PrintButton,
  SearchBar,
  StatusBadge,
  TableCard,
  toast,
} from "@/components";
import { exportAuditCsv } from "@/features/audit/api";
import { useAuditEntries } from "@/features/audit/hooks";
import {
  AUDIT_ACTIONS,
  AUDIT_MODULES,
  AUDIT_SEVERITIES,
  AUDIT_USERS,
  type AuditAction,
  type AuditEntry,
  type AuditModule,
  type AuditSeverity,
} from "@/features/audit/types";
import { DEPARTMENTS, departmentByCode } from "@/features/purchase-requests/types";
import { printReport } from "@/features/reports/print";
import { useBranding } from "@/features/config/use-appearance";
import { exportExcelFile } from "@/features/reports/export";
import { AuditTimeline } from "@/features/audit/components/audit-timeline";
import { BulkActionBar } from "@/features/shared/bulk-action-bar";
import { AuditDrawer } from "@/features/audit/components/audit-drawer";

const ALL = "__all";

export function AuditListPage() {
  const branding = useBranding();
  const [search, setSearch] = React.useState("");
  const [dateRange] = React.useState<DateRange | undefined>();
  const [user, setUser] = React.useState(ALL);
  const [department, setDepartment] = React.useState(ALL);
  const [module, setModule] = React.useState(ALL);
  const [action, setAction] = React.useState(ALL);
  const [severity, setSeverity] = React.useState(ALL);

  const filters = React.useMemo(
    () => ({
      search: search || undefined,
      dateFrom: dateRange?.from,
      dateTo: dateRange?.to,
      user: user === ALL ? undefined : user,
      departmentCode: department === ALL ? undefined : department,
      module: module === ALL ? undefined : (module as AuditModule),
      action: action === ALL ? undefined : (action as AuditAction),
      severity: severity === ALL ? undefined : (severity as AuditSeverity),
    }),
    [search, dateRange, user, department, module, action, severity],
  );

  const { data, loading } = useAuditEntries(filters);
  // KPI figures always reflect the whole register, independent of filters.
  const stats = useAuditEntries(React.useMemo(() => ({}), []));

  const today = format(new Date(), "yyyy-MM-dd");
  const last24h = Date.now() - 86_400_000;
  const totalLogs = stats.data.length;
  const todayCount = stats.data.filter((e) => e.timestamp.slice(0, 10) === today).length;
  const activeUsers = new Set(
    stats.data.filter((e) => new Date(e.timestamp).getTime() >= last24h).map((e) => e.user),
  ).size;
  const failedLogins = stats.data.filter((e) => e.action === "Failed Login").length;
  const criticalEvents = stats.data.filter((e) => e.severity === "Critical").length;

  /** Module with the most recorded activity across the whole register. */
  const mostActiveModule = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of stats.data) counts.set(e.module, (counts.get(e.module) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return top ? { module: top[0], count: top[1] } : null;
  }, [stats.data]);

  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [selectedRows, setSelectedRows] = React.useState<AuditEntry[]>([]);

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  /** The table stays the default; the timeline is an optional alternate view. */
  const [view, setView] = React.useState<"table" | "timeline">("table");

  const openEntry = (id: string) => {
    setActiveId(id);
    setDrawerOpen(true);
  };

  const downloadCsv = (rows: AuditEntry[], suffix: string) => {
    const blob = new Blob([exportAuditCsv(rows)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-trail-${suffix}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} log entr${rows.length === 1 ? "y" : "ies"}`);
  };

  /** Columns shared by the Excel and print exports. */
  const EXPORT_COLUMNS = [
    "Timestamp",
    "User",
    "Email",
    "Office",
    "Module",
    "Action",
    "Document",
    "IP",
    "Severity",
    "Status",
  ];
  const exportRows = (rows: AuditEntry[]) =>
    rows.map((e) => [
      format(new Date(e.timestamp), "d MMM yyyy h:mm a"),
      e.user,
      e.email ?? "—",
      e.departmentCode,
      e.module,
      e.action,
      e.documentNumber ?? "—",
      e.ip,
      e.severity,
      e.status,
    ]);

  const downloadExcel = (rows: AuditEntry[]) => {
    exportExcelFile(
      `audit-trail-${format(new Date(), "yyyy-MM-dd")}.xls`,
      "General Services Office — Audit Trail",
      EXPORT_COLUMNS,
      exportRows(rows),
      [
        { label: "Total Entries", value: String(rows.length) },
        { label: "Generated", value: format(new Date(), "d MMMM yyyy h:mm a") },
      ],
    );
    toast.success(`Exported ${rows.length} log entr${rows.length === 1 ? "y" : "ies"}`);
  };

  const exportPrintable = (rows: AuditEntry[]) => {
    const ok = printReport({
      title: "Audit Trail Report",
      organizationName: branding.organizationName,
      officeName: branding.officeName,
      province: branding.province,
      columns: ["Timestamp", "User", "Office", "Module", "Action", "Document", "IP", "Severity", "Status"],
      rows: rows.map((e) => [
        format(new Date(e.timestamp), "d MMM yyyy h:mm a"),
        e.user,
        e.departmentCode,
        e.module,
        e.action,
        e.documentNumber ?? "—",
        e.ip,
        e.severity,
        e.status,
      ]),
    });
    if (ok) toast.success("Audit Trail Report ready for print / save as PDF");
    else toast.error("Pop-up blocked — allow pop-ups to print reports");
  };

  const columns = React.useMemo<ColumnDef<AuditEntry, unknown>[]>(
    () => [
      {
        header: "Timestamp",
        accessorKey: "timestamp",
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap tabular-nums text-neutral-600">
            {format(new Date(getValue<string>()), "d MMM · h:mm a")}
          </span>
        ),
      },
      {
        header: "User",
        accessorKey: "user",
        cell: ({ row }) => (
          <span className="block whitespace-nowrap">
            <span className="font-medium text-neutral-800">{row.original.user}</span>
            <span className="block text-[11px] text-neutral-400">{row.original.userRole}</span>
          </span>
        ),
      },
      {
        header: "Office",
        accessorKey: "departmentCode",
        cell: ({ getValue }) => {
          const dept = departmentByCode(getValue<string>());
          return <DepartmentChip code={dept.code} name={dept.name} color={dept.color} />;
        },
      },
      {
        header: "Module",
        accessorKey: "module",
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-neutral-600">{getValue<string>()}</span>
        ),
      },
      {
        header: "Action",
        accessorKey: "action",
        cell: ({ getValue }) => (
          <span className="block max-w-[190px] truncate font-medium text-neutral-800">
            {getValue<string>()}
          </span>
        ),
      },
      {
        header: "Document",
        accessorKey: "documentNumber",
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap font-medium text-neutral-700">
            {getValue<string>() ?? <span className="text-neutral-300">—</span>}
          </span>
        ),
      },
      {
        header: "IP Address",
        accessorKey: "ip",
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap tabular-nums text-neutral-500">
            {getValue<string>()}
          </span>
        ),
      },
      {
        header: "Severity",
        accessorKey: "severity",
        cell: ({ getValue }) => <StatusBadge status={getValue<AuditSeverity>()} />,
      },
      {
        header: "Status",
        accessorKey: "status",
        cell: ({ getValue }) => <StatusBadge status={getValue<"Success" | "Failed">()} />,
      },
    ],
    [],
  );

  return (
    <PageTransition className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title="Audit Trail"
        description="Complete, immutable log of every user action and system event across General Services Office."
        actions={
          <Button onClick={() => exportPrintable(data)} disabled={data.length === 0}>
            <FileDown />
            Export PDF
          </Button>
        }
      />

      <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <MetricCard label="Total Audit Logs" value={totalLogs} icon={History} loading={stats.loading} />
        <MetricCard label="Today's Activities" value={todayCount} icon={Activity} loading={stats.loading} />
        <MetricCard label="Active Users (24h)" value={activeUsers} icon={Users} loading={stats.loading} />
        <MetricCard label="Failed Login Attempts" value={failedLogins} icon={UserRound} loading={stats.loading} />
        {/* Text-valued KPI: same ContainerCard pattern the Energy dashboard uses. */}
        <ContainerCard hoverable className="p-4">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-neutral-100 text-neutral-600">
              <ServerCog className="h-3.5 w-3.5" />
            </div>
            <span className="text-[12px] text-neutral-500">Most Active Module</span>
          </div>
          <div className="mt-3 truncate text-[14px] font-semibold tracking-tight text-neutral-900">
            {mostActiveModule?.module ?? "—"}
          </div>
          {mostActiveModule && (
            <div className="mt-0.5 text-[12.5px] tabular-nums text-neutral-500">
              {mostActiveModule.count.toLocaleString("en-PH")} activities
            </div>
          )}
        </ContainerCard>
        <MetricCard label="Critical Events" value={criticalEvents} icon={ShieldAlert} loading={stats.loading} />
      </div>

      <div className="min-h-0 flex-1">
        <TableCard
          fillContainer
          toolbar={
            <FilterBar
              className="shrink-0"
              end={
                <>
                  {/* Table stays default; timeline is the optional view. */}
                  <div className="inline-flex overflow-hidden rounded-lg border border-neutral-200">
                    {(["table", "timeline"] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => setView(v)}
                        className={
                          "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium capitalize transition " +
                          (view === v
                            ? "bg-neutral-900 text-white"
                            : "bg-white text-neutral-600 hover:bg-neutral-50")
                        }
                      >
                        {v === "table" ? (
                          <TableIcon className="h-3.5 w-3.5" />
                        ) : (
                          <GitCommitVertical className="h-3.5 w-3.5" />
                        )}
                        {v}
                      </button>
                    ))}
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => downloadExcel(data)}
                    disabled={data.length === 0}
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 text-neutral-500" />
                    Export Excel
                  </Button>
                  <PrintButton onClick={() => exportPrintable(data)} disabled={data.length === 0} />
                </>
              }
            >
              <SearchBar
                placeholder="Search user, action, document, IP…"
                widthClassName="w-56"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <DropdownFilter
                label="User"
                value={user}
                onChange={setUser}
                options={[
                  { value: ALL, label: "All Users" },
                  ...AUDIT_USERS.map((u) => ({ value: u.name, label: u.name })),
                ]}
              />
              <DropdownFilter
                label="Office"
                value={department}
                onChange={setDepartment}
                options={[
                  { value: ALL, label: "All Offices" },
                  ...DEPARTMENTS.map((d) => ({ value: d.code, label: d.name })),
                ]}
              />
              <DropdownFilter
                label="Module"
                value={module}
                onChange={setModule}
                options={[
                  { value: ALL, label: "All Modules" },
                  ...AUDIT_MODULES.map((m) => ({ value: m, label: m })),
                ]}
              />
              <DropdownFilter
                label="Action"
                value={action}
                onChange={setAction}
                options={[
                  { value: ALL, label: "All Actions" },
                  ...AUDIT_ACTIONS.map((a) => ({ value: a, label: a })),
                ]}
              />
              <DropdownFilter
                label="Severity"
                value={severity}
                onChange={setSeverity}
                options={[
                  { value: ALL, label: "All Severities" },
                  ...AUDIT_SEVERITIES.map((s) => ({ value: s, label: s })),
                ]}
              />
            </FilterBar>
          }
        >
          {view === "timeline" ? (
            <div className="min-h-0 flex-1 overflow-auto">
              <AuditTimeline
                entries={data}
                loading={loading}
                onSelect={(e) => openEntry(e.id)}
              />
            </div>
          ) : (
            <EnterpriseTable
              columns={columns}
              data={data}
              loading={loading}
              skeletonRows={9}
              fillContainer
              stickyHeader
              pageSize={14}
              minWidth={1240}
              enableRowSelection
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              onSelectedRowsChange={setSelectedRows}
              getRowId={(e) => e.id}
              onRowClick={(e) => openEntry(e.id)}
              emptyState={{
                icon: History,
                title: "No log entries match",
                description: "Try widening the date range or clearing filters.",
              }}
            />
          )}
        </TableCard>
      </div>

      <BulkActionBar
        count={selectedRows.length}
        onExport={() => downloadCsv(selectedRows, "selection")}
        onPrint={() => exportPrintable(selectedRows)}
        onClear={() => setRowSelection({})}
      />


      <AuditDrawer entryId={activeId} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </PageTransition>
  );
}
