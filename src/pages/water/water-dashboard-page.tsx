import * as React from "react";
import { useNavigate } from "react-router-dom";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import {
  ArrowDownRight,
  ArrowUpRight,
  Droplets,
  Gauge,
  Plus,
  TrendingUp,
  Wallet,
} from "lucide-react";

import {
  Button,
  Caption,
  ContainerCard,
  CurrencyDisplay,
  DeleteModal,
  DocumentNumber,
  DropdownFilter,
  EnterpriseTable,
  ExportButton,
  FilterBar,
  MetricCard,
  MetricIcon,
  OverlineLabel,
  PageHeader,
  PageTransition,
  PrintButton,
  SearchBar,
  StatusBadge,
  TableCard,
  toast,
} from "@/components";
import { deleteWaterAccounts } from "@/features/water/api";
import {
  useWaterAccounts,
  useWaterBills,
  useWaterMeterReadings,
  useWaterSubmeterBills,
  useWaterSubmeters,
} from "@/features/water/hooks";
import {
  accountLabel,
  accountLocations,
  accountRollup,
  billingYears,
  buildComparisons,
  buildOverall,
  latestReading,
  overallLabel,
} from "@/features/water/lib";
import {
  MONTHS,
  monthName,
  periodLabel,
  type AccountComparison,
  type WaterAccount,
  type WaterBill,
  type WaterMeterReading,
  type WaterSubmeter,
} from "@/features/water/types";
import { WaterAccountDrawer } from "@/features/water/components/water-account-drawer";
import { WaterAccountForm } from "@/features/water/components/water-account-form";
import { WaterBillForm } from "@/features/water/components/water-bill-form";
import { WaterSubmeterForm } from "@/features/water/components/water-submeter-form";
import { WaterSubmeterDrawer } from "@/features/water/components/water-submeter-drawer";
import { WaterReadingForm } from "@/features/water/components/water-reading-form";
import { BulkActionBar } from "@/features/shared/bulk-action-bar";

const ALL = "__all";
const now = new Date();

export function WaterDashboardPage() {
  const navigate = useNavigate();

  /* ---------------- period + filters ---------------- */
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [year, setYear] = React.useState(now.getFullYear());
  const [search, setSearch] = React.useState("");
  const [location, setLocation] = React.useState(ALL);
  const [standing, setStanding] = React.useState<"active" | "archived">("active");

  const accountFilters = React.useMemo(
    () => ({
      search: search || undefined,
      location: location === ALL ? undefined : location,
    }),
    [search, location],
  );

  const accounts = useWaterAccounts(accountFilters);
  // Unfiltered registers drive the KPIs and comparisons.
  const allAccounts = useWaterAccounts(React.useMemo(() => ({}), []));
  // Archived accounts keep their bills, which still count in the year's
  // expense, but leave the register, the counts and the month's comparison
  // (approved 2026-10-21); the Accounts filter shows them.
  const activeAccounts = React.useMemo(() => allAccounts.data.filter((a) => !a.archived), [allAccounts.data]);
  const shownAccounts = React.useMemo(
    () => accounts.data.filter((a) => (standing === "archived") === (a.archived === true)),
    [accounts.data, standing],
  );
  const bills = useWaterBills(React.useMemo(() => ({}), []));
  const submeters = useWaterSubmeters(React.useMemo(() => ({}), []));
  const submeterBills = useWaterSubmeterBills(React.useMemo(() => ({}), []));
  const readings = useWaterMeterReadings(React.useMemo(() => ({}), []));
  const loading = accounts.loading || bills.loading;

  const refreshAll = () => {
    void accounts.refresh();
    void allAccounts.refresh();
    void bills.refresh();
    void submeters.refresh();
    void submeterBills.refresh();
    void readings.refresh();
  };

  /* ---------------- computations ---------------- */
  const comparisons = React.useMemo(
    () => buildComparisons(shownAccounts, bills.data, month, year),
    [shownAccounts, bills.data, month, year],
  );
  const overallAll = React.useMemo(
    () => buildOverall(buildComparisons(activeAccounts, bills.data, month, year)),
    [activeAccounts, bills.data, month, year],
  );

  const yearTotal = React.useMemo(
    () => bills.data.filter((b) => b.billingYear === year).reduce((s, b) => s + b.amount, 0),
    [bills.data, year],
  );

  const ranked = React.useMemo(
    () =>
      buildComparisons(activeAccounts, bills.data, month, year)
        .filter((c) => c.current !== null)
        .sort((a, b) => (b.current ?? 0) - (a.current ?? 0)),
    [activeAccounts, bills.data, month, year],
  );
  const highest = ranked[0];
  const lowest = ranked[ranked.length - 1];

  const years = React.useMemo(() => billingYears(bills.data), [bills.data]);
  const locations = React.useMemo(() => accountLocations(allAccounts.data), [allAccounts.data]);

  /* ---------------- selection + drawers ---------------- */
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [selectedRows, setSelectedRows] = React.useState<AccountComparison[]>([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = React.useState(false);

  const [detailAccount, setDetailAccount] = React.useState<WaterAccount | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [formAccount, setFormAccount] = React.useState<WaterAccount | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [billAccount, setBillAccount] = React.useState<WaterAccount | null>(null);
  const [billRecord, setBillRecord] = React.useState<WaterBill | null>(null);
  const [billSubmeter, setBillSubmeter] = React.useState<WaterSubmeter | null>(null);
  const [billOpen, setBillOpen] = React.useState(false);
  const [submeterAccount, setSubmeterAccount] = React.useState<WaterAccount | null>(null);
  const [submeterRecord, setSubmeterRecord] = React.useState<WaterSubmeter | null>(null);
  const [submeterOpen, setSubmeterOpen] = React.useState(false);
  const [submeterDetail, setSubmeterDetail] = React.useState<WaterSubmeter | null>(null);
  const [submeterDetailOpen, setSubmeterDetailOpen] = React.useState(false);
  const [readingSubmeter, setReadingSubmeter] = React.useState<WaterSubmeter | null>(null);
  const [readingRecord, setReadingRecord] = React.useState<WaterMeterReading | null>(null);
  const [readingOpen, setReadingOpen] = React.useState(false);

  const openAccount = (a: WaterAccount) => {
    setDetailAccount(a);
    setDetailOpen(true);
  };
  const openNewAccount = () => {
    setFormAccount(null);
    setFormOpen(true);
  };
  const openEditAccount = (a: WaterAccount) => {
    setFormAccount(a);
    setFormOpen(true);
  };
  const openNewBill = (a: WaterAccount) => {
    setBillAccount(a);
    setBillRecord(null);
    setBillSubmeter(null);
    setBillOpen(true);
  };
  const openEditBill = (a: WaterAccount, b: WaterBill) => {
    setBillAccount(a);
    setBillRecord(b);
    setBillSubmeter(null);
    setBillOpen(true);
  };
  /** Records a monthly bill against a submeter instead of the main account. */
  const openNewSubmeterBill = (a: WaterAccount, s: WaterSubmeter) => {
    setBillAccount(a);
    setBillRecord(null);
    setBillSubmeter(s);
    setBillOpen(true);
  };
  const openNewSubmeter = (a: WaterAccount) => {
    setSubmeterAccount(a);
    setSubmeterRecord(null);
    setSubmeterOpen(true);
  };
  const openEditSubmeter = (a: WaterAccount, s: WaterSubmeter) => {
    setSubmeterAccount(a);
    setSubmeterRecord(s);
    setSubmeterOpen(true);
  };
  /** Submeter detail drawer — where the meter reading history lives. */
  const openSubmeterDetail = (a: WaterAccount, s: WaterSubmeter) => {
    setSubmeterAccount(a);
    setSubmeterDetail(s);
    setSubmeterDetailOpen(true);
  };
  const openNewReading = (s: WaterSubmeter) => {
    setReadingSubmeter(s);
    setReadingRecord(null);
    setReadingOpen(true);
  };
  const openEditReading = (s: WaterSubmeter, r: WaterMeterReading) => {
    setReadingSubmeter(s);
    setReadingRecord(r);
    setReadingOpen(true);
  };

  const removeAccounts = async (rows: WaterAccount[]) => {
    try {
      await deleteWaterAccounts(rows.map((r) => r.id));
    } catch (e) {
      // Records that hold official records are kept (approved 2026-10-21);
      // the others may have been deleted, so the table is refreshed either way.
      toast.error(e instanceof Error ? e.message : "Unable to delete the accounts");
      setRowSelection({});
      refreshAll();
      return;
    }
    setRowSelection({});
    toast.success(`Deleted ${rows.length} account${rows.length === 1 ? "" : "s"}`);
    refreshAll();
  };

  const exportCsv = (rows: AccountComparison[]) => {
    const header = [
      "Account Number",
      "Account Name",
      "Location",
      "Meter Number",
      `${monthName(month)} ${year}`,
      "Previous Month",
      "Difference",
      "Percent",
      "Status",
    ];
    const lines = rows.map((c) =>
      [
        c.account.accountNumber,
        `"${c.account.accountName ?? ""}"`,
        `"${c.account.location}"`,
        c.account.meterNumber,
        c.current ?? "",
        c.previous ?? "",
        c.difference,
        c.percent === null ? "" : c.percent.toFixed(2),
        c.status,
      ].join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `water-accounts-${year}-${String(month).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} account${rows.length === 1 ? "" : "s"}`);
  };

  /* ---------------- table ---------------- */
  const columns = React.useMemo<ColumnDef<AccountComparison, unknown>[]>(
    () => [
      {
        header: "Account Number",
        id: "accountNumber",
        accessorFn: (c) => c.account.accountNumber,
        cell: ({ row }) => (
          <DocumentNumber value={row.original.account.accountNumber} chipColor="bg-sky-500" />
        ),
      },
      {
        header: "Account Name",
        id: "accountName",
        accessorFn: (c) => c.account.accountName ?? "",
        cell: ({ row }) => (
          <span className="block max-w-[200px] truncate font-medium text-neutral-800">
            {row.original.account.accountName ?? "—"}
          </span>
        ),
      },
      {
        header: "Location",
        id: "location",
        accessorFn: (c) => c.account.location,
        cell: ({ getValue }) => (
          <span className="block max-w-[200px] truncate text-neutral-600">
            {getValue<string>()}
          </span>
        ),
      },
      {
        header: "Meter",
        id: "meter",
        accessorFn: (c) => c.account.meterNumber,
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap tabular-nums text-neutral-500">
            {getValue<string>()}
          </span>
        ),
      },
      {
        header: "Submeters",
        id: "submeters",
        accessorFn: (c) =>
          accountRollup(submeters.data, submeterBills.data, c.account.id, month, year)
            .activeSubmeters,
        cell: ({ row }) => {
          const r = accountRollup(
            submeters.data,
            submeterBills.data,
            row.original.account.id,
            month,
            year,
          );
          if (r.totalSubmeters === 0) return <span className="text-neutral-300">—</span>;
          return (
            <span className="block whitespace-nowrap">
              <span className="tabular-nums text-neutral-700">
                {r.activeSubmeters}
                {r.totalSubmeters !== r.activeSubmeters && (
                  <span className="text-[11px] text-neutral-400"> / {r.totalSubmeters}</span>
                )}
                <span className="text-[11px] text-neutral-400"> active</span>
              </span>
              {(r.totalConsumption > 0 || r.totalAmount > 0) && (
                <span className="block text-[10.5px] tabular-nums text-neutral-400">
                  {r.totalConsumption.toLocaleString("en-PH", { maximumFractionDigits: 0 })} m³ · ₱
                  {r.totalAmount.toLocaleString("en-PH", { maximumFractionDigits: 0 })}
                </span>
              )}
            </span>
          );
        },
        meta: { align: "right" as const },
      },
      {
        header: "Current",
        id: "current",
        accessorFn: (c) => c.current ?? 0,
        cell: ({ row }) =>
          row.original.current === null ? (
            <span className="text-neutral-300">—</span>
          ) : (
            <CurrencyDisplay amount={row.original.current} />
          ),
        meta: { align: "right" as const },
      },
      {
        header: "Previous",
        id: "previous",
        accessorFn: (c) => c.previous ?? 0,
        cell: ({ row }) =>
          row.original.previous === null ? (
            <span className="text-neutral-300">—</span>
          ) : (
            <CurrencyDisplay amount={row.original.previous} muted />
          ),
        meta: { align: "right" as const },
      },
      {
        header: "Difference",
        id: "difference",
        accessorFn: (c) => c.difference,
        cell: ({ row }) => {
          const c = row.original;
          if (c.status === "No Change") return <span className="text-neutral-300">—</span>;
          const up = c.status === "Increased";
          return (
            <span
              className={
                "inline-flex items-center gap-1 whitespace-nowrap tabular-nums font-medium " +
                (up ? "text-red-600" : "text-(--tone-settled)")
              }
            >
              {up ? (
                <ArrowUpRight className="h-3.5 w-3.5" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5" />
              )}
              ₱{Math.abs(c.difference).toLocaleString("en-PH", { maximumFractionDigits: 2 })}
              {c.percent !== null && (
                <span className="text-[11px] opacity-70">({Math.abs(c.percent).toFixed(2)}%)</span>
              )}
            </span>
          );
        },
        meta: { align: "right" as const },
      },
      {
        header: "Status",
        id: "status",
        accessorFn: (c) => c.status,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },

    ],
    [submeters.data, submeterBills.data, month, year],
  );

  const overallUp = overallAll.status === "Increased";

  return (
    <PageTransition className="space-y-4">
      <PageHeader
        title="Water Consumption"
        description="Monitor water billing across all registered municipal accounts."
        actions={
          <Button onClick={openNewAccount}>
            <Plus />
            New Account
          </Button>
        }
      />

      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-2">
        <OverlineLabel className="mr-1">Billing Period</OverlineLabel>
        <DropdownFilter
          label="Month"
          value={String(month)}
          onChange={(v) => setMonth(Number(v))}
          options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
        />
        <DropdownFilter
          label="Year"
          value={String(year)}
          onChange={(v) => setYear(Number(v))}
          options={years.map((y) => ({ value: String(y), label: String(y) }))}
        />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <MetricCard
          label="Registered Accounts" tone="brand"
          value={activeAccounts.length}
          icon={Gauge}
          loading={allAccounts.loading}
        />
        <MetricCard
          label={`${monthName(month)} ${year} Expense`}
          kind="peso"
          value={overallAll.currentTotal}
          icon={Droplets}
          loading={loading}
        />
        <MetricCard
          label={`${year} Expense to Date`}
          kind="peso"
          value={yearTotal}
          icon={Wallet}
          loading={loading}
        />
        <ContainerCard className="px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <span className="pt-1 text-[13px] font-medium leading-5 text-[#5b606b]">Highest Consuming</span>
            <MetricIcon icon={TrendingUp} />
          </div>
          <div className="mt-2 truncate text-[16px] font-semibold leading-8 tracking-tight text-neutral-900">
            {highest ? accountLabel(highest.account) : "—"}
          </div>
          {highest?.current != null && (
            <CurrencyDisplay amount={highest.current} className="mt-0.5 text-[12.5px]" />
          )}
        </ContainerCard>
        <ContainerCard className="px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <span className="pt-1 text-[13px] font-medium leading-5 text-[#5b606b]">Lowest Consuming</span>
            <MetricIcon icon={ArrowDownRight} />
          </div>
          <div className="mt-2 truncate text-[16px] font-semibold leading-8 tracking-tight text-neutral-900">
            {lowest ? accountLabel(lowest.account) : "—"}
          </div>
          {lowest?.current != null && (
            <CurrencyDisplay amount={lowest.current} className="mt-0.5 text-[12.5px]" />
          )}
        </ContainerCard>
      </div>

      {/* Overall comparison banner */}
      <ContainerCard
        className={
          "p-4 " +
          (overallAll.status === "No Change"
            ? ""
            : overallUp
              ? "border-red-200 bg-red-50/40"
              : "border-(--tone-settled)/30 bg-(--tone-settled-tint)")
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <OverlineLabel>Overall Comparison</OverlineLabel>
            <div
              className={
                "mt-0.5 text-[15px] font-semibold tracking-tight " +
                (overallAll.status === "No Change"
                  ? "text-neutral-700"
                  : overallUp
                    ? "text-red-700"
                    : "text-(--tone-settled)")
              }
            >
              {overallLabel(overallAll)}
            </div>
            <p className="mt-0.5 text-[11.5px] text-neutral-500">
              {periodLabel(month, year)} total{" "}
              <CurrencyDisplay amount={overallAll.currentTotal} muted /> vs. previous month{" "}
              <CurrencyDisplay amount={overallAll.previousTotal} muted /> across{" "}
              {overallAll.accounts} account{overallAll.accounts === 1 ? "" : "s"}.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <div className="text-center">
              <div className="text-[18px] font-semibold tabular-nums text-red-600">
                {overallAll.increased}
              </div>
              <Caption as="div" className="text-[10.5px]">
                Increased
              </Caption>
            </div>
            <div className="text-center">
              <div className="text-[16px] font-semibold tabular-nums text-(--tone-settled)">
                {overallAll.decreased}
              </div>
              <Caption as="div" className="text-[10.5px]">
                Decreased
              </Caption>
            </div>
            <div className="text-center">
              <div className="text-[18px] font-semibold tabular-nums text-neutral-500">
                {overallAll.unchanged}
              </div>
              <Caption as="div" className="text-[10.5px]">
                No Change
              </Caption>
            </div>
          </div>
        </div>
      </ContainerCard>

      {/* Accounts table */}
      <section>
        <div className="h-[560px]">
          <TableCard
            fillContainer
            toolbar={
              <FilterBar
                className="shrink-0"
                end={
                  <>
                    <ExportButton
                      label="Export CSV"
                      onClick={() => exportCsv(comparisons)}
                      disabled={comparisons.length === 0}
                    />
                    <PrintButton onClick={() => navigate("/water/summary")} />
                  </>
                }
              >
                <SearchBar
                  placeholder="Search account, meter, location…"
                  widthClassName="w-60"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <DropdownFilter
                  label="Location"
                  value={location}
                  onChange={setLocation}
                  options={[
                    { value: ALL, label: "All Locations" },
                    ...locations.map((l) => ({ value: l, label: l })),
                  ]}
                />
                <DropdownFilter
                  label="Accounts"
                  value={standing}
                  onChange={(v) => setStanding(v as "active" | "archived")}
                  options={[
                    { value: "active", label: "Active accounts" },
                    { value: "archived", label: "Archived accounts" },
                  ]}
                />
              </FilterBar>
            }
          >
            <EnterpriseTable
              columns={columns}
              data={comparisons}
              loading={loading}
              skeletonRows={8}
              fillContainer
              stickyHeader
              pageSize={12}
              // A floor, not a width: wider content still widens it. Measured 30 Oct 2026 so the list fits a 1440px screen.
              minWidth={1100}
              enableRowSelection
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              onSelectedRowsChange={setSelectedRows}
              getRowId={(c) => c.account.id}
              onRowClick={(c) => openAccount(c.account)}
              emptyState={
                standing === "archived"
                  ? {
                      icon: Droplets,
                      title: "No archived accounts",
                      description: "Accounts archived from their drawer appear here, with all their bills.",
                    }
                  : {
                      icon: Droplets,
                      title: "No water accounts found",
                      description: "Register a water account to begin recording monthly consumption.",
                      action: { label: "New Account", onClick: openNewAccount },
                    }
              }
            />
          </TableCard>
        </div>
      </section>

      <BulkActionBar
        count={selectedRows.length}
        onPrint={() => navigate("/water/summary")}
        onDelete={() => setConfirmBulkDelete(true)}
        onClear={() => setRowSelection({})}
      />

      <DeleteModal
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        title={`Delete ${selectedRows.length} account${selectedRows.length === 1 ? "" : "s"}?`}
        description="Only accounts with no bills or submeters are deleted. An account that holds bills is kept — its billing records are never deleted; archive it from its drawer instead."
        onConfirm={async () => {
          await removeAccounts(selectedRows.map((c) => c.account));
          setConfirmBulkDelete(false);
        }}
      />

      <WaterAccountDrawer
        account={detailAccount}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        month={month}
        year={year}
        onEdit={(a) => {
          setDetailOpen(false);
          openEditAccount(a);
        }}
        onAddBill={(a) => {
          setDetailOpen(false);
          openNewBill(a);
        }}
        onEditBill={(a, b) => {
          setDetailOpen(false);
          openEditBill(a, b);
        }}
        onAddSubmeter={(a) => {
          setDetailOpen(false);
          openNewSubmeter(a);
        }}
        onEditSubmeter={(a, s) => {
          setDetailOpen(false);
          openEditSubmeter(a, s);
        }}
        onAddSubmeterBill={(a, s) => {
          setDetailOpen(false);
          openNewSubmeterBill(a, s);
        }}
        onOpenSubmeter={(a, s) => {
          setDetailOpen(false);
          openSubmeterDetail(a, s);
        }}
        onChanged={refreshAll}
      />
      <WaterAccountForm
        open={formOpen}
        onOpenChange={setFormOpen}
        account={formAccount}
        onSaved={refreshAll}
      />
      <WaterBillForm
        open={billOpen}
        onOpenChange={setBillOpen}
        account={billAccount}
        submeter={billSubmeter}
        bill={billRecord}
        onSaved={refreshAll}
      />
      <WaterSubmeterForm
        open={submeterOpen}
        onOpenChange={setSubmeterOpen}
        account={submeterAccount}
        submeter={submeterRecord}
        onSaved={refreshAll}
      />
      <WaterSubmeterDrawer
        submeter={submeterDetail}
        open={submeterDetailOpen}
        onOpenChange={setSubmeterDetailOpen}
        onEdit={(s) => {
          setSubmeterDetailOpen(false);
          if (submeterAccount) openEditSubmeter(submeterAccount, s);
        }}
        onAddReading={
          submeterAccount?.archived
            ? undefined
            : (s) => {
                setSubmeterDetailOpen(false);
                openNewReading(s);
              }
        }
        onEditReading={(s, r) => {
          setSubmeterDetailOpen(false);
          openEditReading(s, r);
        }}
        onChanged={refreshAll}
      />
      <WaterReadingForm
        open={readingOpen}
        onOpenChange={setReadingOpen}
        submeter={readingSubmeter}
        reading={readingRecord}
        carriedPrevious={
          readingSubmeter
            ? (latestReading(readings.data, readingSubmeter.id)?.currentReading ?? 0)
            : 0
        }
        onSaved={refreshAll}
      />
    </PageTransition>
  );
}
