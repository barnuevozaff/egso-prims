import * as React from "react";
import { useNavigate } from "react-router-dom";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import {
  ArrowDownRight,
  ArrowUpRight,
  Gauge,
  Plus,
  TrendingUp,
  Wallet,
  Zap,
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
  OverlineLabel,
  PageHeader,
  PageTransition,
  PrintButton,
  SearchBar,
  StatusBadge,
  TableCard,
  toast,
} from "@/components";
import { deleteEnergyAccounts } from "@/features/energy/api";
import {
  useEnergyAccounts,
  useEnergyBills,
  useEnergySubmeterBills,
  useEnergySubmeters,
} from "@/features/energy/hooks";
import {
  accountLabel,
  accountLocations,
  accountRollup,
  billingYears,
  buildComparisons,
  buildOverall,
  overallLabel,
} from "@/features/energy/lib";
import {
  MONTHS,
  monthName,
  periodLabel,
  type AccountComparison,
  type EnergyAccount,
  type EnergyBill,
  type EnergySubmeter,
} from "@/features/energy/types";
import { EnergyAccountDrawer } from "@/features/energy/components/energy-account-drawer";
import { EnergyAccountForm } from "@/features/energy/components/energy-account-form";
import { EnergyBillForm } from "@/features/energy/components/energy-bill-form";
import { EnergySubmeterForm } from "@/features/energy/components/energy-submeter-form";
import { BulkActionBar } from "@/features/shared/bulk-action-bar";

const ALL = "__all";
const now = new Date();

export function EnergyDashboardPage() {
  const navigate = useNavigate();

  /* ---------------- period + filters ---------------- */
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [year, setYear] = React.useState(now.getFullYear());
  const [search, setSearch] = React.useState("");
  const [location, setLocation] = React.useState(ALL);

  const accountFilters = React.useMemo(
    () => ({
      search: search || undefined,
      location: location === ALL ? undefined : location,
    }),
    [search, location],
  );

  const accounts = useEnergyAccounts(accountFilters);
  // Unfiltered registers drive the KPIs, comparisons, and charts.
  const allAccounts = useEnergyAccounts(React.useMemo(() => ({}), []));
  const bills = useEnergyBills(React.useMemo(() => ({}), []));
  const submeters = useEnergySubmeters(React.useMemo(() => ({}), []));
  const submeterBills = useEnergySubmeterBills(React.useMemo(() => ({}), []));
  const loading = accounts.loading || bills.loading;

  const refreshAll = () => {
    void accounts.refresh();
    void allAccounts.refresh();
    void bills.refresh();
    void submeters.refresh();
    void submeterBills.refresh();
  };

  /* ---------------- computations ---------------- */
  const comparisons = React.useMemo(
    () => buildComparisons(accounts.data, bills.data, month, year),
    [accounts.data, bills.data, month, year],
  );
  const overallAll = React.useMemo(
    () => buildOverall(buildComparisons(allAccounts.data, bills.data, month, year)),
    [allAccounts.data, bills.data, month, year],
  );

  const yearTotal = React.useMemo(
    () =>
      bills.data.filter((b) => b.billingYear === year).reduce((s, b) => s + b.amount, 0),
    [bills.data, year],
  );

  const ranked = React.useMemo(
    () =>
      buildComparisons(allAccounts.data, bills.data, month, year)
        .filter((c) => c.current !== null)
        .sort((a, b) => (b.current ?? 0) - (a.current ?? 0)),
    [allAccounts.data, bills.data, month, year],
  );
  const highest = ranked[0];
  const lowest = ranked[ranked.length - 1];

  const years = React.useMemo(() => billingYears(bills.data), [bills.data]);
  const locations = React.useMemo(() => accountLocations(allAccounts.data), [allAccounts.data]);

  /* ---------------- selection + drawers ---------------- */
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [selectedRows, setSelectedRows] = React.useState<AccountComparison[]>([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = React.useState(false);

  const [detailAccount, setDetailAccount] = React.useState<EnergyAccount | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [formAccount, setFormAccount] = React.useState<EnergyAccount | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [billAccount, setBillAccount] = React.useState<EnergyAccount | null>(null);
  const [billRecord, setBillRecord] = React.useState<EnergyBill | null>(null);
  const [billSubmeter, setBillSubmeter] = React.useState<EnergySubmeter | null>(null);
  const [billOpen, setBillOpen] = React.useState(false);
  const [submeterAccount, setSubmeterAccount] = React.useState<EnergyAccount | null>(null);
  const [submeterRecord, setSubmeterRecord] = React.useState<EnergySubmeter | null>(null);
  const [submeterOpen, setSubmeterOpen] = React.useState(false);

  const openAccount = (a: EnergyAccount) => {
    setDetailAccount(a);
    setDetailOpen(true);
  };
  const openNewAccount = () => {
    setFormAccount(null);
    setFormOpen(true);
  };
  const openEditAccount = (a: EnergyAccount) => {
    setFormAccount(a);
    setFormOpen(true);
  };
  const openNewBill = (a: EnergyAccount) => {
    setBillAccount(a);
    setBillRecord(null);
    setBillSubmeter(null);
    setBillOpen(true);
  };
  const openEditBill = (a: EnergyAccount, b: EnergyBill) => {
    setBillAccount(a);
    setBillRecord(b);
    setBillSubmeter(null);
    setBillOpen(true);
  };
  /** Records a monthly bill against a submeter instead of the main account. */
  const openNewSubmeterBill = (a: EnergyAccount, s: EnergySubmeter) => {
    setBillAccount(a);
    setBillRecord(null);
    setBillSubmeter(s);
    setBillOpen(true);
  };
  const openNewSubmeter = (a: EnergyAccount) => {
    setSubmeterAccount(a);
    setSubmeterRecord(null);
    setSubmeterOpen(true);
  };
  const openEditSubmeter = (a: EnergyAccount, s: EnergySubmeter) => {
    setSubmeterAccount(a);
    setSubmeterRecord(s);
    setSubmeterOpen(true);
  };


  const removeAccounts = async (rows: EnergyAccount[]) => {
    try {
      await deleteEnergyAccounts(rows.map((r) => r.id));
    } catch (e) {
      // A rejected delete used to leave the rows selected, the table
      // unchanged and nothing said — indistinguishable from a click that
      // never landed.
      toast.error(e instanceof Error ? e.message : "Unable to delete the accounts");
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
    a.download = `energy-accounts-${year}-${String(month).padStart(2, "0")}.csv`;
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
          <DocumentNumber value={row.original.account.accountNumber} chipColor="bg-amber-500" />
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
            <span className="whitespace-nowrap tabular-nums text-neutral-700">
              {r.activeSubmeters}
              {r.totalSubmeters !== r.activeSubmeters && (
                <span className="text-[11px] text-neutral-400"> / {r.totalSubmeters}</span>
              )}
              {r.totalConsumption > 0 && (
                <span className="ml-1 text-[11px] text-neutral-400">
                  · {r.totalConsumption.toLocaleString("en-PH", { maximumFractionDigits: 0 })} KW
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
                <span className="text-[11px] opacity-70">
                  ({Math.abs(c.percent).toFixed(2)}%)
                </span>
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
        title="Energy Consumption"
        description="Monitor electricity billing across all registered municipal accounts."
        actions={
          <>
            <Button onClick={openNewAccount}>
              <Plus />
              New Account
            </Button>
          </>
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
          label="Registered Accounts"
          value={allAccounts.data.length}
          icon={Gauge}
          loading={allAccounts.loading}
        />
        <MetricCard
          label={`${monthName(month)} ${year} Expense`}
          kind="peso"
          value={overallAll.currentTotal}
          icon={Zap}
          loading={loading}
        />
        <MetricCard
          label={`${year} Expense to Date`}
          kind="peso"
          value={yearTotal}
          icon={Wallet}
          loading={loading}
        />
        <ContainerCard hoverable className="p-4">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-neutral-100 text-neutral-600">
              <TrendingUp className="h-3.5 w-3.5" />
            </div>
            <span className="text-[12px] text-neutral-500">Highest Consuming</span>
          </div>
          <div className="mt-3 truncate text-[14px] font-semibold tracking-tight text-neutral-900">
            {highest ? accountLabel(highest.account) : "—"}
          </div>
          {highest?.current != null && (
            <CurrencyDisplay amount={highest.current} className="mt-0.5 text-[12.5px]" />
          )}
        </ContainerCard>
        <ContainerCard hoverable className="p-4">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-neutral-100 text-neutral-600">
              <ArrowDownRight className="h-3.5 w-3.5" />
            </div>
            <span className="text-[12px] text-neutral-500">Lowest Consuming</span>
          </div>
          <div className="mt-3 truncate text-[14px] font-semibold tracking-tight text-neutral-900">
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
              <Caption as="div" className="text-[10.5px]">Increased</Caption>
            </div>
            <div className="text-center">
              <div className="text-[16px] font-semibold tabular-nums text-(--tone-settled)">
                {overallAll.decreased}
              </div>
              <Caption as="div" className="text-[10.5px]">Decreased</Caption>
            </div>
            <div className="text-center">
              <div className="text-[18px] font-semibold tabular-nums text-neutral-500">
                {overallAll.unchanged}
              </div>
              <Caption as="div" className="text-[10.5px]">No Change</Caption>
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
                    <PrintButton onClick={() => navigate("/energy/summary")} />
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
              minWidth={1340}
              enableRowSelection
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              onSelectedRowsChange={setSelectedRows}
              getRowId={(c) => c.account.id}
              onRowClick={(c) => openAccount(c.account)}
              emptyState={{
                icon: Zap,
                title: "No energy accounts found",
                description:
                  "Register an electricity account to begin recording monthly consumption.",
                action: { label: "New Account", onClick: openNewAccount },
              }}
            />
          </TableCard>
        </div>
      </section>

      <BulkActionBar
        count={selectedRows.length}
        onExport={() => exportCsv(selectedRows)}
        onPrint={() => navigate("/energy/summary")}
        onDelete={() => setConfirmBulkDelete(true)}
        onClear={() => setRowSelection({})}
      />

      <DeleteModal
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        title={`Delete ${selectedRows.length} account${selectedRows.length === 1 ? "" : "s"}?`}
        description="The accounts and all of their monthly billing records will be permanently removed."
        onConfirm={async () => {
          await removeAccounts(selectedRows.map((c) => c.account));
          setConfirmBulkDelete(false);
        }}
      />

      <EnergyAccountDrawer
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
        onChanged={refreshAll}
      />
      <EnergyAccountForm
        open={formOpen}
        onOpenChange={setFormOpen}
        account={formAccount}
        onSaved={refreshAll}
      />
      <EnergyBillForm
        open={billOpen}
        onOpenChange={setBillOpen}
        account={billAccount}
        submeter={billSubmeter}
        bill={billRecord}
        onSaved={refreshAll}
      />
      <EnergySubmeterForm
        open={submeterOpen}
        onOpenChange={setSubmeterOpen}
        account={submeterAccount}
        submeter={submeterRecord}
        onSaved={refreshAll}
      />
    </PageTransition>
  );
}
