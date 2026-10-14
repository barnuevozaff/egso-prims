import * as React from "react";
import { useNavigate } from "react-router-dom";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import {
  Boxes,
  CheckCircle2,
  ClipboardList,
  Clock3,
  PackageCheck,
  Plus,
} from "lucide-react";

import {
  Button,
  DeleteModal,
  DepartmentChip,
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
  StatusBadge,
  TableCard,
  toast,
} from "@/components";
import { deleteRequests, exportRequestsCsv } from "@/features/ris/api";
import { useRequests } from "@/features/ris/hooks";
import { formatDate } from "@/features/ris/lib";
import {
  RIS_STATUSES,
  risTotalIssued,
  type RISStatus,
  type RequestForIssuance,
} from "@/features/ris/types";
import { DEPARTMENTS, departmentByCode } from "@/features/purchase-requests/types";

/** Statuses at which the slip has actually been issued from stock. */
const ISSUED_STATUSES: RISStatus[] = ["Released", "Completed"];
import { BulkActionBar } from "@/features/shared/bulk-action-bar";
import { RISDrawer } from "@/features/ris/components/ris-drawer";

const ALL = "__all";

export function RISListPage() {
  const navigate = useNavigate();

  const [search, setSearch] = React.useState("");
  const [department, setDepartment] = React.useState(ALL);
  const [status, setStatus] = React.useState(ALL);

  const filters = React.useMemo(
    () => ({
      search: search || undefined,
      departmentCode: department === ALL ? undefined : department,
      status: status === ALL ? undefined : (status as RISStatus),
    }),
    [search, department, status],
  );

  const { data, loading, refresh } = useRequests(filters);
  // KPI figures always reflect the whole register, independent of filters.
  const stats = useRequests(React.useMemo(() => ({}), []));

  const pendingCount = stats.data.filter((r) => r.status === "Pending Approval").length;
  const approvedCount = stats.data.filter((r) => r.status === "Approved").length;
  const releasedCount = stats.data.filter((r) => r.status === "Released").length;
  const itemsIssued = stats.data
    .filter((r) => ["Released", "Completed"].includes(r.status))
    .reduce((sum, r) => sum + risTotalIssued(r), 0);

  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [selectedRows, setSelectedRows] = React.useState<RequestForIssuance[]>([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = React.useState(false);

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [activeId, setActiveId] = React.useState<string | null>(null);


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

  const removeRows = async (rows: RequestForIssuance[]) => {
    try {
      await deleteRequests(rows.map((r) => r.id));
    } catch (e) {
      // A rejected delete used to leave the rows selected, the table
      // unchanged and nothing said — indistinguishable from a click that
      // never landed.
      toast.error(e instanceof Error ? e.message : "Unable to delete the slips");
      return;
    }
    setRowSelection({});
    toast.success(`Deleted ${rows.length} slip${rows.length === 1 ? "" : "s"}`);
    refreshAll();
  };

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
        // A slip is only issued once it is released. Before that the name on
        // the record is whoever prepared it, which read as an issuance that
        // had not happened.
        header: "Issued By",
        accessorKey: "issuedBy",
        cell: ({ row, getValue }) =>
          ISSUED_STATUSES.includes(row.original.status) ? (
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
        description="Issue supplies from central stock against approved purchase requests."
        actions={
          <Button onClick={() => navigate("/ris/new")}>
            <Plus />
            New RIS
          </Button>
        }
      />

      <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Pending RIS" value={pendingCount} icon={Clock3} loading={stats.loading} />
        <MetricCard
          label="Approved RIS"
          value={approvedCount}
          icon={CheckCircle2}
          loading={stats.loading}
        />
        <MetricCard
          label="Released RIS"
          value={releasedCount}
          icon={PackageCheck}
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
              end={
                <>
                  <ExportButton
                    onClick={() => downloadCsv(data, "all")}
                    disabled={data.length === 0}
                  />
                  <PrintButton onClick={() => window.print()} />
                </>
              }
            >
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
                  ...DEPARTMENTS.map((d) => ({ value: d.code, label: d.name })),
                ]}
              />
              <DropdownFilter
                label="Status"
                value={status}
                onChange={setStatus}
                options={[
                  { value: ALL, label: "All Statuses" },
                  ...RIS_STATUSES.map((s) => ({ value: s, label: s })),
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
            onRowClick={(r) => {
              setActiveId(r.id);
              setDrawerOpen(true);
            }}
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

      <BulkActionBar
        count={selectedRows.length}
        onExport={() => downloadCsv(selectedRows, "selection")}
        onPrint={() => window.print()}
        onDelete={() => setConfirmBulkDelete(true)}
        onClear={() => setRowSelection({})}
      />

      <DeleteModal
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        title={`Delete ${selectedRows.length} slip${selectedRows.length === 1 ? "" : "s"}?`}
        description="Selected slips and their attachments, comments, and history will be permanently removed."
        onConfirm={async () => {
          await removeRows(selectedRows);
          setConfirmBulkDelete(false);
        }}
      />

      <RISDrawer
        risId={activeId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onChanged={refreshAll}
        onEdit={(id) => navigate(`/ris/${id}/edit`)}
      />
    </PageTransition>
  );
}
