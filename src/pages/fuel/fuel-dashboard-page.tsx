import * as React from "react";
import { useNavigate } from "react-router-dom";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import {
  Car,
  Fuel,
  Gauge,
  MapPin,
  Plus,
  Route,
  TrendingUp,
  Droplet,
  CircleAlert,
} from "lucide-react";

import {
  Button,
  DeleteModal,
  DocumentNumber,
  DropdownFilter,
  EnterpriseTable,
  ExportButton,
  FilterBar,
  OverlineLabel,
  PageHeader,
  PageTransition,
  PrintButton,
  SearchBar,
  StatusBadge,
  TableCard,
  toast,
} from "@/components";
import { deleteFuelVehicles } from "@/features/fuel/api";
import {
  useFuelOdometerReadings,
  useFuelTransactions,
  useFuelTrips,
  useFuelVehicles,
} from "@/features/fuel/hooks";
import {
  buildVehicleHistory,
  latestOdometer,
  summariseTrips,
  tripInPeriod,
  tripYears,
} from "@/features/fuel/lib";
import {
  FUEL_TYPES,
  MONTHS,
  monthName,
  VEHICLE_STATUSES,
  type FuelOdometerReading,
  type FuelTransaction,
  type FuelTrip,
  type FuelVehicle,
  type VehicleTripHistory,
} from "@/features/fuel/types";
import { FuelMetricCard } from "@/features/fuel/components/fuel-metric-card";
import { FuelVehicleDrawer } from "@/features/fuel/components/fuel-vehicle-drawer";
import { FuelVehicleForm } from "@/features/fuel/components/fuel-vehicle-form";
import { FuelTripForm } from "@/features/fuel/components/fuel-trip-form";
import { FuelTransactionForm } from "@/features/fuel/components/fuel-transaction-form";
import { FuelOdometerForm } from "@/features/fuel/components/fuel-odometer-form";
import { BulkActionBar } from "@/features/shared/bulk-action-bar";
import { DEPARTMENTS, departmentByCode } from "@/features/purchase-requests/types";

const ALL = "__all";
const now = new Date();

const isoToday = () =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

const km = (n: number) => n.toLocaleString("en-PH", { maximumFractionDigits: 2 });
const litres = (n: number) => n.toLocaleString("en-PH", { maximumFractionDigits: 2 });

/** One vehicle row of the registry, with its trip rollup for the period. */
interface VehicleRow {
  vehicle: FuelVehicle;
  history: VehicleTripHistory;
  periodTrips: number;
  periodDistance: number;
  periodFuelUsed: number;
}

/**
 * Fuel Consumption — trip-based monitoring. Every figure on this page derives
 * from recorded trips: purchases are now an input to a trip, not the record.
 */
export function FuelDashboardPage() {
  const navigate = useNavigate();

  /* ---------------- period + filters ---------------- */
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [year, setYear] = React.useState(now.getFullYear());
  const [search, setSearch] = React.useState("");
  const [office, setOffice] = React.useState(ALL);
  const [fuelType, setFuelType] = React.useState(ALL);
  const [status, setStatus] = React.useState(ALL);

  const vehicleFilters = React.useMemo(
    () => ({
      search: search || undefined,
      officeCode: office === ALL ? undefined : office,
      fuelType: fuelType === ALL ? undefined : fuelType,
      status: status === ALL ? undefined : status,
    }),
    [search, office, fuelType, status],
  );

  const vehicles = useFuelVehicles(vehicleFilters);
  // The unfiltered registry drives the KPIs and the vehicle pickers.
  const allVehicles = useFuelVehicles(React.useMemo(() => ({}), []));
  const allTrips = useFuelTrips(React.useMemo(() => ({}), []));
  const transactions = useFuelTransactions(React.useMemo(() => ({}), []));
  const odometer = useFuelOdometerReadings(React.useMemo(() => ({}), []));
  const loading = vehicles.loading || allTrips.loading;

  const refreshAll = () => {
    void vehicles.refresh();
    void allVehicles.refresh();
    void allTrips.refresh();
    void transactions.refresh();
    void odometer.refresh();
  };

  const vehicleById = React.useMemo(
    () => new Map(allVehicles.data.map((v) => [v.id, v])),
    [allVehicles.data],
  );

  /* ---------------- operational figures ---------------- */
  const today = isoToday();
  const todayTrips = React.useMemo(
    () => allTrips.data.filter((t) => t.tripDate === today),
    [allTrips.data, today],
  );
  const todayTotals = React.useMemo(() => summariseTrips(todayTrips), [todayTrips]);

  const periodTrips = React.useMemo(
    () => allTrips.data.filter((t) => tripInPeriod(t, month, year)),
    [allTrips.data, month, year],
  );
  const periodTotals = React.useMemo(() => summariseTrips(periodTrips), [periodTrips]);

  const fuelRemaining = React.useMemo(
    () =>
      allVehicles.data
        .filter((v) => v.status === "Active")
        .reduce((s, v) => s + v.currentFuelBalance, 0),
    [allVehicles.data],
  );
  // Trips saved but not yet closed out — the queue the administrator works from.
  const pendingEntries = React.useMemo(
    () => allTrips.data.filter((t) => t.status === "Draft").length,
    [allTrips.data],
  );

  const years = React.useMemo(() => {
    const ys = tripYears(allTrips.data);
    return ys.length ? ys : [now.getFullYear()];
  }, [allTrips.data]);

  /* ---------------- vehicle table rows ---------------- */
  const vehicleRows = React.useMemo<VehicleRow[]>(
    () =>
      vehicles.data.map((v) => {
        const inPeriod = periodTrips.filter((t) => t.vehicleId === v.id);
        const totals = summariseTrips(inPeriod);
        return {
          vehicle: v,
          history: buildVehicleHistory(v, allTrips.data),
          periodTrips: totals.trips,
          periodDistance: totals.distance,
          periodFuelUsed: totals.fuelUsed,
        };
      }),
    [vehicles.data, periodTrips, allTrips.data],
  );

  /* ---------------- selection + drawers ---------------- */
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [selectedRows, setSelectedRows] = React.useState<VehicleRow[]>([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = React.useState(false);

  const [detailVehicle, setDetailVehicle] = React.useState<FuelVehicle | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [formVehicle, setFormVehicle] = React.useState<FuelVehicle | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [tripFormVehicle, setTripFormVehicle] = React.useState<FuelVehicle | null>(null);
  const [tripRecord, setTripRecord] = React.useState<FuelTrip | null>(null);
  const [tripFormOpen, setTripFormOpen] = React.useState(false);
  const [txnVehicle, setTxnVehicle] = React.useState<FuelVehicle | null>(null);
  const [txnRecord, setTxnRecord] = React.useState<FuelTransaction | null>(null);
  const [txnOpen, setTxnOpen] = React.useState(false);
  const [odoVehicle, setOdoVehicle] = React.useState<FuelVehicle | null>(null);
  const [odoRecord, setOdoRecord] = React.useState<FuelOdometerReading | null>(null);
  const [odoOpen, setOdoOpen] = React.useState(false);

  /**
   * The live record for the open drawer. detailVehicle is only a snapshot from
   * the row that was clicked, so it would keep showing the fuel balance and
   * odometer from before a trip was saved.
   */
  const activeVehicle = React.useMemo(
    () => (detailVehicle ? (vehicleById.get(detailVehicle.id) ?? detailVehicle) : null),
    [detailVehicle, vehicleById],
  );

  const openVehicle = (v: FuelVehicle) => {
    setDetailVehicle(v);
    setDetailOpen(true);
  };

  /**
   * Forms launched from the vehicle drawer hand control back to it when they
   * close, so saving a trip returns to the vehicle being worked on rather than
   * all the way out to the registry.
   */
  const [returnVehicle, setReturnVehicle] = React.useState<FuelVehicle | null>(null);

  const leaveDrawerFor = (v: FuelVehicle, open: () => void) => {
    setDetailOpen(false);
    setReturnVehicle(v);
    open();
  };

  const closeThenReturn = (setOpen: (open: boolean) => void) => (open: boolean) => {
    setOpen(open);
    if (open || !returnVehicle) return;
    setDetailVehicle(returnVehicle);
    setDetailOpen(true);
    setReturnVehicle(null);
  };
  const openNewVehicle = () => {
    setFormVehicle(null);
    setFormOpen(true);
  };
  const openEditVehicle = (v: FuelVehicle) => {
    setFormVehicle(v);
    setFormOpen(true);
  };
  /** Toolbar entry point — the drawer lets the administrator pick the vehicle. */
  const openNewTrip = (v: FuelVehicle | null = null) => {
    setTripFormVehicle(v);
    setTripRecord(null);
    setTripFormOpen(true);
  };
  const openEditTrip = (t: FuelTrip) => {
    setTripFormVehicle(vehicleById.get(t.vehicleId) ?? null);
    setTripRecord(t);
    setTripFormOpen(true);
  };
  const openNewTransaction = (v: FuelVehicle | null = null) => {
    setTxnVehicle(v);
    setTxnRecord(null);
    setTxnOpen(true);
  };
  const openEditTransaction = (v: FuelVehicle, t: FuelTransaction) => {
    setTxnVehicle(v);
    setTxnRecord(t);
    setTxnOpen(true);
  };
  const openNewReading = (v: FuelVehicle) => {
    setOdoVehicle(v);
    setOdoRecord(null);
    setOdoOpen(true);
  };
  const openEditReading = (v: FuelVehicle, r: FuelOdometerReading) => {
    setOdoVehicle(v);
    setOdoRecord(r);
    setOdoOpen(true);
  };

  const removeVehicles = async (rows: FuelVehicle[]) => {
    try {
      await deleteFuelVehicles(rows.map((r) => r.id));
    } catch (e) {
      // Records that hold official records are kept (approved 2026-10-21);
      // the others may have been deleted, so the table is refreshed either way.
      toast.error(e instanceof Error ? e.message : "Unable to delete the vehicles");
      setRowSelection({});
      refreshAll();
      return;
    }
    setRowSelection({});
    toast.success(`Deleted ${rows.length} vehicle${rows.length === 1 ? "" : "s"}`);
    refreshAll();
  };

  const download = (name: string, header: string[], lines: string[]) => {
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportVehicles = (rows: VehicleRow[]) => {
    const header = [
      "Plate Number",
      "Vehicle",
      "Type",
      "Office",
      "Fuel Type",
      "Tank Capacity (L)",
      "Rated KM/L",
      "Fuel Balance (L)",
      `Trips — ${monthName(month)} ${year}`,
      "Distance (km)",
      "Fuel Used (L)",
      "Average KM/L",
      "Status",
    ];
    const lines = rows.map((r) =>
      [
        r.vehicle.plateNumber,
        `"${r.vehicle.vehicleName}"`,
        `"${r.vehicle.vehicleType}"`,
        r.vehicle.officeCode,
        r.vehicle.fuelType,
        r.vehicle.tankCapacity,
        r.vehicle.kmPerLiter,
        r.vehicle.currentFuelBalance.toFixed(2),
        r.periodTrips,
        r.periodDistance.toFixed(2),
        r.periodFuelUsed.toFixed(2),
        r.history.averageKmPerLiter ?? "",
        r.vehicle.status,
      ].join(","),
    );
    download(`fuel-vehicles-${year}-${String(month).padStart(2, "0")}.csv`, header, lines);
    toast.success(`Exported ${rows.length} vehicle${rows.length === 1 ? "" : "s"}`);
  };

  /* ---------------- vehicle columns ---------------- */
  const vehicleColumns = React.useMemo<ColumnDef<VehicleRow, unknown>[]>(
    () => [
      {
        header: "Plate Number",
        id: "plateNumber",
        accessorFn: (r) => r.vehicle.plateNumber,
        cell: ({ row }) => (
          <DocumentNumber value={row.original.vehicle.plateNumber} chipColor="bg-violet-500" />
        ),
      },
      {
        header: "Vehicle",
        id: "vehicleName",
        accessorFn: (r) => r.vehicle.vehicleName,
        cell: ({ row }) => (
          <span className="block max-w-[220px] truncate font-medium text-neutral-800">
            {row.original.vehicle.vehicleName}
          </span>
        ),
      },
      {
        header: "Type",
        id: "vehicleType",
        accessorFn: (r) => r.vehicle.vehicleType,
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-neutral-600">{getValue<string>()}</span>
        ),
      },
      {
        header: "Office",
        id: "office",
        accessorFn: (r) => r.vehicle.officeCode,
        cell: ({ getValue }) => (
          <span className="block max-w-[160px] truncate text-neutral-600">
            {departmentByCode(getValue<string>())?.name ?? getValue<string>()}
          </span>
        ),
      },
      {
        header: "Fuel",
        id: "fuelType",
        accessorFn: (r) => r.vehicle.fuelType,
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-neutral-500">{getValue<string>()}</span>
        ),
      },
      {
        header: "Tank (L)",
        id: "tankCapacity",
        accessorFn: (r) => r.vehicle.tankCapacity,
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap tabular-nums text-neutral-600">
            {litres(getValue<number>())}
          </span>
        ),
        meta: { align: "right" as const },
      },
      {
        header: "Rated KM/L",
        id: "kmPerLiter",
        accessorFn: (r) => r.vehicle.kmPerLiter,
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap tabular-nums text-neutral-600">
            {km(getValue<number>())}
          </span>
        ),
        meta: { align: "right" as const },
      },
      {
        header: "Fuel Balance",
        id: "currentFuelBalance",
        accessorFn: (r) => r.vehicle.currentFuelBalance,
        cell: ({ row }) => {
          const { currentFuelBalance, tankCapacity } = row.original.vehicle;
          // Below a quarter tank is the point the office refuels.
          const low = tankCapacity > 0 && currentFuelBalance < tankCapacity * 0.25;
          return (
            <span
              className={
                "whitespace-nowrap tabular-nums font-medium " +
                (low ? "text-amber-600" : "text-neutral-800")
              }
            >
              {litres(currentFuelBalance)} L
            </span>
          );
        },
        meta: { align: "right" as const },
      },
      {
        header: "Trips",
        id: "periodTrips",
        accessorFn: (r) => r.periodTrips,
        cell: ({ getValue }) =>
          getValue<number>() === 0 ? (
            <span className="text-neutral-300">—</span>
          ) : (
            <span className="tabular-nums text-neutral-700">{getValue<number>()}</span>
          ),
        meta: { align: "right" as const },
      },
      {
        header: "Distance",
        id: "periodDistance",
        accessorFn: (r) => r.periodDistance,
        cell: ({ getValue }) =>
          getValue<number>() === 0 ? (
            <span className="text-neutral-300">—</span>
          ) : (
            <span className="whitespace-nowrap tabular-nums text-neutral-700">
              {km(getValue<number>())} km
            </span>
          ),
        meta: { align: "right" as const },
      },
      {
        header: "Fuel Used",
        id: "periodFuelUsed",
        accessorFn: (r) => r.periodFuelUsed,
        cell: ({ getValue }) =>
          getValue<number>() === 0 ? (
            <span className="text-neutral-300">—</span>
          ) : (
            <span className="whitespace-nowrap tabular-nums text-neutral-700">
              {litres(getValue<number>())} L
            </span>
          ),
        meta: { align: "right" as const },
      },
      {
        header: "Avg KM/L",
        id: "averageKmPerLiter",
        accessorFn: (r) => r.history.averageKmPerLiter ?? 0,
        cell: ({ row }) =>
          row.original.history.averageKmPerLiter === null ? (
            <span className="text-neutral-300">—</span>
          ) : (
            <span className="whitespace-nowrap tabular-nums text-neutral-700">
              {km(row.original.history.averageKmPerLiter)}
            </span>
          ),
        meta: { align: "right" as const },
      },
      {
        header: "Status",
        id: "status",
        accessorFn: (r) => r.vehicle.status,
        cell: ({ row }) => <StatusBadge status={row.original.vehicle.status} />,
      },
    ],
    [],
  );

  return (
    <PageTransition className="space-y-4">
      <PageHeader
        title="Fuel Consumption"
        description="Open a vehicle to review its trip history and record new trips."
        actions={
          <Button onClick={openNewVehicle}>
            <Plus />
            New Vehicle
          </Button>
        }
      />

      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-2">
        <OverlineLabel className="mr-1">Reporting Period</OverlineLabel>
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

      {/* Operational cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
        <FuelMetricCard
          label="Registered Vehicles" tone="brand"
          value={allVehicles.data.length}
          icon={Car}
          hint={`${allVehicles.data.filter((v) => v.status === "Active").length} active`}
          loading={allVehicles.loading}
        />
        <FuelMetricCard
          label="Fuel Remaining"
          value={fuelRemaining}
          unit="L"
          decimals={2}
          icon={Fuel}
          hint="Across active vehicles"
          loading={allVehicles.loading}
        />
        <FuelMetricCard
          label="Trips Today"
          value={todayTotals.trips}
          icon={Route}
          hint={today}
          loading={loading}
        />
        <FuelMetricCard
          label="Distance Today"
          value={todayTotals.distance}
          unit="km"
          decimals={2}
          icon={MapPin}
          loading={loading}
        />
        <FuelMetricCard
          label="Fuel Used Today"
          value={todayTotals.fuelUsed}
          unit="L"
          decimals={2}
          icon={Droplet}
          loading={loading}
        />
        <FuelMetricCard
          label="Average KM/L"
          value={periodTotals.averageKmPerLiter ?? 0}
          decimals={2}
          icon={TrendingUp}
          hint={`${monthName(month)} ${year}`}
          loading={loading}
        />
        <FuelMetricCard
          label="Pending Fuel Entries" tone="attention"
          value={pendingEntries}
          icon={pendingEntries > 0 ? CircleAlert : Gauge}
          hint={pendingEntries > 0 ? "Draft trips awaiting completion" : "Nothing pending"}
          loading={loading}
        />
      </div>

      {/* Vehicle registry — open a vehicle to see its trip history and add trips */}
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
                      onClick={() => exportVehicles(vehicleRows)}
                      disabled={vehicleRows.length === 0}
                    />
                    <PrintButton onClick={() => navigate("/fuel/summary")} />
                  </>
                }
              >
                <SearchBar
                  placeholder="Search vehicle, plate, type…"
                  widthClassName="w-56"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <DropdownFilter
                  label="Office"
                  value={office}
                  onChange={setOffice}
                  options={[
                    { value: ALL, label: "All Offices" },
                    ...DEPARTMENTS.map((d) => ({ value: d.code, label: d.name })),
                  ]}
                />
                <DropdownFilter
                  label="Fuel Type"
                  value={fuelType}
                  onChange={setFuelType}
                  options={[
                    { value: ALL, label: "All Fuel Types" },
                    ...FUEL_TYPES.map((t) => ({ value: t, label: t })),
                  ]}
                />
                <DropdownFilter
                  label="Status"
                  value={status}
                  onChange={setStatus}
                  options={[
                    { value: ALL, label: "All Statuses" },
                    ...VEHICLE_STATUSES.map((s) => ({ value: s, label: s })),
                  ]}
                />
              </FilterBar>
            }
          >
            <EnterpriseTable
              columns={vehicleColumns}
              data={vehicleRows}
              loading={vehicles.loading}
              skeletonRows={8}
              fillContainer
              stickyHeader
              pageSize={12}
              minWidth={1560}
              enableRowSelection
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              onSelectedRowsChange={setSelectedRows}
              getRowId={(r) => r.vehicle.id}
              onRowClick={(r) => openVehicle(r.vehicle)}
              emptyState={{
                icon: Fuel,
                title: "No vehicles found",
                description: "Register a government vehicle to begin recording trips.",
                action: { label: "New Vehicle", onClick: openNewVehicle },
              }}
            />
          </TableCard>
        </div>
      </section>

      <BulkActionBar
        count={selectedRows.length}
        onExport={() => exportVehicles(selectedRows)}
        onPrint={() => navigate("/fuel/summary")}
        onDelete={() => setConfirmBulkDelete(true)}
        onClear={() => setRowSelection({})}
      />

      <DeleteModal
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        title={`Delete ${selectedRows.length} vehicle${selectedRows.length === 1 ? "" : "s"}?`}
        description="Only vehicles with no trips, purchases or odometer readings are deleted. A vehicle that holds records is kept — set it Inactive instead."
        onConfirm={async () => {
          await removeVehicles(selectedRows.map((r) => r.vehicle));
          setConfirmBulkDelete(false);
        }}
      />

      <FuelVehicleDrawer
        vehicle={activeVehicle}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        month={month}
        year={year}
        onEdit={(v) => leaveDrawerFor(v, () => openEditVehicle(v))}
        onAddTrip={(v) => leaveDrawerFor(v, () => openNewTrip(v))}
        onEditTrip={(v, t) => leaveDrawerFor(v, () => openEditTrip(t))}
        onAddTransaction={(v) => leaveDrawerFor(v, () => openNewTransaction(v))}
        onEditTransaction={(v, t) => leaveDrawerFor(v, () => openEditTransaction(v, t))}
        onAddReading={(v) => leaveDrawerFor(v, () => openNewReading(v))}
        onEditReading={(v, r) => leaveDrawerFor(v, () => openEditReading(v, r))}
        onChanged={refreshAll}
      />
      <FuelVehicleForm
        open={formOpen}
        onOpenChange={closeThenReturn(setFormOpen)}
        vehicle={formVehicle}
        onSaved={refreshAll}
      />
      <FuelTripForm
        open={tripFormOpen}
        onOpenChange={closeThenReturn(setTripFormOpen)}
        vehicle={tripFormVehicle}
        vehicles={allVehicles.data}
        trip={tripRecord}
        onSaved={refreshAll}
      />
      <FuelTransactionForm
        open={txnOpen}
        onOpenChange={closeThenReturn(setTxnOpen)}
        vehicle={txnVehicle}
        vehicles={allVehicles.data}
        transaction={txnRecord}
        onSaved={refreshAll}
      />
      <FuelOdometerForm
        open={odoOpen}
        onOpenChange={closeThenReturn(setOdoOpen)}
        vehicle={odoVehicle}
        reading={odoRecord}
        carriedPrevious={
          odoVehicle ? (latestOdometer(odometer.data, odoVehicle.id)?.currentOdometer ?? 0) : 0
        }
        onSaved={refreshAll}
      />
    </PageTransition>
  );
}
