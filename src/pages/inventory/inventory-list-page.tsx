import * as React from "react";
import { useNavigate } from "react-router-dom";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { format } from "date-fns";
import {
  ArrowLeftRight,
  Boxes,
  Package,
  PackageX,
  Plus,
  ScanLine,
  Wallet,
} from "lucide-react";

import {
  Button,
  CurrencyDisplay,
  DeleteModal,
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
  TableCard,
  toast,
} from "@/components";
import { deleteInventoryItems, exportInventoryCsv } from "@/features/inventory/api";
import { useInventoryCategories, useInventoryItems, useStockCard } from "@/features/inventory/hooks";
import {
  categoryColor,
  itemValue,
  stockStateOf,
  type InventoryItem,
  type ItemCategory,
} from "@/features/inventory/types";
import { BulkActionBar } from "@/features/shared/bulk-action-bar";
import { InvDrawer } from "@/features/inventory/components/inv-drawer";

const ALL = "__all";

export function InventoryListPage() {
  const navigate = useNavigate();

  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState(ALL);
  // In stock or not (24 Oct 2026): reorder and critical levels are not part of the workflow.
  const [stockState, setStockState] = React.useState(ALL);

  const filters = React.useMemo(
    () => ({
      search: search || undefined,
      category: category === ALL ? undefined : (category as ItemCategory),
    }),
    [search, category],
  );

  const { data: allRows, loading, refresh } = useInventoryItems(filters);
  const data = React.useMemo(
    () => (stockState === ALL ? allRows : allRows.filter((it) => stockStateOf(it) === stockState)),
    [allRows, stockState],
  );
  // KPI figures always reflect the whole register, independent of filters.
  const stats = useInventoryItems(React.useMemo(() => ({}), []));
  const movements = useStockCard(null);
  // Standard, added and in-use categories, shared with Add Item and Scan / Import.
  const { categories } = useInventoryCategories(stats.data);

  const totalItems = stats.data.length;
  const availableUnits = stats.data.reduce((sum, it) => sum + it.onHand, 0);
  const outOfStockCount = stats.data.filter((it) => stockStateOf(it) === "Out of Stock").length;
  const inventoryValue = stats.data.reduce((sum, it) => sum + itemValue(it), 0);
  const today = new Date().toISOString().slice(0, 10);
  const movementsToday = movements.data.filter((e) => e.date.slice(0, 10) === today).length;

  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [selectedRows, setSelectedRows] = React.useState<InventoryItem[]>([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = React.useState(false);

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [activeId, setActiveId] = React.useState<string | null>(null);


  const refreshAll = () => {
    void refresh();
    void stats.refresh();
    void movements.refresh();
  };

  const downloadCsv = (rows: InventoryItem[], suffix: string) => {
    const blob = new Blob([exportInventoryCsv(rows)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-${suffix}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} item${rows.length === 1 ? "" : "s"}`);
  };

  const removeRows = async (rows: InventoryItem[]) => {
    try {
      await deleteInventoryItems(rows.map((r) => r.id));
    } catch (e) {
      // A rejected delete used to leave the rows selected, the table
      // unchanged and nothing said — indistinguishable from a click that
      // never landed.
      toast.error(e instanceof Error ? e.message : "Unable to delete the items");
      return;
    }
    setRowSelection({});
    toast.success(`Deleted ${rows.length} item${rows.length === 1 ? "" : "s"}`);
    refreshAll();
  };

  const columns = React.useMemo<ColumnDef<InventoryItem, unknown>[]>(
    () => [
      {
        header: "Item Code",
        accessorKey: "itemCode",
        cell: ({ row }) => (
          <DocumentNumber
            value={row.original.itemCode}
            chipColor={categoryColor(row.original.category)}
          />
        ),
      },
      {
        header: "Item Name",
        accessorKey: "name",
        cell: ({ getValue }) => (
          <span className="block max-w-[220px] truncate font-medium text-neutral-800">
            {getValue<string>()}
          </span>
        ),
      },
      {
        header: "Category",
        accessorKey: "category",
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-neutral-600">{getValue<string>()}</span>
        ),
      },
      {
        header: "Unit",
        accessorKey: "unit",
        meta: { className: "text-neutral-500" },
      },
      {
        header: "Stock",
        accessorKey: "onHand",
        cell: ({ getValue }) => (
          <span className="tabular-nums font-medium text-neutral-900">{getValue<number>()}</span>
        ),
        meta: { align: "right" },
      },
      {
        header: "Unit Price",
        accessorKey: "unitPrice",
        cell: ({ getValue }) => <CurrencyDisplay amount={getValue<number>()} muted />,
        meta: { align: "right" },
      },
      {
        header: "Total Value",
        id: "value",
        accessorFn: (it) => itemValue(it),
        cell: ({ row }) => <CurrencyDisplay amount={itemValue(row.original)} />,
        meta: { align: "right" },
      },
      {
        header: "Status",
        id: "status",
        accessorFn: (it) => stockStateOf(it),
        cell: ({ row }) => <StatusBadge status={stockStateOf(row.original)} />,
      },
      {
        header: "Updated",
        accessorKey: "updatedAt",
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-neutral-500">
            {format(new Date(getValue<string>()), "d MMM yyyy")}
          </span>
        ),
      },

    ],
    [navigate],
  );

  return (
    <PageTransition className="flex flex-col gap-4 lg:h-full lg:min-h-0">
      <PageHeader
        title="Inventory"
        description="The municipal stock register: items, stock on hand and every receipt and issue."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate("/inventory/import")}>
              <ScanLine className="h-3.5 w-3.5 text-neutral-500" />
              Scan / Import Items
            </Button>
            <Button onClick={() => navigate("/inventory/new")}>
              <Plus />
              Add Item
            </Button>
          </>
        }
      />

      <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Total Inventory Items" tone="brand" value={totalItems} icon={Boxes} loading={stats.loading} />
        <MetricCard label="Available Stock (units)" tone="positive" value={availableUnits} icon={Package} loading={stats.loading} />
        <MetricCard label="Out of Stock" tone="critical" value={outOfStockCount} icon={PackageX} loading={stats.loading} />
        <MetricCard label="Inventory Value" kind="peso" value={inventoryValue} icon={Wallet} loading={stats.loading} />
        <MetricCard
          label="Stock Movements Today"
          value={movementsToday}
          icon={ArrowLeftRight}
          loading={movements.loading}
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
                </>
              }
            >
              <SearchBar
                placeholder="Search code, name, category…"
                widthClassName="w-52"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <DropdownFilter
                label="Category"
                value={category}
                onChange={setCategory}
                options={[
                  { value: ALL, label: "All Categories" },
                  ...categories.map((c) => ({ value: c, label: c })),
                ]}
              />
              <DropdownFilter
                label="Stock"
                value={stockState}
                onChange={setStockState}
                options={[
                  { value: ALL, label: "All Items" },
                  { value: "Available", label: "In stock" },
                  { value: "Out of Stock", label: "Out of stock" },
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
            getRowId={(it) => it.id}
            onRowClick={(it) => {
              setActiveId(it.id);
              setDrawerOpen(true);
            }}
            emptyState={{
              icon: Boxes,
              title: "No inventory items found",
              description: "Try adjusting the filters, or register a new inventory item.",
              action: { label: "Add Item", onClick: () => navigate("/inventory/new") },
            }}
          />
        </TableCard>
      </div>

      <BulkActionBar
        count={selectedRows.length}
        onDelete={() => setConfirmBulkDelete(true)}
        onClear={() => setRowSelection({})}
      />

      <DeleteModal
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        title={`Delete ${selectedRows.length} item${selectedRows.length === 1 ? "" : "s"}?`}
        description="Selected items and their stock cards and history will be permanently removed. Their item codes are not issued again."
        onConfirm={async () => {
          await removeRows(selectedRows);
          setConfirmBulkDelete(false);
        }}
      />

      <InvDrawer
        itemId={activeId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onChanged={refreshAll}
        onEdit={(id) => navigate(`/inventory/${id}/edit`)}
      />

    </PageTransition>
  );
}
