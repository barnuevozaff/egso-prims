import * as React from "react";
import { format } from "date-fns";
import { Archive, ArchiveRestore, Ban, Droplets, Gauge, History, MapPin, Pencil, Plus } from "lucide-react";

import {
  BarChartContainer,
  Button,
  Caption,
  CurrencyDisplay,
  Drawer,
  DrawerActions,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  EmptyState,
  IconButton,
  OverlineLabel,
  SectionTitle,
  Skeleton,
  SkeletonText,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableHeaderRow,
  TableRow,
  chartPalette,
  toast,
} from "@/components";
import { archiveWaterAccount, archiveWaterSubmeter, voidWaterBill } from "@/features/water/api";
import {
  useWaterBills,
  useWaterSubmeterBills,
  useWaterSubmeters,
} from "@/features/water/hooks";
import {
  accountLabel,
  accountRollup,
  buildComparisons,
  comparisonLabel,
  latestSubmeterBill,
  monthlyTotals,
  submetersOf,
  trailingPeriods,
} from "@/features/water/lib";
import {
  monthName,
  periodLabel,
  type WaterAccount,
  type WaterBill,
  type WaterSubmeter,
} from "@/features/water/types";
import { departmentByCode } from "@/features/purchase-requests/types";
import { useAuth } from "@/features/auth/auth-context";
import { activeOnly, hasHistory } from "@/features/shared/revisions";
import { RecordHistoryDialog, VoidRecordDialog } from "@/features/shared/void-record";

/** Right slide-over: account details, movement, and full billing history. */
export function WaterAccountDrawer({
  account,
  open,
  onOpenChange,
  month,
  year,
  onEdit,
  onAddBill: addBill,
  onEditBill,
  onAddSubmeter: addSubmeter,
  onEditSubmeter,
  onAddSubmeterBill: addSubmeterBill,
  onOpenSubmeter,
  onChanged,
}: {
  account: WaterAccount | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Period the dashboard is currently showing. */
  month: number;
  year: number;
  onEdit: (account: WaterAccount) => void;
  onAddBill: (account: WaterAccount) => void;
  onEditBill: (account: WaterAccount, bill: WaterBill) => void;
  onAddSubmeter?: (account: WaterAccount) => void;
  onEditSubmeter?: (account: WaterAccount, submeter: WaterSubmeter) => void;
  onAddSubmeterBill?: (account: WaterAccount, submeter: WaterSubmeter) => void;
  /** Opens the submeter's own drawer, where its meter readings live. */
  onOpenSubmeter?: (account: WaterAccount, submeter: WaterSubmeter) => void;
  onChanged?: () => void;
}) {
  const { data: bills, loading, refresh } = useWaterBills(
    account ? { accountId: account.id, includeVoided: true } : { accountId: "__none__" },
  );
  // A voided bill stays in the history but no longer counts.
  const active = activeOnly(bills);
  const submeters = useWaterSubmeters(
    React.useMemo(
      () => (account ? { accountId: account.id } : { accountId: "__none__" }),
      [account],
    ),
  );
  const submeterBills = useWaterSubmeterBills(React.useMemo(() => ({}), []));
  const [pendingVoid, setPendingVoid] = React.useState<WaterBill | null>(null);
  const [historyFor, setHistoryFor] = React.useState<WaterBill | null>(null);
  const { user } = useAuth();
  // Voiding a finalized record is the Administrator's (policy 2026-10-20).
  const isAdmin = user?.role === "Administrator";
  // An archived account takes no new bills or submeters until an
  // Administrator restores it (approved 2026-10-21); its history stays.
  const closed = account?.archived === true;
  const onAddBill = closed ? undefined : addBill;
  const onAddSubmeter = closed ? undefined : addSubmeter;
  const onAddSubmeterBill = closed ? undefined : addSubmeterBill;
  const [archiving, setArchiving] = React.useState(false);

  /**
   * Archiving keeps the account and everything it holds (approved
   * 2026-10-21): an account with bills is never deleted.
   */
  const toggleArchive = async (archived: boolean) => {
    if (!account) return;
    setArchiving(true);
    try {
      await archiveWaterAccount(account.id, archived);
      toast.success(archived ? "Account archived — its bills and history are kept" : "Account restored");
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to change the account");
    }
    setArchiving(false);
  };

  const comparison = account ? buildComparisons([account], active, month, year)[0] : null;
  const periods = trailingPeriods(month, year, 6);
  const series = monthlyTotals(active, periods);

  /* Submeter list and the account totals rolled up from it. */
  const ownSubmeters = React.useMemo(
    () => (account ? submetersOf(submeters.data, account.id) : []),
    [submeters.data, account],
  );
  const rollup = React.useMemo(
    () =>
      account ? accountRollup(submeters.data, submeterBills.data, account.id, month, year) : null,
    [submeters.data, submeterBills.data, account, month, year],
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange} size="2xl">
      {!account ? (
        <div className="p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-2 h-3 w-56" />
          <SkeletonText lines={6} className="mt-6" />
        </div>
      ) : (
        <>
          <DrawerHeader
            title={accountLabel(account)}
            description={`${account.accountNumber} · Meter ${account.meterNumber}`}
            onClose={() => onOpenChange(false)}
          >
            {(comparison || account.archived) && (
              <div className="mt-2 flex items-center gap-2">
                {comparison && <StatusBadge status={comparison.status} />}
                {account.archived && (
                  <>
                    <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[#5b606b]">Archived</span>
                    <Caption className="text-[11.5px]">Restore it to record new bills or submeters.</Caption>
                  </>
                )}
              </div>
            )}
          </DrawerHeader>

          <DrawerBody>
            <div className="space-y-5">
              {/* Account information */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <OverlineLabel>Account Number</OverlineLabel>
                  <div className="mt-0.5 text-[12.5px] tabular-nums text-neutral-800">
                    {account.accountNumber}
                  </div>
                </div>
                <div>
                  <OverlineLabel>Meter Number</OverlineLabel>
                  <div className="mt-0.5 inline-flex items-center gap-1.5 text-[12.5px] tabular-nums text-neutral-800">
                    <Gauge className="h-3 w-3 text-neutral-400" />
                    {account.meterNumber}
                  </div>
                </div>
                <div className="col-span-2">
                  <OverlineLabel>Location</OverlineLabel>
                  <div className="mt-0.5 inline-flex items-center gap-1.5 text-[12.5px] text-neutral-800">
                    <MapPin className="h-3 w-3 text-neutral-400" />
                    {account.location}
                  </div>
                </div>
              </div>

              {/* Month-over-month movement */}
              {comparison && (
                <section className="rounded-lg bg-neutral-50/60 p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-neutral-900">
                      {periodLabel(month, year)} vs. previous month
                    </span>
                    <StatusBadge status={comparison.status} />
                  </div>
                  <div className="mt-2.5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div>
                      <OverlineLabel>Current</OverlineLabel>
                      <div className="text-[16px] font-semibold tabular-nums tracking-tight text-neutral-900">
                        {comparison.current === null ? (
                          <span className="text-neutral-300">—</span>
                        ) : (
                          <CurrencyDisplay amount={comparison.current} className="text-[16px]" />
                        )}
                      </div>
                    </div>
                    <div>
                      <OverlineLabel>Previous</OverlineLabel>
                      <div className="text-[16px] font-semibold tabular-nums tracking-tight text-neutral-600">
                        {comparison.previous === null ? (
                          <span className="text-neutral-300">—</span>
                        ) : (
                          <CurrencyDisplay
                            amount={comparison.previous}
                            muted
                            className="text-[16px]"
                          />
                        )}
                      </div>
                    </div>
                    <div>
                      <OverlineLabel>Difference</OverlineLabel>
                      <div
                        className={
                          "text-[16px] font-semibold tabular-nums tracking-tight " +
                          (comparison.status === "Increased"
                            ? "text-red-600"
                            : comparison.status === "Decreased"
                              ? "text-(--tone-settled)"
                              : "text-neutral-500")
                        }
                      >
                        {comparison.status === "No Change"
                          ? "—"
                          : `${comparison.difference > 0 ? "+" : "−"}₱${Math.abs(
                              comparison.difference,
                            ).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`}
                      </div>
                    </div>
                  </div>
                  <p className="mt-2.5 text-[11.5px] text-neutral-600">
                    {comparisonLabel(comparison.status, comparison.difference, comparison.percent)}
                  </p>
                </section>
              )}

              {/* Account totals rolled up from submeters */}
              {rollup && rollup.totalSubmeters > 0 && (
                <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-neutral-200 p-3">
                    <OverlineLabel>Total Water Consumption</OverlineLabel>
                    <div className="mt-0.5 text-[16px] font-semibold tabular-nums tracking-tight text-neutral-900">
                      {rollup.totalConsumption.toLocaleString("en-PH", {
                        maximumFractionDigits: 0,
                      })}
                      <span className="ml-1 text-[11px] font-normal text-neutral-400">m³</span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-neutral-200 p-3">
                    <OverlineLabel>Total Amount</OverlineLabel>
                    <div className="mt-0.5">
                      <CurrencyDisplay
                        amount={rollup.totalAmount}
                        className="text-[16px] font-semibold"
                      />
                    </div>
                  </div>
                  <div className="rounded-lg border border-neutral-200 p-3">
                    <OverlineLabel>Active Submeters</OverlineLabel>
                    <div className="mt-0.5 text-[16px] font-semibold tabular-nums tracking-tight text-neutral-900">
                      {rollup.activeSubmeters}
                      {rollup.totalSubmeters !== rollup.activeSubmeters && (
                        <span className="ml-1 text-[11px] font-normal text-neutral-400">
                          of {rollup.totalSubmeters}
                        </span>
                      )}
                    </div>
                  </div>
                </section>
              )}

              {/* Submeters */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <SectionTitle as="h3">Submeters</SectionTitle>
                  {onAddSubmeter && (
                    <Button variant="secondary" size="xs" onClick={() => onAddSubmeter(account)}>
                      <Plus />
                      Add Submeter
                    </Button>
                  )}
                </div>
                {submeters.loading ? (
                  <SkeletonText lines={3} />
                ) : ownSubmeters.length === 0 ? (
                  <EmptyState
                    icon={Gauge}
                    title="No submeters yet"
                    description="Add a submeter to monitor consumption per office or facility."
                    action={
                      onAddSubmeter
                        ? { label: "Add Submeter", onClick: () => onAddSubmeter(account) }
                        : undefined
                    }
                  />
                ) : (
                  <div className="overflow-hidden rounded-lg border border-neutral-200">
                    <Table minWidth={0} className="min-w-full">
                      <TableHeader>
                        <TableHeaderRow>
                          <TableHead first>Submeter</TableHead>
                          <TableHead>Assigned Office</TableHead>
                          <TableHead>Assigned User</TableHead>
                          <TableHead className="text-right">Latest Reading</TableHead>
                          <TableHead className="text-right">Latest Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right" />
                        </TableHeaderRow>
                      </TableHeader>
                      <TableBody>
                        {ownSubmeters.map((s) => {
                          const latest = latestSubmeterBill(submeterBills.data, s.id);
                          return (
                            <TableRow key={s.id}>
                              <TableCell first className="py-2.5">
                                {onOpenSubmeter ? (
                                  <button
                                    className="text-left transition hover:text-neutral-950"
                                    onClick={() => onOpenSubmeter(account, s)}
                                  >
                                    <div className="font-medium text-neutral-800 underline decoration-neutral-300 underline-offset-2">
                                      {s.submeterName}
                                    </div>
                                    <div className="text-[11px] tabular-nums text-neutral-400">
                                      {s.submeterNumber}
                                    </div>
                                  </button>
                                ) : (
                                  <>
                                    <div className="font-medium text-neutral-800">
                                      {s.submeterName}
                                    </div>
                                    <div className="text-[11px] tabular-nums text-neutral-400">
                                      {s.submeterNumber}
                                    </div>
                                  </>
                                )}
                              </TableCell>
                              <TableCell className="max-w-[150px] py-2.5 text-neutral-600">
                                <span className="block truncate">
                                  {departmentByCode(s.assignedOffice)?.name ?? s.assignedOffice}
                                </span>
                                {(s.assignedDepartment || s.assignedFacility) && (
                                  <span className="block truncate text-[10.5px] text-neutral-400">
                                    {[s.assignedDepartment, s.assignedFacility]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="max-w-[120px] truncate py-2.5 text-neutral-600">
                                {s.assignedUser ?? "—"}
                              </TableCell>
                              <TableCell className="py-2.5 text-right tabular-nums text-neutral-700">
                                {latest ? (
                                  <>
                                    {latest.consumption.toLocaleString("en-PH", {
                                      maximumFractionDigits: 2,
                                    })}
                                    <span className="ml-1 text-[10.5px] text-neutral-400">
                                      m³ · {monthName(latest.billingMonth).slice(0, 3)}{" "}
                                      {latest.billingYear}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-neutral-300">—</span>
                                )}
                              </TableCell>
                              <TableCell className="py-2.5 text-right">
                                {latest ? (
                                  <CurrencyDisplay amount={latest.amount} />
                                ) : (
                                  <span className="text-neutral-300">—</span>
                                )}
                              </TableCell>
                              <TableCell className="py-2.5">
                                <StatusBadge status={s.status} />
                              </TableCell>
                              <TableCell className="py-2.5 text-right">
                                <span className="inline-flex items-center gap-1">
                                  {onAddSubmeterBill && s.status === "Active" && (
                                    <IconButton
                                      aria-label={`Add bill for ${s.submeterNumber}`}
                                      variant="danger"
                                      size="icon-sm"
                                      onClick={() => onAddSubmeterBill(account, s)}
                                    >
                                      <Plus />
                                    </IconButton>
                                  )}
                                  {onEditSubmeter && (
                                    <IconButton
                                      aria-label={`Edit ${s.submeterNumber}`}
                                      variant="ghost"
                                      size="icon-sm"
                                      onClick={() => onEditSubmeter(account, s)}
                                    >
                                      <Pencil />
                                    </IconButton>
                                  )}
                                  <IconButton
                                    aria-label={
                                      s.status === "Active"
                                        ? `Archive ${s.submeterNumber}`
                                        : `Restore ${s.submeterNumber}`
                                    }
                                    variant="ghost"
                                    size="icon-sm"
                                    className="text-neutral-500 hover:bg-neutral-100"
                                    onClick={async () => {
                                      const next = s.status === "Active" ? "Archived" : "Active";
                                      await archiveWaterSubmeter(s.id, next);
                                      toast.success(
                                        next === "Archived"
                                          ? `${s.submeterNumber} archived`
                                          : `${s.submeterNumber} restored`,
                                      );
                                      void submeters.refresh();
                                      onChanged?.();
                                    }}
                                  >
                                    <Archive />
                                  </IconButton>
                                </span>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </section>

              {/* Six-month trend */}
              <section>
                <SectionTitle as="h3" className="mb-2">
                  Six-Month Consumption
                </SectionTitle>
                <div className="rounded-lg border border-neutral-200 p-3">
                  {loading ? (
                    <Skeleton className="h-[180px] w-full rounded-lg" />
                  ) : (
                    <BarChartContainer
                      height={180}
                      data={{
                        labels: periods.map((p) => p.label),
                        datasets: [
                          {
                            label: "Amount",
                            data: series,
                            backgroundColor: chartPalette[1],
                            borderRadius: 6,
                            maxBarThickness: 34,
                          },
                        ],
                      }}
                    />
                  )}
                </div>
              </section>

              {/* Billing history */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <SectionTitle as="h3">Billing History</SectionTitle>
                  {onAddBill && (
                    <Button variant="secondary" size="xs" onClick={() => onAddBill(account)}>
                      <Plus />
                      Record Bill
                    </Button>
                  )}
                </div>
                {loading ? (
                  <SkeletonText lines={5} />
                ) : bills.length === 0 ? (
                  <EmptyState
                    icon={Droplets}
                    title="No billing records yet"
                    description="Record the first monthly water bill for this account."
                    action={onAddBill ? { label: "Record Bill", onClick: () => onAddBill(account) } : undefined}
                  />
                ) : (
                  <div className="overflow-hidden rounded-lg border border-neutral-200">
                    <Table minWidth={0} className="min-w-full">
                      <TableHeader>
                        <TableHeaderRow>
                          <TableHead first>Billing Period</TableHead>
                          <TableHead className="text-right">Consumption (m³)</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Remarks</TableHead>
                          <TableHead>Date Added</TableHead>
                          <TableHead className="text-right" />
                        </TableHeaderRow>
                      </TableHeader>
                      <TableBody>
                        {bills.map((b) => (
                          <TableRow key={b.id}>
                            <TableCell first className="whitespace-nowrap py-2.5">
                              <span className="font-medium text-neutral-800">
                                {monthName(b.billingMonth)} {b.billingYear}
                              </span>
                              {b.docNumber && (
                                <span className="block text-[10.5px] tabular-nums text-neutral-400">
                                  {b.docNumber}
                                </span>
                              )}
                              {b.voided && (
                                <span className="mt-0.5 block text-[10.5px] font-semibold uppercase tracking-wide text-[#5b606b]">
                                  Voided
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="py-2.5 text-right tabular-nums text-neutral-700">
                              {b.consumption.toLocaleString("en-PH", { maximumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="py-2.5 text-right">
                              <CurrencyDisplay amount={b.amount} />
                            </TableCell>
                            <TableCell className="max-w-[180px] truncate py-2.5 text-neutral-500">
                              {b.remarks ?? "—"}
                            </TableCell>
                            <TableCell className="whitespace-nowrap py-2.5 text-neutral-500">
                              {format(new Date(b.createdAt), "d MMM yyyy")}
                            </TableCell>
                            <TableCell className="py-2.5 text-right">
                              <span className="inline-flex items-center gap-1">
                                {!b.voided && (
                                  <IconButton
                                    aria-label={`Correct the ${monthName(b.billingMonth)} ${b.billingYear} bill`}
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => onEditBill(account, b)}
                                  >
                                    <Pencil />
                                  </IconButton>
                                )}
                                {hasHistory(b) && (
                                  <IconButton
                                    aria-label={`History of the ${monthName(b.billingMonth)} ${b.billingYear} bill`}
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={() => setHistoryFor(b)}
                                  >
                                    <History />
                                  </IconButton>
                                )}
                                {!b.voided && isAdmin && (
                                  <IconButton
                                    aria-label={`Void the ${monthName(b.billingMonth)} ${b.billingYear} bill`}
                                    variant="danger"
                                    size="icon-sm"
                                    onClick={() => setPendingVoid(b)}
                                  >
                                    <Ban />
                                  </IconButton>
                                )}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <Caption as="p" className="mt-2 text-[10.5px]">
                  Registered {format(new Date(account.createdAt), "d MMMM yyyy")} · {bills.length}{" "}
                  billing record{bills.length === 1 ? "" : "s"}
                </Caption>
              </section>
            </div>
          </DrawerBody>

          <DrawerFooter>
            <DrawerActions>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              {isAdmin && (
                <Button variant="ghost" loading={archiving} onClick={() => void toggleArchive(!account.archived)}>
                  {account.archived ? <ArchiveRestore /> : <Archive />}
                  {account.archived ? "Restore Account" : "Archive Account"}
                </Button>
              )}
              <Button variant="secondary" onClick={() => onEdit(account)}>
                <Pencil />
                Edit Account
              </Button>
              {onAddBill && (
                <Button onClick={() => onAddBill(account)}>
                  <Plus />
                  Record Bill
                </Button>
              )}
            </DrawerActions>
          </DrawerFooter>

          <VoidRecordDialog
            open={!!pendingVoid}
            onOpenChange={(o) => !o && setPendingVoid(null)}
            title={
              pendingVoid
                ? `Void the ${monthName(pendingVoid.billingMonth)} ${pendingVoid.billingYear} bill?`
                : "Void bill?"
            }
            description="The bill keeps its number and values and stays in this history, but no longer counts in totals or comparisons. Its month becomes free, so the corrected bill can be recorded."
            onVoid={(reason) => voidWaterBill(pendingVoid!.id, reason)}
            onDone={() => {
              setPendingVoid(null);
              void refresh();
              onChanged?.();
            }}
          />
          <RecordHistoryDialog
            open={!!historyFor}
            onOpenChange={(o) => !o && setHistoryFor(null)}
            title={historyFor ? `${historyFor.docNumber ?? "Bill"} — history` : "History"}
            record={historyFor}
          />
        </>
      )}
    </Drawer>
  );
}
