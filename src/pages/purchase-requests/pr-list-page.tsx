import * as React from "react";
import { useNavigate } from "react-router-dom";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { FileText, Plus } from "lucide-react";

import {
  Button,
  CurrencyDisplay,
  DeleteModal,
  DepartmentChip,
  DocumentNumber,
  DropdownFilter,
  EnterpriseTable,
  ExportButton,
  FilterBar,
  PageHeader,
  PageTransition,
  PrintButton,
  SearchBar,
  StatusBadge,
  TableCard,
  toast,
} from "@/components";
import {
  deletePurchaseRequests,
  exportPurchaseRequestsCsv,
} from "@/features/purchase-requests/api";
import { usePurchaseRequests } from "@/features/purchase-requests/hooks";
import { formatDate } from "@/features/purchase-requests/lib";
import {
  DEPARTMENTS,
  PR_STATUSES,
  departmentByCode,
  prTotal,
  type PRStatus,
  type PurchaseRequest,
} from "@/features/purchase-requests/types";
import { PRBulkBar } from "@/features/purchase-requests/components/pr-bulk-bar";
import { PRDrawer } from "@/features/purchase-requests/components/pr-drawer";

const ALL = "__all";

export function PRListPage() {
  const navigate = useNavigate();

  const [search, setSearch] = React.useState("");
  const [department, setDepartment] = React.useState(ALL);
  const [status, setStatus] = React.useState(ALL);

  const filters = React.useMemo(
    () => ({
      search: search || undefined,
      departmentCode: department === ALL ? undefined : department,
      status: status === ALL ? undefined : (status as PRStatus),
    }),
    [search, department, status],
  );

  const { data, loading, refresh } = usePurchaseRequests(filters);

  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [selectedRows, setSelectedRows] = React.useState<PurchaseRequest[]>([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = React.useState(false);

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const openDrawer = (pr: PurchaseRequest) => {
    setActiveId(pr.id);
    setDrawerOpen(true);
  };


  const downloadCsv = (rows: PurchaseRequest[], suffix: string) => {
    const blob = new Blob([exportPurchaseRequestsCsv(rows)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `purchase-requests-${suffix}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} purchase request${rows.length === 1 ? "" : "s"}`);
  };

  const removeRows = async (rows: PurchaseRequest[]) => {
    try {
      await deletePurchaseRequests(rows.map((r) => r.id));
    } catch (e) {
      // A rejected delete used to leave the rows selected, the table
      // unchanged and nothing said — indistinguishable from a click that
      // never landed.
      toast.error(e instanceof Error ? e.message : "Unable to delete purchase requests");
      return;
    }
    setRowSelection({});
    toast.success(`Deleted ${rows.length} purchase request${rows.length === 1 ? "" : "s"}`);
    void refresh();
  };

  const columns = React.useMemo<ColumnDef<PurchaseRequest, unknown>[]>(
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
      {
        header: "Office",
        accessorKey: "departmentCode",
        cell: ({ row }) => {
          const dept = departmentByCode(row.original.departmentCode);
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
          <span className="block max-w-[260px] truncate">{getValue<string>()}</span>
        ),
        meta: { className: "text-neutral-600" },
      },
      {
        header: "Total Amount",
        id: "total",
        accessorFn: (pr) => prTotal(pr),
        cell: ({ row }) => <CurrencyDisplay amount={prTotal(row.original)} />,
        meta: { align: "right" },
      },
      {
        header: "Created",
        accessorKey: "createdAt",
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-neutral-500">{formatDate(getValue<string>())}</span>
        ),
      },
      {
        header: "Status",
        accessorKey: "status",
        cell: ({ getValue }) => <StatusBadge status={getValue<PRStatus>()} />,
      },

    ],
    [navigate],
  );

  return (
    <PageTransition className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title="Purchase Requests"
        description="Create, track, and process procurement requests across all municipal offices."
        actions={
          <Button onClick={() => navigate("/purchase-requests/new")}>
            <Plus />
            New Purchase Request
          </Button>
        }
      />

      <div className="min-h-0 flex-1">
        <TableCard
          fillContainer
          toolbar={
            <FilterBar
              className="shrink-0"
              end={
                <>
                  <ExportButton onClick={() => downloadCsv(data, "all")} disabled={data.length === 0} />
                  <PrintButton onClick={() => window.print()} />
                </>
              }
            >
              <SearchBar
                placeholder="Search PR number, requester, purpose…"
                widthClassName="w-64"
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
                  ...PR_STATUSES.map((s) => ({ value: s, label: s })),
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
            pageSize={15}
            minWidth={1000}
            enableRowSelection
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            onSelectedRowsChange={setSelectedRows}
            getRowId={(pr) => pr.id}
            onRowClick={openDrawer}
            emptyState={{
              icon: FileText,
              title: "No purchase requests found",
              description:
                "Try adjusting the filters, or create a new purchase request to get started.",
              action: { label: "New Purchase Request", onClick: () => navigate("/purchase-requests/new") },
            }}
          />
        </TableCard>
      </div>

      <PRBulkBar
        count={selectedRows.length}
        onExport={() => downloadCsv(selectedRows, "selection")}
        onPrint={() => window.print()}
        onDelete={() => setConfirmBulkDelete(true)}
        onClear={() => setRowSelection({})}
      />

      <DeleteModal
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        title={`Delete ${selectedRows.length} purchase request${selectedRows.length === 1 ? "" : "s"}?`}
        description="Selected requests and their attachments, comments, and history will be permanently removed."
        onConfirm={async () => {
          await removeRows(selectedRows);
          setConfirmBulkDelete(false);
        }}
      />

      <PRDrawer
        prId={activeId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onChanged={() => void refresh()}
        onEdit={(id) => navigate(`/purchase-requests/${id}/edit`)}
      />
    </PageTransition>
  );
}
