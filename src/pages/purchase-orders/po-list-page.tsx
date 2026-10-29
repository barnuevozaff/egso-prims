import * as React from "react";
import { useNavigate } from "react-router-dom";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { Ban, Eye, MoreHorizontal, Printer, ShoppingCart } from "lucide-react";

import {
  CurrencyDisplay,
  DepartmentChip,
  DropdownFilter,
  EnterpriseTable,
  ExportButton,
  FilterBar,
  IconButton,
  PageHeader,
  PageTransition,
  SearchBar,
  StatusBadge,
  StatusTabs,
  TableCard,
  toast,
} from "@/components";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/features/auth/auth-context";
import { can } from "@/features/auth/types";
import { cancelPurchaseOrder, exportPurchaseOrdersCsv } from "@/features/purchase-orders/api";
import { usePurchaseOrders } from "@/features/purchase-orders/hooks";
import { formatDate } from "@/features/purchase-orders/lib";
import {
  PO_STATUSES,
  canVoidPO,
  poTotal,
  supplierById,
  type POStatus,
  type PurchaseOrder,
} from "@/features/purchase-orders/types";
import { useOfficeOptions } from "@/features/offices/use-offices";
import { departmentByCode } from "@/features/purchase-requests/types";
import { BulkActionBar } from "@/features/shared/bulk-action-bar";
import { VoidDialog } from "@/features/shared/void-dialog";
import { usePOPrint } from "@/features/purchase-orders/components/use-po-print";

const ALL = "__all";

/** The supplier as recorded; blank until completed on the order or by hand. */
const supplierOf = (po: PurchaseOrder) => po.supplierName?.trim() || supplierById(po.supplierId)?.name || "";

/**
 * Purchase orders (redesigned 21 Oct 2026, after the Purchase requests list).
 * An order is created when its request is approved, so there is no "new"
 * button: each row opens the order's page, where its details are completed
 * and the official form is printed.
 */
export function POListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const admin = can(user, "manage:purchase-orders");

  const [search, setSearch] = React.useState("");
  const [department, setDepartment] = React.useState(ALL);
  const [status, setStatus] = React.useState(ALL);

  // Status is a tab, filtered here, so each tab can show its own count.
  const filters = React.useMemo(
    () => ({ search: search || undefined, departmentCode: department === ALL ? undefined : department }),
    [search, department],
  );
  const { data: allRows, loading, refresh } = usePurchaseOrders(filters);
  const data = React.useMemo(
    () => (status === ALL ? allRows : allRows.filter((r) => r.status === status)),
    [allRows, status],
  );
  const tabs = [
    { value: ALL, label: "All", count: allRows.length },
    ...PO_STATUSES.map((s) => ({ value: s, label: s, count: allRows.filter((r) => r.status === s).length })).filter(
      (t) => t.count > 0 || t.value === status,
    ),
  ];

  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [selectedRows, setSelectedRows] = React.useState<PurchaseOrder[]>([]);
  const { options: officeOptions } = useOfficeOptions();
  const [voidRows, setVoidRows] = React.useState<PurchaseOrder[] | null>(null);
  // Prints the official Purchase Orders, never this screen.
  const { print, sheet } = usePOPrint();
  const open = React.useCallback((po: PurchaseOrder) => navigate(`/purchase-orders/${encodeURIComponent(po.id)}`), [navigate]);

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

  // Numbered orders are voided, never deleted; only those not issued to the supplier.
  const voidable = selectedRows.filter(canVoidPO);

  const columns = React.useMemo<ColumnDef<PurchaseOrder, unknown>[]>(
    () => [
      {
        header: "Order",
        id: "order",
        accessorFn: (po) => supplierOf(po),
        cell: ({ row }) => {
          const po = row.original;
          const supplier = supplierOf(po);
          return (
            <div className="min-w-0 max-w-[440px]">
              <div className={supplier ? "truncate font-medium text-neutral-900" : "truncate text-[#6b707a]"}>
                {supplier || "Supplier not set"}
              </div>
              <div className="mt-0.5 truncate text-[12.5px] text-[#5b606b]">
                <span className="font-['Geist_Mono',ui-monospace,monospace]">{po.poNumber}</span> · from{" "}
                {po.prOfficialNumber ?? po.prNumber} · {po.purpose}
              </div>
            </div>
          );
        },
      },
      {
        header: "Office",
        accessorKey: "departmentCode",
        cell: ({ getValue }) => {
          const dept = departmentByCode(getValue<string>());
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
        header: "Date",
        id: "date",
        accessorFn: (po) => po.poDate ?? po.issuedDate,
        cell: ({ getValue }) => <span className="whitespace-nowrap text-neutral-500">{formatDate(getValue<string>())}</span>,
      },
      {
        header: "Status",
        accessorKey: "status",
        cell: ({ getValue }) => <StatusBadge status={getValue<POStatus>()} />,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const po = row.original;
          return (
            // The menu is not a row click.
            <span onClick={(e) => e.stopPropagation()} className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton variant="ghost" aria-label={`Actions for ${po.poNumber}`} className="size-11 text-[#5b606b]">
                    <MoreHorizontal />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem className="min-h-10 text-[13.5px]" onSelect={() => open(po)}>
                    <Eye />
                    View PO
                  </DropdownMenuItem>
                  <DropdownMenuItem className="min-h-10 text-[13.5px]" onSelect={() => print([po])}>
                    <Printer />
                    Print PO
                  </DropdownMenuItem>
                  {admin && canVoidPO(po) && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="min-h-10 text-[13.5px]" onSelect={() => setVoidRows([po])}>
                        <Ban />
                        Void order…
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          );
        },
        meta: { headerClassName: "w-14", className: "w-14 py-1" },
      },
    ],
    [admin, open, print],
  );

  return (
    <PageTransition className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title="Purchase orders"
        description="Created when a purchase request is approved. Complete the details and print the official order."
      />

      <div className="min-h-0 flex-1">
        <TableCard
          fillContainer
          toolbar={
            <FilterBar
              className="shrink-0"
              end={<ExportButton onClick={() => downloadCsv(data, "all")} disabled={data.length === 0} />}
            >
              <StatusTabs tabs={tabs} value={status} onChange={setStatus} />
              <SearchBar
                placeholder="Search PO, PR, purpose…"
                widthClassName="w-64"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <DropdownFilter
                label="Office"
                value={department}
                onChange={setDepartment}
                options={[{ value: ALL, label: "All Offices" }, ...officeOptions]}
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
            getRowId={(po) => po.id}
            onRowClick={open}
            emptyState={{
              icon: ShoppingCart,
              title: "No purchase orders yet",
              description: "A purchase order is created when its purchase request is approved.",
              action: { label: "Go to purchase requests", onClick: () => navigate("/purchase-requests") },
            }}
          />
        </TableCard>
      </div>

      <BulkActionBar
        count={selectedRows.length}
        onPrint={() => print(selectedRows)}
        printLabel={selectedRows.length === 1 ? "Print" : `Print ${selectedRows.length}`}
        onVoid={admin && voidable.length > 0 ? () => setVoidRows(voidable) : undefined}
        voidLabel={voidable.length === 1 ? "Void order" : `Void ${voidable.length} orders`}
        voidTone="neutral"
        onClear={() => setRowSelection({})}
      />

      {sheet}

      <VoidDialog
        open={!!voidRows}
        onOpenChange={(o) => !o && setVoidRows(null)}
        noun="purchase order"
        rows={voidRows ?? []}
        selectedCount={voidRows?.length ?? 0}
        numberOf={(po) => po.poNumber}
        voidOne={(po, reason) => cancelPurchaseOrder(po.id, { reason, by: user?.name ?? "Staff", office: user?.office })}
        onDone={() => {
          setVoidRows(null);
          setRowSelection({});
          void refresh();
        }}
      />
    </PageTransition>
  );
}
