import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ArrowUpDown,
  BarChart3,
  Boxes,
  CalendarDays,
  ClipboardList,
  FileText,
  ShoppingCart,
  Wallet,
} from "lucide-react";

import {
  CurrencyDisplay,
  DocumentNumber,
  DropdownFilter,
  EnterpriseTable,
  ExportButton,
  FilterBar,
  MetricCard,
  PageHeader,
  PageTransition,
  PrintButton,
  SearchBar,
  SectionTitle,
  StatusBadge,
  TableCard,
  toast,
  type DocumentStatus,
} from "@/components";
import { loadReportsData, reportKpis, type ReportsData } from "@/features/reports/analytics";
import {
  applySearch,
  FILTER_SOURCES,
  REPORT_DEFS,
  reportDefById,
  type FlatRow,
  type ReportColumn,
  type ReportTypeId,
} from "@/features/reports/report-defs";
import { printReport } from "@/features/reports/print";
import { useBranding } from "@/features/config/use-appearance";
import { AnalyticsPanels } from "@/features/reports/components/analytics-panels";
import { DEPARTMENTS } from "@/features/purchase-requests/types";
import { PRDrawer } from "@/features/purchase-requests/components/pr-drawer";
import { PODrawer } from "@/features/purchase-orders/components/po-drawer";
import { RISDrawer } from "@/features/ris/components/ris-drawer";
import { InvDrawer } from "@/features/inventory/components/inv-drawer";
import { ResDrawer } from "@/features/reservations/components/res-drawer";

const ALL = "__all";

export function ReportsPage() {
  const branding = useBranding();
  const [data, setData] = React.useState<ReportsData | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    setData(await loadReportsData());
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const kpis = data ? reportKpis(data) : null;

  /* ---------------- report builder state ---------------- */
  const [reportType, setReportType] = React.useState<ReportTypeId>("pr");
  const def = reportDefById(reportType);

  const [search, setSearch] = React.useState("");
  const [department, setDepartment] = React.useState(ALL);
  const [supplier, setSupplier] = React.useState(ALL);
  const [facility, setFacility] = React.useState(ALL);
  const [category, setCategory] = React.useState(ALL);
  const [status, setStatus] = React.useState(ALL);


  const filters = React.useMemo(
    () => ({
      department: department === ALL ? undefined : department,
      supplier: supplier === ALL ? undefined : supplier,
      facility: facility === ALL ? undefined : facility,
      category: category === ALL ? undefined : category,
      status: status === ALL ? undefined : status,
    }),
    [department, supplier, facility, category, status],
  );

  const rows = React.useMemo(() => {
    if (!data) return [];
    return applySearch(def.build(data, filters), search || undefined);
  }, [data, def, search, filters]);

  const columns = React.useMemo<ColumnDef<FlatRow, unknown>[]>(
    () =>
      def.columns.map((col) => ({
        id: col.id,
        accessorFn: (row: FlatRow) => row.values[col.id],
        header: ({ column }) => (
          <button
            className="inline-flex items-center gap-1 uppercase tracking-wider transition hover:text-neutral-600"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            {col.header}
            <ArrowUpDown className="h-3 w-3 text-neutral-300" />
          </button>
        ),
        cell: ({ row }) => renderCell(col, row.original),
        meta: {
          align: col.kind === "currency" || col.kind === "number" ? ("right" as const) : undefined,
        },
      })),
    [def],
  );

  /* ---------------- drawers ---------------- */
  const [drawer, setDrawer] = React.useState<{ module: FlatRow["drawerModule"]; id: string } | null>(
    null,
  );
  const openRow = (row: FlatRow) => {
    if (row.drawerModule && row.drawerId) setDrawer({ module: row.drawerModule, id: row.drawerId });
  };
  const closeDrawer = (open: boolean) => {
    if (!open) setDrawer(null);
  };

  /* ---------------- exports ---------------- */
  const exportCsv = () => {
    const header = def.columns.map((c) => c.header).join(",");
    const lines = rows.map((r) =>
      def.columns
        .map((c) => {
          const v = String(r.values[c.id] ?? "");
          return v.includes(",") || v.includes('"') ? `"${v.replaceAll('"', '""')}"` : v;
        })
        .join(","),
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${def.id}-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} rows`);
  };

  const exportPrintable = () => {
    const ok = printReport({
      title: def.label,
      organizationName: branding.organizationName,
      officeName: branding.officeName,
      province: branding.province,
      columns: def.columns.map((c) => c.header),
      rows: rows.map((r) => def.columns.map((c) => r.values[c.id] ?? "")),
      // Reports that define footer totals render them above the signatures.
      summary: data ? def.summary?.(rows, data, filters) : undefined,
    });
    if (ok) toast.success(`${def.label} ready for print / save as PDF`);
    else toast.error("Pop-up blocked — allow pop-ups to print reports");
  };

  return (
    <PageTransition className="space-y-4">
      <PageHeader
        title="Reports & Analytics"
        description="Executive analytics and printable operational reports across all GSO modules."
      />

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <MetricCard label="Total Purchase Requests" value={kpis?.totalPRs ?? 0} icon={FileText} loading={loading} />
        <MetricCard label="Total Purchase Orders" value={kpis?.totalPOs ?? 0} icon={ShoppingCart} loading={loading} />
        <MetricCard label="Total RIS" value={kpis?.totalRIS ?? 0} icon={ClipboardList} loading={loading} />
        <MetricCard label="Total Inventory Items" value={kpis?.totalItems ?? 0} icon={Boxes} loading={loading} />
        <MetricCard label="Total Inventory Value" kind="peso" value={kpis?.inventoryValue ?? 0} icon={Wallet} loading={loading} />
        <MetricCard label="Active Facility Reservations" value={kpis?.activeReservations ?? 0} icon={CalendarDays} loading={loading} />
      </div>

      {/* Analytics */}
      <AnalyticsPanels data={data} loading={loading} />

      {/* Report builder */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-neutral-600" />
          <SectionTitle>Report Builder</SectionTitle>
        </div>
        <div className="h-[560px]">
          <TableCard
            fillContainer
            toolbar={
              <FilterBar
                className="shrink-0"
                end={
                  <>
                    <ExportButton label="Export CSV" onClick={exportCsv} disabled={rows.length === 0} />
                    <PrintButton onClick={exportPrintable} disabled={rows.length === 0} />
                  </>
                }
              >
                <DropdownFilter
                  label="Report Type"
                  value={reportType}
                  onChange={(v) => {
                    setReportType(v as ReportTypeId);
                    setStatus(ALL);
                  }}
                  options={REPORT_DEFS.map((d) => ({ value: d.id, label: d.label }))}
                  className="font-semibold"
                />
                <SearchBar
                  placeholder="Search report rows…"
                  widthClassName="w-48"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {def.filters.includes("department") && (
                  <DropdownFilter
                    label="Office"
                    value={department}
                    onChange={setDepartment}
                    options={[
                      { value: ALL, label: "All Offices" },
                      ...DEPARTMENTS.map((d) => ({ value: d.code, label: d.name })),
                    ]}
                  />
                )}
                {def.filters.includes("supplier") && (
                  <DropdownFilter
                    label="Supplier"
                    value={supplier}
                    onChange={setSupplier}
                    options={[
                      { value: ALL, label: "All Suppliers" },
                      ...FILTER_SOURCES.suppliers.map((s) => ({ value: s.id, label: s.name })),
                    ]}
                  />
                )}
                {def.filters.includes("facility") && (
                  <DropdownFilter
                    label="Facility"
                    value={facility}
                    onChange={setFacility}
                    options={[
                      { value: ALL, label: "All Facilities" },
                      ...FILTER_SOURCES.facilities.map((f) => ({ value: f.id, label: f.name })),
                    ]}
                  />
                )}
                {def.filters.includes("category") && (
                  <DropdownFilter
                    label="Category"
                    value={category}
                    onChange={setCategory}
                    options={[
                      { value: ALL, label: "All Categories" },
                      ...FILTER_SOURCES.categories.map((c) => ({ value: c, label: c })),
                    ]}
                  />
                )}
                {def.filters.includes("status") && def.statusOptions && (
                  <DropdownFilter
                    label="Status"
                    value={status}
                    onChange={setStatus}
                    options={[
                      { value: ALL, label: "All Statuses" },
                      ...def.statusOptions.map((s) => ({ value: s, label: s })),
                    ]}
                  />
                )}
              </FilterBar>
            }
          >
            <EnterpriseTable
              columns={columns}
              data={rows}
              loading={loading}
              skeletonRows={8}
              fillContainer
              stickyHeader
              pageSize={12}
              minWidth={1000}
              getRowId={(r) => r.id}
              onRowClick={openRow}
              emptyState={{
                icon: BarChart3,
                title: "No records match this report",
                description: "Try widening the date range or clearing filters.",
              }}
            />
          </TableCard>
        </div>
      </section>

      {/* Module drawers — report rows open the owning module's drawer */}
      <PRDrawer
        prId={drawer?.module === "pr" ? drawer.id : null}
        open={drawer?.module === "pr"}
        onOpenChange={closeDrawer}
        onChanged={() => void load()}
      />
      <PODrawer
        poId={drawer?.module === "po" ? drawer.id : null}
        open={drawer?.module === "po"}
        onOpenChange={closeDrawer}
        onChanged={() => void load()}
      />
      <RISDrawer
        risId={drawer?.module === "ris" ? drawer.id : null}
        open={drawer?.module === "ris"}
        onOpenChange={closeDrawer}
        onChanged={() => void load()}
      />
      <InvDrawer
        itemId={drawer?.module === "inv" ? drawer.id : null}
        open={drawer?.module === "inv"}
        onOpenChange={closeDrawer}
        onChanged={() => void load()}
      />
      <ResDrawer
        resId={drawer?.module === "res" ? drawer.id : null}
        open={drawer?.module === "res"}
        onOpenChange={closeDrawer}
        onChanged={() => void load()}
      />
    </PageTransition>
  );
}

function renderCell(col: ReportColumn, row: FlatRow) {
  const value = row.values[col.id];
  switch (col.kind) {
    case "docnum":
      return <DocumentNumber value={String(value)} chipColor={row.chipColor} />;
    case "currency":
      return <CurrencyDisplay amount={Number(value)} />;
    case "number":
      return <span className="tabular-nums font-medium text-neutral-900">{value}</span>;
    case "badge":
      return <StatusBadge status={value as DocumentStatus} />;
    case "muted":
      return (
        <span className="block max-w-[240px] truncate text-neutral-600">{String(value)}</span>
      );
    default:
      return (
        <span className="block max-w-[240px] truncate font-medium text-neutral-800">
          {String(value)}
        </span>
      );
  }
}
