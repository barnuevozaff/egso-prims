import * as React from "react";
import { useNavigate } from "react-router-dom";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { format } from "date-fns";
import {
  Building2,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Plus,
} from "lucide-react";

import {
  Button,
  DepartmentChip,
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
import { useAuth } from "@/features/auth/auth-context";
import { can } from "@/features/auth/types";
import { cancelReservation, exportReservationsCsv } from "@/features/reservations/api";
import { useReservations } from "@/features/reservations/hooks";
import { formatDate } from "@/features/reservations/lib";
import {
  FACILITIES,
  RESERVATION_STATUSES,
  VOIDABLE_RESERVATION_STATUSES,
  facilityName,
  formatTime,
  type Reservation,
  type ReservationStatus,
} from "@/features/reservations/types";
import { useOfficeOptions } from "@/features/offices/use-offices";
import { departmentByCode } from "@/features/purchase-requests/types";
import { BulkActionBar } from "@/features/shared/bulk-action-bar";
import { VoidDialog } from "@/features/shared/void-dialog";
import { ReservationCalendar } from "@/features/reservations/components/reservation-calendar";

const ALL = "__all";

export function ResListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [search, setSearch] = React.useState("");
  const [facility, setFacility] = React.useState(ALL);
  const [department, setDepartment] = React.useState(ALL);
  const [status, setStatus] = React.useState(ALL);

  const filters = React.useMemo(
    () => ({
      search: search || undefined,
      facilityId: facility === ALL ? undefined : facility,
      departmentCode: department === ALL ? undefined : department,
      status: status === ALL ? undefined : (status as ReservationStatus),
    }),
    [search, facility, department, status],
  );

  const { data, loading, refresh } = useReservations(filters);
  // KPI + calendar data always reflect the whole register, independent of filters.
  const stats = useReservations(React.useMemo(() => ({}), []));

  const today = format(new Date(), "yyyy-MM-dd");
  const pendingCount = stats.data.filter((r) => r.status === "Pending").length;
  const approvedCount = stats.data.filter((r) => r.status === "Approved").length;
  const activeCount = stats.data.filter((r) => r.status === "Approved" && r.date === today).length;
  const completedCount = stats.data.filter((r) => r.status === "Completed").length;
  const todayCount = stats.data.filter(
    (r) => r.date === today && !["Cancelled", "Rejected"].includes(r.status),
  ).length;
  const availableFacilities = FACILITIES.filter((f) => f.available).length;

  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [selectedRows, setSelectedRows] = React.useState<Reservation[]>([]);
  const [confirmVoid, setConfirmVoid] = React.useState(false);

  const { options: officeOptions } = useOfficeOptions();

  // A reservation opens on its own page, ready to edit while it can be (30 Oct 2026).
  const openReservation = (r: Reservation) => navigate(`/reservations/${encodeURIComponent(r.id)}`);


  const refreshAll = () => {
    void refresh();
    void stats.refresh();
  };

  const downloadCsv = (rows: Reservation[], suffix: string) => {
    const blob = new Blob([exportReservationsCsv(rows)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reservations-${suffix}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} reservation${rows.length === 1 ? "" : "s"}`);
  };

  // Numbered bookings are voided, never deleted; closed ones are left out.
  const voidable = selectedRows.filter((r) => VOIDABLE_RESERVATION_STATUSES.includes(r.status));

  const columns = React.useMemo<ColumnDef<Reservation, unknown>[]>(
    () => [
      {
        header: "Reservation",
        accessorKey: "resNumber",
        cell: ({ row }) => (
          <DocumentNumber
            value={row.original.resNumber}
            chipColor={departmentByCode(row.original.departmentCode).color}
          />
        ),
      },
      {
        header: "Facility",
        accessorKey: "facilityId",
        cell: ({ getValue }) => (
          <span className="block max-w-[160px] truncate text-neutral-700">
            {facilityName(getValue<string>())}
          </span>
        ),
      },
      {
        header: "Office",
        accessorKey: "departmentCode",
        cell: ({ getValue }) => {
          const dept = departmentByCode(getValue<string>());
          return <DepartmentChip code={dept.code} name={dept.name} color={dept.color} />;
        },
      },
      {
        header: "Borrower",
        accessorKey: "borrower",
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-neutral-600">{getValue<string>()}</span>
        ),
      },
      {
        header: "Purpose",
        accessorKey: "purpose",
        cell: ({ getValue }) => (
          <span className="block max-w-[220px] truncate">{getValue<string>()}</span>
        ),
        meta: { className: "text-neutral-600" },
      },
      {
        header: "Date",
        accessorKey: "date",
        cell: ({ getValue }) => (
          <span className="whitespace-nowrap text-neutral-600">{formatDate(getValue<string>())}</span>
        ),
      },
      {
        header: "Time",
        id: "time",
        accessorFn: (r) => r.startTime,
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular-nums text-neutral-500">
            {formatTime(row.original.startTime)} – {formatTime(row.original.endTime)}
          </span>
        ),
      },
      {
        header: "Status",
        accessorKey: "status",
        cell: ({ getValue }) => <StatusBadge status={getValue<ReservationStatus>()} />,
      },
      {
        header: "Created",
        accessorKey: "createdAt",
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
    <PageTransition className="space-y-4">
      <PageHeader
        title="Facility Reservations"
        description="Schedule municipal facilities, manage bookings, and lend event equipment."
        actions={
          <Button onClick={() => navigate("/reservations/new")}>
            <Plus />
            New Reservation
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <MetricCard label="Pending Reservations" tone="attention" value={pendingCount} icon={Clock3} loading={stats.loading} />
        <MetricCard label="Approved Reservations" tone="positive" value={approvedCount} icon={CheckCircle2} loading={stats.loading} />
        <MetricCard label="Active Today" value={activeCount} icon={CalendarClock} loading={stats.loading} />
        <MetricCard label="Completed" tone="positive" value={completedCount} icon={CalendarCheck2} loading={stats.loading} />
        <MetricCard label="Today's Reservations" value={todayCount} icon={CalendarDays} loading={stats.loading} />
        <MetricCard label="Available Facilities" value={availableFacilities} icon={Building2} loading={stats.loading} />
      </div>

      {/* Primary visual: the interactive calendar */}
      <ReservationCalendar
        reservations={stats.data}
        loading={stats.loading}
        onSelectReservation={openReservation}
      />

      <div className="h-[540px]">
        <TableCard
          fillContainer
          toolbar={
            <FilterBar
              className="shrink-0"
              end={<ExportButton onClick={() => downloadCsv(data, "all")} disabled={data.length === 0} />}
            >
              <SearchBar
                placeholder="Search reservation, borrower…"
                widthClassName="w-56"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <DropdownFilter
                label="Facility"
                value={facility}
                onChange={setFacility}
                options={[
                  { value: ALL, label: "All Facilities" },
                  ...FACILITIES.map((f) => ({ value: f.id, label: f.name })),
                ]}
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
              <DropdownFilter
                label="Status"
                value={status}
                onChange={setStatus}
                options={[
                  { value: ALL, label: "All Statuses" },
                  ...RESERVATION_STATUSES.map((s) => ({ value: s, label: s })),
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
            minWidth={1200}
            enableRowSelection
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            onSelectedRowsChange={setSelectedRows}
            getRowId={(r) => r.id}
            onRowClick={openReservation}
            emptyState={{
              icon: CalendarDays,
              title: "No reservations found",
              description: "Try adjusting the filters, or book a facility for an upcoming activity.",
              action: { label: "New Reservation", onClick: () => navigate("/reservations/new") },
            }}
          />
        </TableCard>
      </div>

      {/* Void and Cancel, as on the other registers (30 Oct 2026). A reservation has no official
          form, so there is no Print here: printing the screen is not a document. */}
      <BulkActionBar
        count={selectedRows.length}
        onVoid={can(user, "manage:reservations") && voidable.length > 0 ? () => setConfirmVoid(true) : undefined}
        onClear={() => setRowSelection({})}
      />

      <VoidDialog
        open={confirmVoid}
        onOpenChange={setConfirmVoid}
        noun="reservation"
        rows={voidable}
        selectedCount={selectedRows.length}
        numberOf={(r) => r.resNumber}
        voidOne={(r, reason) => cancelReservation(r.id, { reason, by: user?.name ?? "Staff", office: user?.office })}
        extraNote="The facility is freed for those dates."
        onDone={() => {
          setRowSelection({});
          refreshAll();
        }}
      />

    </PageTransition>
  );
}
