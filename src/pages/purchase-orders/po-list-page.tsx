import * as React from "react";
import { useNavigate } from "react-router-dom";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import {
  Clock3,
  Plus,
  ShoppingCart,
  Truck,
  Wallet,
} from "lucide-react";

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
  MetricCard,
  PageHeader,
  PageTransition,
  PrintButton,
  SearchBar,
  StatusBadge,
  TableCard,
  toast,
} from "@/components";
import {
  deletePurchaseOrders,
  exportPurchaseOrdersCsv,
} from "@/features/purchase-orders/api";
import { usePurchaseOrders } from "@/features/purchase-orders/hooks";
import { formatDate } from "@/features/purchase-orders/lib";
import {
  PO_STATUSES,
  poTotal,
  poSupplierName,
  type POStatus,
  type PurchaseOrder,
} from "@/features/purchase-orders/types";
import { DEPARTMENTS, departmentByCode } from "@/features/purchase-requests/types";
import { BulkActionBar } from "@/features/shared/bulk-action-bar";
import { PODrawer } from "@/features/purchase-orders/components/po-drawer";

const ALL = "__all";

export function POListPage() {
  const navigate = useNavigate();

  const [search, setSearch] = React.useState("");
  const [department, setDepartment] = React.useState(ALL);
  const [status, setStatus] = React.useState(ALL);

  const filters = React.useMemo(
    () => ({
      search: search || undefined,
      departmentCode: department === ALL ? undefined : department,
      status: status === ALL ? undefined : (status as POStatus),
    }),
    [search, department, status],
  );

  const { data, loading, refresh } = usePurchaseOrders(filters);
  // KPI figures always reflect the whole register, independent of filters.
  const stats = usePurchaseOrders(React.useMemo(() => ({}), []));

  const openCount = stats.data.filter((po) =>
    ["Draft", "Pending Approval", "Approved", "Released"].includes(po.status),
  ).length;
  const pendingCount = stats.data.filter((po) => po.status === "Pending Approval").length;
  const releasedCount = stats.data.filter((po) => po.status === "Released").length;
  const totalValue = stats.data
    .filter((po) => po.status !== "Cancelled")
    .reduce((sum, po) => sum + poTotal(po), 0);

  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [selectedRows, setSelectedRows] = React.useState<PurchaseOrder[]>([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = React.useState(false);

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [activeId, setActiveId] = React.useState<string | null>(null);


  const refreshAll = () => {
    void refresh();
    void stats.refresh();
  };

  const downloadCsv = (rows: PurchaseOrder[], suffix: string) => {
    const blob = new Blob([exportPurchaseOrdersCsv(rows)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `purchase-orders-${suffix}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} purchase order${rows.length === 1 ? "" : "s"}`);
  };

  const removeRows = async (rows: PurchaseOrder[]) => {
    try {
      await deletePurchaseOrders(rows.map((r) => r.id));
    } catch (e) {
      // A rejected delete used to leave the rows selected, the table
      // unchanged and nothing said — indistinguishable from a click that
      // never landed.
      toast.error(e instanceof Error ? e.message : "Unable to delete purchase orders");
      return;
    }
    setRowSelection({});
    toast.success(`Deleted ${rows.length} purchase order${rows.length === 1 ? "" : "s"}`);
    refreshAll();
  };

  const columns = React.useMemo<ColumnDef<PurchaseOrder, unknown>[]>(
    () => [
      {
        header: "PO Number",
        accessorKey: "poNumber",
        cell: ({ row }) => (
          <DocumentNumber
            value={row.original.poNumber}
            chipColor={departmentByCode(row.original.departmentCode).color}
          />
        ),
      },
      {
        header: "Linked PR",
        accessorKey: "prNumber",
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap font-medium text-neutral-700">
            {getValue<string>()}
          </span>
        ),
      },
      {
        header: "Supplier",
        id: "supplier",
        accessorFn: (po) => poSupplierName(po),
        cell: ({ getValue }) => (
          <span className="block max-w-[200px] truncate text-neutral-600">
            {getValue<string>()}
          </span>
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
        header: "Amount",
        id: "total",
        accessorFn: (po) => poTotal(po),
        cell: ({ row }) => <CurrencyDisplay amount={poTotal(row.original)} />,
        meta: { align: "right" },
      },
      {
        header: "Status",
        accessorKey: "status",
        cell: ({ getValue }) => <StatusBadge status={getValue<POStatus>()} />,
      },
      {
        header: "Issued",
        accessorKey: "issuedDate",
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
        title="Purchase Orders"
        description="Issue and track purchase orders raised from approved purchase requests."
        actions={
          <Button onClick={() => navigate("/purchase-orders/new")}>
            <Plus />
            New Purchase Order
          </Button>
        }
      />

      <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Open Purchase Orders"
          value={openCount}
          icon={ShoppingCart}
          loading={stats.loading}
        />
        <MetricCard
          label="Pending Approval"
          value={pendingCount}
          icon={Clock3}
          loading={stats.loading}
        />
        <MetricCard
          label="Released to Suppliers"
          value={releasedCount}
          icon={Truck}
          loading={stats.loading}
        />
        <MetricCard
          label="Total PO Value"
          kind="peso"
          value={totalValue}
          icon={Wallet}
          loading={stats.loading}
        />
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
                placeholder="Search PO, PR, supplier…"
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
                  ...PO_STATUSES.map((s) => ({ value: s, label: s })),
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
            minWidth={1080}
            enableRowSelection
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            onSelectedRowsChange={setSelectedRows}
            getRowId={(po) => po.id}
            onRowClick={(po) => {
              setActiveId(po.id);
              setDrawerOpen(true);
            }}
            emptyState={{
              icon: ShoppingCart,
              title: "No purchase orders found",
              description:
                "Try adjusting the filters, or raise a purchase order from an approved purchase request.",
              action: {
                label: "New Purchase Order",
                onClick: () => navigate("/purchase-orders/new"),
              },
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
        title={`Delete ${selectedRows.length} purchase order${selectedRows.length === 1 ? "" : "s"}?`}
        description="Selected orders and their attachments, comments, and history will be permanently removed."
        onConfirm={async () => {
          await removeRows(selectedRows);
          setConfirmBulkDelete(false);
        }}
      />

      <PODrawer
        poId={activeId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onChanged={refreshAll}
        onEdit={(id) => navigate(`/purchase-orders/${id}/edit`)}
      />
    </PageTransition>
  );
}
