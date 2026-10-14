import * as React from "react";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import type { DateRange } from "react-day-picker";
import { Banknote, Clock3, FileText, Plus, ScrollText, Users } from "lucide-react";

import {
  Button,
  CurrencyDisplay,
  DateFilter,
  DeleteModal,
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
import { BulkActionBar } from "@/features/shared/bulk-action-bar";
import {
  deleteViolators,
  exportViolationsCsv,
  exportViolatorsCsv,
} from "@/features/violations/api";
import { useViolatorProfiles } from "@/features/violations/hooks";
import { summarize } from "@/features/violations/lib";
import { useConfigOptions } from "@/features/config/use-module-config";
import {
  PROFILE_STATUSES,
  type ProfileStatus,
  type Violation,
  type Violator,
  type ViolatorProfile,
} from "@/features/violations/types";
import { ViolatorDrawer } from "@/features/violations/components/violator-drawer";
import { ViolatorForm } from "@/features/violations/components/violator-form";
import { ViolationForm } from "@/features/violations/components/violation-form";
import { PaymentForm } from "@/features/violations/components/payment-form";
import { ViolatorPrintSheet } from "@/features/violations/components/violator-print-sheet";

const ALL = "__all";

/**
 * Violation Management — the violator register.
 *
 * The main record is the person, not the ticket: one row per violator however
 * many violations they hold. Opening a row reveals their full violation and
 * payment history.
 */
export function ViolationListPage() {
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState(ALL);
  const [violationType, setViolationType] = React.useState(ALL);
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>();

  const filters = React.useMemo(
    () => ({
      search: search || undefined,
      status: status === ALL ? undefined : (status as ProfileStatus),
      violationType: violationType === ALL ? undefined : violationType,
      dateFrom: dateRange?.from,
      dateTo: dateRange?.to,
    }),
    [search, status, violationType, dateRange],
  );

  const { data, allProfiles, loading, refresh } = useViolatorProfiles(filters);

  // Summary cards read the whole register, independent of the filters.
  const stats = React.useMemo(() => summarize(allProfiles), [allProfiles]);

  // Violation type is free text on the form, so the filter offers the types
  // configured in Settings plus whatever has actually been recorded —
  // otherwise a typed-in type could never be filtered for.
  const recordedTypes = React.useMemo(
    () => allProfiles.flatMap((p) => p.violations.map((v) => v.violationType)),
    [allProfiles],
  );
  const { options: configuredTypes } = useConfigOptions(
    "Violation Management",
    "violation_types",
    recordedTypes,
  );
  const typeFilterOptions = React.useMemo(
    () => [...configuredTypes].sort((a, b) => a.localeCompare(b)),
    [configuredTypes],
  );

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [selectedRows, setSelectedRows] = React.useState<ViolatorProfile[]>([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = React.useState(false);

  const [profileFormOpen, setProfileFormOpen] = React.useState(false);
  const [editingViolator, setEditingViolator] = React.useState<Violator | null>(null);

  const [violationFormOpen, setViolationFormOpen] = React.useState(false);
  /** Null when adding from the page: the name is typed into the form instead. */
  const [formViolator, setFormViolator] = React.useState<Violator | null>(null);
  const [editingViolation, setEditingViolation] = React.useState<Violation | null>(null);

  /** The module's primary action — no profile step comes before it. */
  const addViolation = () => {
    setFormViolator(null);
    setEditingViolation(null);
    setViolationFormOpen(true);
  };

  const [paymentOpen, setPaymentOpen] = React.useState(false);
  const [payingViolation, setPayingViolation] = React.useState<Violation | null>(null);

  // The profile being printed. Mounting the sheet is what makes it printable,
  // so it renders for one violator at a time and clears afterwards.
  const [printProfile, setPrintProfile] = React.useState<ViolatorProfile | null>(null);

  // Re-read from the loaded set so the open drawer reflects every change
  // (a recorded payment, a new violation) without being handed stale data.
  const activeProfile = React.useMemo(
    () => (activeId ? (allProfiles.find((p) => p.violator.id === activeId) ?? null) : null),
    [allProfiles, activeId],
  );

  const openProfile = (profile: ViolatorProfile) => {
    setActiveId(profile.violator.id);
    setDrawerOpen(true);
  };

  const download = (contents: string, filename: string, message: string) => {
    const blob = new Blob([contents], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(message);
  };

  const exportRegister = () => {
    download(
      exportViolatorsCsv(data),
      "violator-profiles.csv",
      `Exported ${data.length} violator profile${data.length === 1 ? "" : "s"}`,
    );
  };

  /**
   * Removing a profile takes its violations with it — the foreign key
   * cascades — so the confirmation says so before it happens.
   */
  const removeProfiles = async (rows: ViolatorProfile[]) => {
    const tickets = rows.reduce((sum, p) => sum + p.totalViolations, 0);
    try {
      await deleteViolators(rows.map((p) => p.violator.id));
      setRowSelection({});
      // The open drawer may have just been deleted out from under itself.
      if (rows.some((p) => p.violator.id === activeId)) setDrawerOpen(false);
      toast.success(
        `Deleted ${rows.length} violator profile${rows.length === 1 ? "" : "s"}` +
          (tickets > 0 ? ` and ${tickets} violation${tickets === 1 ? "" : "s"}` : ""),
      );
      void refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to delete the selected profiles");
    }
  };

  const exportProfile = (profile: ViolatorProfile) => {
    const slug = profile.violator.fullName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    download(
      exportViolationsCsv(profile),
      `violations-${slug}.csv`,
      `Exported ${profile.totalViolations} violation${profile.totalViolations === 1 ? "" : "s"}`,
    );
  };

  /** Mounts the violator's sheet, then prints once it is in the DOM. */
  const printProfileReport = (profile: ViolatorProfile) => {
    setPrintProfile(profile);
    window.setTimeout(() => {
      window.print();
      setPrintProfile(null);
    }, 80);
  };

  const columns = React.useMemo<ColumnDef<ViolatorProfile, unknown>[]>(
    () => [
      {
        header: "No.",
        id: "index",
        cell: ({ row }) => (
          <span className="tabular-nums text-neutral-500">{row.index + 1}</span>
        ),
      },
      {
        header: "Violator Name",
        id: "name",
        accessorFn: (p) => p.violator.fullName,
        cell: ({ row }) => (
          <div className="min-w-0">
            <span className="block truncate font-medium text-neutral-900">
              {row.original.violator.fullName}
            </span>
            {row.original.violator.contactNumber && (
              <span className="mt-0.5 block truncate text-[11.5px] text-neutral-500">
                {row.original.violator.contactNumber}
              </span>
            )}
          </div>
        ),
      },
      {
        header: "Total Violations",
        id: "total",
        accessorFn: (p) => p.totalViolations,
        cell: ({ getValue }) => (
          <span className="tabular-nums text-neutral-800">{getValue<number>()}</span>
        ),
        meta: { align: "right" },
      },
      {
        header: "Paid",
        id: "paid",
        accessorFn: (p) => p.paidCount,
        cell: ({ getValue }) => (
          <span className="tabular-nums text-(--tone-settled)">{getValue<number>()}</span>
        ),
        meta: { align: "right" },
      },
      {
        header: "Pending",
        id: "pending",
        accessorFn: (p) => p.pendingCount,
        cell: ({ getValue }) => {
          const n = getValue<number>();
          return (
            <span className={`tabular-nums ${n > 0 ? "text-amber-600" : "text-neutral-400"}`}>
              {n}
            </span>
          );
        },
        meta: { align: "right" },
      },
      {
        header: "Total Amount",
        id: "amount",
        accessorFn: (p) => p.totalAmount,
        cell: ({ getValue }) => <CurrencyDisplay amount={getValue<number>()} />,
        meta: { align: "right" },
      },
      {
        header: "Status",
        id: "status",
        accessorFn: (p) => p.status,
        cell: ({ getValue }) => <StatusBadge status={getValue<ProfileStatus>()} />,
      },
      {
        header: "Action",
        id: "action",
        cell: ({ row }) => (
          <span onClick={(e) => e.stopPropagation()} className="flex justify-end">
            <Button variant="secondary" size="xs" onClick={() => openProfile(row.original)}>
              <FileText />
              View
            </Button>
          </span>
        ),
        meta: { align: "right" },
      },
    ],
    [],
  );

  return (
    <PageTransition className="flex h-full min-h-0 flex-col gap-4">
      <PageHeader
        title="Violation Management"
        description="Manage violator profiles, recorded violations, and payment history."
        actions={
          <Button onClick={addViolation}>
            <Plus />
            Add Violation
          </Button>
        }
      />

      <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Violators"
          value={stats.totalViolators}
          icon={Users}
          loading={loading}
        />
        <MetricCard
          label="Total Violations"
          value={stats.totalViolations}
          icon={ScrollText}
          loading={loading}
        />
        <MetricCard
          label="Pending Payments"
          value={stats.pendingPayments}
          icon={Clock3}
          loading={loading}
        />
        <MetricCard
          label="Total Amount Collected"
          kind="peso"
          value={stats.totalCollected}
          icon={Banknote}
          loading={loading}
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
                  <ExportButton onClick={exportRegister} disabled={data.length === 0} />
                  <PrintButton onClick={() => window.print()} />
                </>
              }
            >
              <SearchBar
                placeholder="Search name, violation no., OR no.…"
                widthClassName="w-64"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <DropdownFilter
                label="Payment Status"
                value={status}
                onChange={setStatus}
                options={[
                  { value: ALL, label: "All Statuses" },
                  ...PROFILE_STATUSES.map((s) => ({ value: s, label: s })),
                ]}
              />
              <DropdownFilter
                label="Violation Type"
                value={violationType}
                onChange={setViolationType}
                options={[
                  { value: ALL, label: "All Violation Types" },
                  ...typeFilterOptions.map((t) => ({ value: t, label: t })),
                ]}
              />
              <DateFilter label="Date Issued" value={dateRange} onChange={setDateRange} />
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
            minWidth={1100}
            enableRowSelection
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            onSelectedRowsChange={setSelectedRows}
            getRowId={(p) => p.violator.id}
            onRowClick={openProfile}
            emptyState={{
              icon: ScrollText,
              title: "No violator profiles found",
              description:
                "Try adjusting the filters, or record a violation — the violator's profile is created automatically.",
              action: { label: "Add Violation", onClick: addViolation },
            }}
          />
        </TableCard>
      </div>

      <BulkActionBar
        count={selectedRows.length}
        onExport={() =>
          download(
            exportViolatorsCsv(selectedRows),
            "violator-profiles-selection.csv",
            `Exported ${selectedRows.length} violator profile${selectedRows.length === 1 ? "" : "s"}`,
          )
        }
        onPrint={() => window.print()}
        onDelete={() => setConfirmBulkDelete(true)}
        onClear={() => setRowSelection({})}
      />

      <DeleteModal
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        title={`Delete ${selectedRows.length} violator profile${selectedRows.length === 1 ? "" : "s"}?`}
        description={
          `Every violation and payment record belonging to ` +
          `${selectedRows.length === 1 ? "this violator" : "these violators"} will be permanently removed ` +
          `(${selectedRows.reduce((s, p) => s + p.totalViolations, 0)} in total).`
        }
        onConfirm={async () => {
          await removeProfiles(selectedRows);
          setConfirmBulkDelete(false);
        }}
      />

      <ViolatorDrawer
        profile={activeProfile}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        loading={loading && !activeProfile}
        onEditProfile={(p) => {
          setEditingViolator(p.violator);
          setProfileFormOpen(true);
        }}
        onAddViolation={(p) => {
          setFormViolator(p.violator);
          setEditingViolation(null);
          setViolationFormOpen(true);
        }}
        onEditViolation={(p, v) => {
          setFormViolator(p.violator);
          setEditingViolation(v);
          setViolationFormOpen(true);
        }}
        onRecordPayment={(p, v) => {
          setFormViolator(p.violator);
          setPayingViolation(v);
          setPaymentOpen(true);
        }}
        onPrint={printProfileReport}
        onExport={exportProfile}
        onChanged={refresh}
      />

      <ViolatorForm
        open={profileFormOpen}
        onOpenChange={setProfileFormOpen}
        violator={editingViolator}
        onSaved={refresh}
      />

      <ViolationForm
        open={violationFormOpen}
        onOpenChange={setViolationFormOpen}
        violator={formViolator}
        profiles={allProfiles}
        violation={editingViolation}
        onSaved={refresh}
      />

      <PaymentForm
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        violator={formViolator}
        violation={payingViolation}
        onSaved={refresh}
      />

      {printProfile && <ViolatorPrintSheet profile={printProfile} />}
    </PageTransition>
  );
}
