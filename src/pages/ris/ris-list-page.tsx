import * as React from "react";
import { useNavigate } from "react-router-dom";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import {
  Boxes,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Plus,
  XCircle,
} from "lucide-react";

import {
  Button,
  DepartmentChip,
  DocumentNumber,
  DropdownFilter,
  EnterpriseTable,
  ExportButton,
  FilterBar,
  MetricCard,
  PageHeader,
  PageTransition,
  SearchBar,
  StatusBadge,
  StatusTabs,
  TableCard,
  toast,
} from "@/components";
import { useAuth } from "@/features/auth/auth-context";
import { can } from "@/features/auth/types";
import { cancelRequest, exportRequestsCsv } from "@/features/ris/api";
import { useRequests } from "@/features/ris/hooks";
import { formatDate } from "@/features/ris/lib";
import {
  VOIDABLE_RIS_STATUSES,
  risTotalIssued,
  type RISStatus,
  type RequestForIssuance,
} from "@/features/ris/types";
import { useOfficeOptions } from "@/features/offices/use-offices";
import { departmentByCode } from "@/features/purchase-requests/types";

/**
 * Whether the slip has been issued from stock: approved since 22 Oct 2026
 * (approval issues it), or released under the earlier workflow.
 */
const isIssued = (r: RequestForIssuance) =>
  !!r.stockIssuedAt || r.status === "Released" || r.status === "Completed";
import { BulkActionBar } from "@/features/shared/bulk-action-bar";
import { VoidDialog } from "@/features/shared/void-dialog";
import { useRISPrint } from "@/features/ris/components/use-ris-print";

const ALL = "__all";

/** Status tabs (22 Oct 2026). Approved also holds slips released under the earlier workflow. */
const TABS: { value: string; label: string; match: (s: RISStatus) => boolean }[] = [
  { value: "pending", label: "Pending", match: (s) => s === "Draft" || s === "Pending Approval" },
  { value: "approved", label: "Approved", match: (s) => s === "Approved" || s === "Released" || s === "Completed" },
  { value: "rejected", label: "Rejected", match: (s) => s === "Rejected" },
  { value: "voided", label: "Voided", match: (s) => s === "Cancelled" },
  { value: ALL, label: "All", match: () => true },
];

export function RISListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [search, setSearch] = React.useState("");
  const [department, setDepartment] = React.useState(ALL);
  const [tab, setTab] = React.useState("pending");

  // The tab filters here, so each tab can show its own count.
  const filters = React.useMemo(
    () => ({
      search: search || undefined,
      departmentCode: department === ALL ? undefined : department,
    }),
    [search, department],
  );

  const { data: allRows, loading, refresh } = useRequests(filters);
  const activeTab = TABS.find((t) => t.value === tab) ?? TABS[0];
  const data = React.useMemo(() => allRows.filter((r) => activeTab.match(r.status)), [allRows, activeTab]);
  // KPI figures always reflect the whole register, independent of filters.
  const stats = useRequests(React.useMemo(() => ({}), []));

  const pendingCount = stats.data.filter((r) => r.status === "Pending Approval").length;
  const approvedCount = stats.data.filter((r) => TABS[1].match(r.status)).length;
  const rejectedCount = stats.data.filter((r) => r.status === "Rejected").length;
  const itemsIssued = stats.data.filter(isIssued).reduce((sum, r) => sum + risTotalIssued(r), 0);

  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [selectedRows, setSelectedRows] = React.useState<RequestForIssuance[]>([]);
  const [confirmVoid, setConfirmVoid] = React.useState(false);

  const { options: officeOptions } = useOfficeOptions();
  const { print, sheet: printSheet } = useRISPrint();


  const refreshAll = () => {
    void refresh();
    void stats.refresh();
  };

  const downloadCsv = (rows: RequestForIssuance[], suffix: string) => {
    const blob = new Blob([exportRequestsCsv(rows)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ris-${suffix}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} slip${rows.length === 1 ? "" : "s"}`);
  };

  // Numbered slips are voided, never deleted. An issued slip is voided by an
  // Administrator only, and its stock is returned; Completed is final.
  const voidable = selectedRows.filter(
    (r) => VOIDABLE_RIS_STATUSES.includes(r.status) && (!isIssued(r) || user?.role === "Administrator"),
  );
  const issuedSelected = voidable.some(isIssued);

  const columns = React.useMemo<ColumnDef<RequestForIssuance, unknown>[]>(
    () => [
      {
        header: "RIS Number",
        accessorKey: "risNumber",
        cell: ({ row }) => (
          <DocumentNumber
            value={row.original.risNumber}
            chipColor={departmentByCode(row.original.departmentCode).color}
          />
        ),
      },
      {
        header: "Office",
        accessorKey: "departmentCode",
        cell: ({ getValue }) => {
          const dept = departmentByCode(getValue<string>());
          // No swatch here: the control number already carries the office colour.
          return <DepartmentChip code={dept.code} name={dept.name} />;
        },
      },
      {
        header: "Requester",
        accessorKey: "requester",
        meta: { className: "text-neutral-600" },
      },
      {
        header: "Purpose",
        accessorKey: "purpose",
        cell: ({ getValue }) => (
          <span className="block max-w-[220px] truncate">{getValue<string>()}</span>
        ),
        meta: { className: "text-neutral-600" },
      },
      {
        // A slip is issued when it is approved (earlier: released). Before
        // that the name on the record is whoever prepared it, which read as
        // an issuance that had not happened.
        header: "Issued By",
        accessorKey: "issuedBy",
        cell: ({ row, getValue }) =>
          isIssued(row.original) ? (
            <span className="whitespace-nowrap text-neutral-600">{getValue<string>()}</span>
          ) : (
            <span className="text-neutral-400">—</span>
          ),
      },
      {
        header: "Status",
        accessorKey: "status",
        cell: ({ getValue }) => <StatusBadge status={getValue<RISStatus>()} />,
      },
      {
        header: "Date",
        accessorKey: "issueDate",
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-neutral-500">
            {formatDate(getValue<string>())}
          </span>
        ),
      },

    ],
    [navigate],
  );

  return (
    <PageTransition className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title="Requisition and Issue Slips"
        description="Approve requests for supplies from central stock. Approving issues the items and updates inventory."
        actions={
          <Button onClick={() => navigate("/ris/new")}>
            <Plus />
            New RIS
          </Button>
        }
      />

      <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Pending RIS" tone="attention" value={pendingCount} icon={Clock3} loading={stats.loading} />
        <MetricCard
          label="Approved RIS" tone="positive"
          value={approvedCount}
          icon={CheckCircle2}
          loading={stats.loading}
        />
        <MetricCard
          label="Rejected RIS"
          value={rejectedCount}
          icon={XCircle}
          loading={stats.loading}
        />
        <MetricCard label="Items Issued" value={itemsIssued} icon={Boxes} loading={stats.loading} />
      </div>

      <div className="min-h-0 flex-1">
        <TableCard
          fillContainer
          toolbar={
            <FilterBar
              className="shrink-0"
              end={<ExportButton onClick={() => downloadCsv(data, "all")} disabled={data.length === 0} />}
            >
              <StatusTabs tabs={TABS.map((t) => ({ value: t.value, label: t.label, count: allRows.filter((r) => t.match(r.status)).length }))} value={tab} onChange={setTab} />
              <SearchBar
                placeholder="Search RIS, PR, requester…"
                widthClassName="w-56"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <DropdownFilter
                label="Office"
                value={department}
                onChange={setDepartment}
                options={[
                  { value: ALL, label: "All Offices" },
                  ...officeOptions,
                ]}
              />
            </FilterBar>
          }
        >
          <EnterpriseTable
            columns={columns}
            data={data}
            loading={loading}
            skeletonRows={8}
            fillContainer
            stickyHeader
            pageSize={10}
            minWidth={1000}
            enableRowSelection
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            onSelectedRowsChange={setSelectedRows}
            getRowId={(r) => r.id}
            // A slip opens on its own page, ready to edit while it can be (30 Oct 2026).
            onRowClick={(r) => navigate(`/ris/${encodeURIComponent(r.id)}`)}
            emptyState={{
              icon: ClipboardList,
              title: "No issuance slips found",
              description:
                "Try adjusting the filters, or create a new RIS from an approved purchase request.",
              action: { label: "New RIS", onClick: () => navigate("/ris/new") },
            }}
          />
        </TableCard>
      </div>

      {/* Print, Void and Cancel, as on the purchase orders (30 Oct 2026); Print sends the selected slips' official forms. */}
      <BulkActionBar
        count={selectedRows.length}
        onPrint={() => print(selectedRows)}
        onVoid={can(user, "manage:ris") && voidable.length > 0 ? () => setConfirmVoid(true) : undefined}
        onClear={() => setRowSelection({})}
      />
      {printSheet}

      <VoidDialog
        open={confirmVoid}
        onOpenChange={setConfirmVoid}
        noun="slip"
        rows={voidable}
        selectedCount={selectedRows.length}
        numberOf={(r) => r.risNumber}
        voidOne={(r, reason) => cancelRequest(r.id, { reason, by: user?.name ?? "Staff", office: user?.office })}
        extraNote={
          issuedSelected
            ? "Stock an issued slip took is returned to inventory, with a Return line on each item's stock card."
            : undefined
        }
        onDone={() => {
          setRowSelection({});
          refreshAll();
        }}
      />
    </PageTransition>
  );
}
