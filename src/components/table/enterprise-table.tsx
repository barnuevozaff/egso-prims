import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { ContainerCard } from "@/components/cards/container-card";
import { SectionTitle } from "@/components/typography/typography";
import { Skeleton } from "@/components/feedback/skeleton";
import { EmptyState } from "@/components/feedback/states";
import { IconButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableHeaderRow,
  TableRow,
} from "@/components/table/table-primitives";

/** Per-column presentation options, set via `meta` on a ColumnDef. */
export interface EnterpriseColumnMeta {
  align?: "left" | "right";
  className?: string;
  headerClassName?: string;
}

export interface EnterpriseTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  /** Renders skeleton rows in place of data. */
  loading?: boolean;
  skeletonRows?: number;
  emptyState?: {
    title: string;
    description?: string;
    icon?: React.ComponentType<{ className?: string }>;
    action?: { label: string; onClick: () => void };
  };
  /** Enable client-side pagination. */
  pageSize?: number;
  onRowClick?: (row: TData) => void;
  /** Adds a leading checkbox column with multi-row selection. */
  enableRowSelection?: boolean;
  /** Controlled selection state (TanStack RowSelectionState). */
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: (state: RowSelectionState) => void;
  /** Reports the currently selected row objects whenever selection changes. */
  onSelectedRowsChange?: (rows: TData[]) => void;
  /** Stable row id (recommended with selection); defaults to row index. */
  getRowId?: (row: TData) => string;
  /** Header cells stay pinned while the body scrolls. */
  stickyHeader?: boolean;
  /**
   * Fill the parent's height: the table body becomes the scroll region and
   * pagination stays pinned below. Parent must constrain height.
   */
  fillContainer?: boolean;
  minWidth?: number;
  className?: string;
}

/**
 * TanStack-powered data grid rendered with the Design Foundation table
 * anatomy. Handles loading skeletons, empty state, selection, sticky
 * headers, and pagination.
 */
export function EnterpriseTable<TData>({
  columns,
  data,
  loading = false,
  skeletonRows = 5,
  emptyState,
  pageSize,
  onRowClick,
  enableRowSelection = false,
  rowSelection: controlledSelection,
  onRowSelectionChange,
  onSelectedRowsChange,
  getRowId,
  stickyHeader = false,
  fillContainer = false,
  minWidth = 900,
  className,
}: EnterpriseTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [internalSelection, setInternalSelection] = React.useState<RowSelectionState>({});
  const selection = controlledSelection ?? internalSelection;

  const allColumns = React.useMemo<ColumnDef<TData, unknown>[]>(() => {
    if (!enableRowSelection) return columns;
    const selectColumn: ColumnDef<TData, unknown> = {
      id: "__select",
      header: ({ table }) => (
        <Checkbox
          aria-label="Select all rows"
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
        />
      ),
      cell: ({ row }) => (
        <span onClick={(e) => e.stopPropagation()} className="flex">
          <Checkbox
            aria-label="Select row"
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
          />
        </span>
      ),
      meta: { headerClassName: "w-10", className: "w-10" },
    };
    return [selectColumn, ...columns];
  }, [columns, enableRowSelection]);

  const table = useReactTable({
    data,
    columns: allColumns,
    state: { sorting, rowSelection: selection },
    onSortingChange: setSorting,
    enableRowSelection,
    onRowSelectionChange: (updater) => {
      const next = typeof updater === "function" ? updater(selection) : updater;
      if (controlledSelection === undefined) setInternalSelection(next);
      onRowSelectionChange?.(next);
    },
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(pageSize
      ? {
          getPaginationRowModel: getPaginationRowModel(),
          initialState: { pagination: { pageSize } },
        }
      : {}),
  });

  const selectedRows = table.getSelectedRowModel().rows;
  const selectionKey = selectedRows.map((r) => r.id).join(",");
  const notifySelected = React.useRef(onSelectedRowsChange);
  notifySelected.current = onSelectedRowsChange;
  React.useEffect(() => {
    notifySelected.current?.(selectedRows.map((r) => r.original));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey]);

  const headerGroups = table.getHeaderGroups();
  const rows = table.getRowModel().rows;
  const showEmpty = !loading && rows.length === 0;
  const showPagination =
    !!pageSize && !showEmpty && !loading && table.getPageCount() > 1;

  // `bg-neutral-50` used to be the sticky ground, which meant a pinned header
  // dropped the accent band the moment it started sticking. `table-head-band`
  // is the same band, made opaque so the rows cannot show through it.
  const stickyHeadClass = stickyHeader
    ? "sticky top-0 z-[5] table-head-band shadow-[inset_0_-1px_0_0_var(--color-border)]"
    : undefined;

  return (
    <div className={cn(fillContainer && "flex h-full min-h-0 flex-col", className)}>
      <div className={cn("overflow-x-auto", fillContainer && "min-h-0 flex-1 overflow-y-auto")}>
        <table className="w-full text-left" style={{ minWidth }}>
          <TableHeader>
            {headerGroups.map((hg) => (
              <TableHeaderRow key={hg.id}>
                {hg.headers.map((header, i) => {
                  const meta = (header.column.columnDef.meta ?? {}) as EnterpriseColumnMeta;
                  return (
                    <TableHead
                      key={header.id}
                      first={i === 0}
                      className={cn(
                        stickyHeadClass,
                        meta.align === "right" && "text-right",
                        meta.headerClassName,
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableHeaderRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: skeletonRows }).map((_, r) => (
                  <TableRow key={r}>
                    {allColumns.map((_, c) => (
                      <TableCell key={c} first={c === 0}>
                        <Skeleton className="h-4 w-full max-w-[120px]" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : rows.map((row) => (
                  <TableRow
                    key={row.id}
                    interactive={!!onRowClick}
                    data-state={row.getIsSelected() ? "selected" : undefined}
                    // Selected rows take the faint burgundy of a selection elsewhere (24 Oct 2026).
                    className={cn(row.getIsSelected() && "bg-[#fdf6f7]")}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  >
                    {row.getVisibleCells().map((cell, i) => {
                      const meta = (cell.column.columnDef.meta ?? {}) as EnterpriseColumnMeta;
                      return (
                        <TableCell
                          key={cell.id}
                          first={i === 0}
                          className={cn(meta.align === "right" && "text-right", meta.className)}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
          </TableBody>
        </table>
        {showEmpty && (
          <div className="border-t border-neutral-100">
            <EmptyState
              title={emptyState?.title ?? "No records found"}
              description={emptyState?.description}
              icon={emptyState?.icon}
              action={emptyState?.action}
            />
          </div>
        )}
      </div>
      {showPagination && (
        <TablePagination
          pageIndex={table.getState().pagination.pageIndex}
          pageCount={table.getPageCount()}
          canPrevious={table.getCanPreviousPage()}
          canNext={table.getCanNextPage()}
          onPrevious={() => table.previousPage()}
          onNext={() => table.nextPage()}
        />
      )}
    </div>
  );
}

/** Pagination footer: page indicator + chevron buttons. */
export function TablePagination({
  pageIndex,
  pageCount,
  canPrevious,
  canNext,
  onPrevious,
  onNext,
  className,
}: {
  pageIndex: number;
  pageCount: number;
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-between border-t border-neutral-100 px-5 py-3",
        className,
      )}
    >
      <span className="text-[12.5px] text-neutral-500">
        Page {pageIndex + 1} of {pageCount}
      </span>
      <div className="flex items-center gap-1.5">
        <IconButton aria-label="Previous page" onClick={onPrevious} disabled={!canPrevious}>
          <ChevronLeft />
        </IconButton>
        <IconButton aria-label="Next page" onClick={onNext} disabled={!canNext}>
          <ChevronRight />
        </IconButton>
      </div>
    </div>
  );
}

/** Card wrapper for tables: title row + optional action, flush table body. */
export function TableCard({
  title,
  action,
  toolbar,
  fillContainer = false,
  children,
  className,
}: {
  title?: string;
  action?: { label: string; onClick?: () => void };
  /** Optional toolbar row rendered between the header and the table. */
  toolbar?: React.ReactNode;
  /** Flex-column layout so an inner fillContainer table can scroll. */
  fillContainer?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ContainerCard
      // No seam: a register of records is not itself a document. The seam is
      // reserved for the wizards, which draft one.
      className={cn(fillContainer && "flex h-full min-h-0 flex-col overflow-hidden", className)}
    >
      {title && (
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-100 px-5 py-4">
          <SectionTitle>{title}</SectionTitle>
          {action && (
            <button
              onClick={action.onClick}
              className="text-[12.5px] font-medium text-neutral-500 transition hover:text-neutral-900"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
      {toolbar}
      {children}
    </ContainerCard>
  );
}
