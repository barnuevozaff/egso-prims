import * as React from "react";
import { useNavigate } from "react-router-dom";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { Ban, FileText, MoreHorizontal, Plus, Printer, Trash2 } from "lucide-react";

import {
  Button,
  Checkbox,
  CurrencyDisplay,
  DeleteModal,
  DepartmentChip,
  DropdownFilter,
  EnterpriseTable,
  Field,
  FilterBar,
  IconButton,
  PageHeader,
  PageTransition,
  SearchBar,
  StatusBadge,
  StatusTabs,
  TableCard,
  Textarea,
  WarningModal,
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
import { VOIDABLE_PR_STATUSES, cancelPurchaseRequest } from "@/features/purchase-requests/api";
import { usePurchaseRequests } from "@/features/purchase-requests/hooks";
import { formatDate } from "@/features/purchase-requests/lib";
import {
  PR_STATUSES,
  departmentByCode,
  prTotal,
  type PRStatus,
  type PurchaseRequest,
  prSummary,
} from "@/features/purchase-requests/types";
import { useOfficeOptions } from "@/features/offices/use-offices";
import { PRBulkBar } from "@/features/purchase-requests/components/pr-bulk-bar";
import { usePRPrint } from "@/features/purchase-requests/components/use-pr-print";
import { DEMO_CLEANUP, deleteDemoPurchaseRequests } from "@/features/purchase-requests/demo-cleanup";

const ALL = "__all";

export function PRListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [search, setSearch] = React.useState("");
  const [department, setDepartment] = React.useState(ALL);
  const [status, setStatus] = React.useState(ALL);

  // Status is a tab, filtered here, so each tab can show its own count.
  const filters = React.useMemo(
    () => ({
      search: search || undefined,
      departmentCode: department === ALL ? undefined : department,
    }),
    [search, department],
  );

  const { data: allRows, loading, refresh } = usePurchaseRequests(filters);
  const data = React.useMemo(
    () => (status === ALL ? allRows : allRows.filter((r) => r.status === status)),
    [allRows, status],
  );
  const tabs = [
    { value: ALL, label: "All", count: allRows.length },
    ...PR_STATUSES.map((s) => ({
      value: s,
      label: s,
      count: allRows.filter((r) => r.status === s).length,
    })).filter((t) => t.count > 0 || t.value === status),
  ];

  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [selectedRows, setSelectedRows] = React.useState<PurchaseRequest[]>([]);
  // The requests the void dialog is open for, and how many selected ones were already closed.
  const [voidTarget, setVoidTarget] = React.useState<{ rows: PurchaseRequest[]; skipped: number } | null>(null);
  // Kept while each dialog closes, so its text does not change as it fades out.
  const [voidOpen, setVoidOpen] = React.useState(false);
  const [voidReason, setVoidReason] = React.useState("");
  const [voidError, setVoidError] = React.useState<string | undefined>();
  const [voiding, setVoiding] = React.useState(false);
  // Local demo only: synthetic requests picked for deletion, and the "these are test records" tick.
  const [deleteTarget, setDeleteTarget] = React.useState<PurchaseRequest[] | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const { options: officeOptions } = useOfficeOptions();

  // A request opens on its own page, ready to edit while it can be (30 Oct 2026).
  const openRequest = (pr: PurchaseRequest) => navigate(`/purchase-requests/${encodeURIComponent(pr.id)}`);

  // Prints the official Purchase Request documents, never this screen.
  const { print, sheet } = usePRPrint();

  // Every purchase request is numbered when it is filed, so none is ever
  // deleted: an Administrator voids it (voidPurchaseRequest, 21 Oct 2026).
  const isAdmin = user?.role === "Administrator";
  const openVoid = React.useCallback((rows: PurchaseRequest[], skipped = 0) => {
    setVoidError(undefined);
    setVoidTarget({ rows, skipped });
    setVoidOpen(true);
  }, []);

  // Deleting is test-data cleanup, offered only on the local demo build (DEMO_CLEANUP).
  const canDemoDelete = DEMO_CLEANUP && isAdmin;
  const openDelete = React.useCallback((rows: PurchaseRequest[]) => {
    setDeleteConfirmed(false);
    setDeleteTarget(rows);
    setDeleteOpen(true);
  }, []);

  const deleteRows = async (rows: PurchaseRequest[]) => {
    setDeleting(true);
    try {
      const { deleted, refused } = await deleteDemoPurchaseRequests(rows.map((r) => r.id));
      if (deleted.length > 0) {
        toast.success(`Deleted ${deleted.length} demo purchase request${deleted.length === 1 ? "" : "s"}`);
      }
      if (refused.length > 0) toast.error(refused.map((r) => r.reason).join(" · "));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The demo records could not be deleted");
    }
    setDeleting(false);
    setDeleteOpen(false);
    setRowSelection({});
    void refresh();
  };

  /**
   * Numbered requests are voided, never deleted: the status becomes
   * Cancelled and the number, record and history stay. Each request is voided
   * on its own, so one that cannot be voided (closed, or with a purchase
   * order still in force) is reported without stopping the rest.
   */
  const voidRows = async (rows: PurchaseRequest[]) => {
    const reason = voidReason.trim();
    if (!reason) {
      setVoidError("Give a reason. It is kept in each request's approval timeline.");
      return;
    }
    setVoiding(true);
    const failed: string[] = [];
    for (const pr of rows) {
      try {
        await cancelPurchaseRequest(pr.id, { reason, by: user?.name ?? "Staff", office: user?.office });
      } catch (e) {
        failed.push(`${pr.prNumber}: ${e instanceof Error ? e.message : "could not be voided"}`);
      }
    }
    setVoiding(false);
    const voided = rows.length - failed.length;
    if (voided > 0) toast.success(`Voided ${voided} purchase request${voided === 1 ? "" : "s"}`);
    if (failed.length > 0) toast.error(failed.join(" · "));
    setVoidOpen(false);
    setVoidReason("");
    setRowSelection({});
    void refresh();
  };

  // Only requests still open can be voided; closed ones are left out of the count.
  const voidable = selectedRows.filter((r) => VOIDABLE_PR_STATUSES.includes(r.status));

  const columns = React.useMemo<ColumnDef<PurchaseRequest, unknown>[]>(
    () => [
      {
        header: "Request",
        accessorKey: "purpose",
        cell: ({ row }) => (
          <div className="min-w-0 max-w-[420px]">
            <div className="truncate font-medium text-neutral-900">{prSummary(row.original)}</div>
            <div className="mt-0.5 truncate text-[12.5px] text-[#5b606b]">
              <span className="font-['Geist_Mono',ui-monospace,monospace]">{row.original.prNumber}</span>
              {" · "}
              {row.original.requester}
            </div>
          </div>
        ),
      },
      {
        header: "Office",
        accessorKey: "departmentCode",
        cell: ({ row }) => {
          const dept = departmentByCode(row.original.departmentCode);
          return <DepartmentChip code={dept.code} name={dept.name} />;
        },
      },
      {
        header: "Amount",
        id: "total",
        accessorFn: (pr) => prTotal(pr),
        cell: ({ row }) => <CurrencyDisplay amount={prTotal(row.original)} />,
        meta: { align: "right" },
      },
      {
        header: "Filed",
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
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const pr = row.original;
          const canVoid = isAdmin && VOIDABLE_PR_STATUSES.includes(pr.status);
          return (
            // The menu is not a row click: opening it leaves the drawer closed.
            <span onClick={(e) => e.stopPropagation()} className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton variant="ghost" aria-label={`Actions for ${pr.prNumber}`} className="size-11 text-[#5b606b]">
                    <MoreHorizontal />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem className="min-h-10 text-[13.5px]" onSelect={() => print([pr])}>
                    <Printer />
                    Print request
                  </DropdownMenuItem>
                  {canVoid && (
                    <>
                      <DropdownMenuSeparator />
                      {/* Voiding keeps the record, so it is not styled as a deletion. */}
                      <DropdownMenuItem className="min-h-10 text-[13.5px]" onSelect={() => openVoid([pr])}>
                        <Ban />
                        Void request…
                      </DropdownMenuItem>
                    </>
                  )}
                  {canDemoDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        className="min-h-10 text-[13.5px]"
                        onSelect={() => openDelete([pr])}
                      >
                        <Trash2 />
                        Delete (demo only)…
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
    [isAdmin, canDemoDelete, print, openVoid, openDelete],
  );

  return (
    <PageTransition className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title="Purchase requests"
        description="Review what the offices filed and move it to a purchase order."
        actions={
          <Button onClick={() => navigate("/purchase-requests/new")}>
            <Plus />
            New purchase request
          </Button>
        }
      />

      <div className="min-h-0 flex-1">
        <TableCard
          fillContainer
          toolbar={
            <FilterBar
              className="shrink-0"
            >
              <StatusTabs tabs={tabs} value={status} onChange={setStatus} />
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
            pageSize={15}
            minWidth={1000}
            enableRowSelection
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            onSelectedRowsChange={setSelectedRows}
            getRowId={(pr) => pr.id}
            onRowClick={openRequest}
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
        onPrint={() => print(selectedRows)}
        printLabel={selectedRows.length === 1 ? "Print" : `Print ${selectedRows.length}`}
        onVoid={isAdmin && voidable.length > 0 ? () => openVoid(voidable, selectedRows.length - voidable.length) : undefined}
        voidLabel={voidable.length === 1 ? "Void request" : `Void ${voidable.length} requests`}
        voidTone="neutral"
        onDelete={canDemoDelete ? () => openDelete(selectedRows) : undefined}
        deleteLabel={canDemoDelete ? "Delete (demo)" : undefined}
        onClear={() => setRowSelection({})}
      />

      {sheet}

      <WarningModal
        open={voidOpen}
        onOpenChange={(open) => {
          if (!open) {
            setVoidOpen(false);
            setVoidReason("");
          }
        }}
        title={
          voidTarget?.rows.length === 1
            ? `Void ${voidTarget.rows[0].prNumber}?`
            : `Void ${voidTarget?.rows.length ?? 0} purchase requests?`
        }
        description={`The status becomes Cancelled. Nothing is deleted: the tracking reference, any official PR number, the items and the history are kept, and the reason is recorded with your name and the time. A request with a purchase order or slip still in force is not voided.${
          voidTarget && voidTarget.skipped > 0
            ? ` ${voidTarget.skipped} selected request${voidTarget.skipped === 1 ? " is" : "s are"} already closed and will be left as ${voidTarget.skipped === 1 ? "it is" : "they are"}.`
            : ""
        }`}
        confirmLabel={voidTarget?.rows.length === 1 ? "Void request" : "Void requests"}
        loading={voiding}
        onConfirm={() => voidTarget && void voidRows(voidTarget.rows)}
      >
        <Field label="Reason" required error={voidError} className="mt-4">
          <Textarea
            value={voidReason}
            maxLength={500}
            rows={3}
            onChange={(e) => {
              setVoidReason(e.target.value);
              if (voidError) setVoidError(undefined);
            }}
          />
        </Field>
      </WarningModal>

      {canDemoDelete && (
        <DeleteModal
          open={deleteOpen}
          onOpenChange={(open) => {
            if (!open) setDeleteOpen(false);
          }}
          title={
            deleteTarget?.length === 1
              ? `Delete ${deleteTarget[0].prNumber} from the demo?`
              : `Delete ${deleteTarget?.length ?? 0} purchase requests from the demo?`
          }
          description={`Local demo only. ${
            deleteTarget?.length === 1 ? "This test record is" : `These ${deleteTarget?.length ?? 0} test records are`
          } removed from the demo database for good. Requests a purchase order or slip was raised from are kept, and numbers are never reused. Official requests are never deleted: in the real system they are voided.`}
          confirmLabel={deleteTarget?.length === 1 ? "Delete 1 record" : `Delete ${deleteTarget?.length ?? 0} records`}
          confirmDisabled={!deleteConfirmed}
          loading={deleting}
          onConfirm={() => deleteTarget && void deleteRows(deleteTarget)}
        >
          <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-3 rounded-[10px] border border-[#e6e6e3] px-3 py-3 text-[13.5px] text-neutral-900">
            <Checkbox
              className="mt-0.5"
              checked={deleteConfirmed}
              onCheckedChange={(v) => setDeleteConfirmed(v === true)}
            />
            <span>{deleteTarget?.length === 1 ? "This is test data" : "These are test data"}. Delete permanently.</span>
          </label>
        </DeleteModal>
      )}

    </PageTransition>
  );
}
