import * as React from "react";
import { useNavigate } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { Archive, Layers, Plus } from "lucide-react";

import {
  Button,
  DropdownFilter,
  EnterpriseTable,
  FilterBar,
  PageHeader,
  PageTransition,
  SearchBar,
  StatusBadge,
  TableCard,
  type DocumentStatus,
} from "@/components";
import { useAuth } from "@/features/auth/auth-context";
import { can } from "@/features/auth/types";
import { useSchedules } from "@/features/records/hooks";
import { SCHEDULE_STATUSES, type DispositionSchedule } from "@/features/records/types";

const ALL = "__all";

/** dd MMM yyyy, as the register lists a filing date. */
const listDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-PH", { day: "2-digit", month: "short", year: "numeric" });
};

/**
 * Records Management — the disposition schedule register.
 *
 * One row per schedule filed with the National Archives, newest first, with
 * the number of record series each one covers.
 */
export function RecordsListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState(ALL);

  const filters = React.useMemo(
    () => ({
      search: search || undefined,
      status: status === ALL ? undefined : (status as DispositionSchedule["status"]),
    }),
    [search, status],
  );

  const { data, counts, loading } = useSchedules(filters);

  const columns = React.useMemo<ColumnDef<DispositionSchedule, unknown>[]>(
    () => [
      {
        accessorKey: "scheduleNo",
        header: "Schedule No.",
        cell: ({ row }) => (
          <span className="font-medium tabular-nums">{row.original.scheduleNo}</span>
        ),
      },
      { accessorKey: "agencyName", header: "Agency" },
      {
        accessorKey: "datePrepared",
        header: "Date Prepared",
        cell: ({ row }) => listDate(row.original.datePrepared),
      },
      {
        id: "series",
        header: "Record Series",
        cell: ({ row }) => (
          <span className="tabular-nums">{counts[row.original.id] ?? 0}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status as DocumentStatus} />,
      },
    ],
    [counts],
  );

  return (
    <PageTransition className="space-y-6">
      <PageHeader
        title="Records Management"
        description="Records disposition schedules filed with the National Archives of the Philippines."
        actions={
          <div className="flex items-center gap-2">
            {/* A schedule says how long a series is kept; the room says where
                it is. The two belong to each other, so each opens the other. */}
            <Button variant="outline" onClick={() => navigate("/records/shelves")}>
              <Layers className="mr-2 h-4 w-4" />
              Records Room
            </Button>
            {can(user, "manage:records") && (
              <Button onClick={() => navigate("/records/new")}>
                <Plus className="mr-2 h-4 w-4" />
                New Schedule
              </Button>
            )}
          </div>
        }
      />

      <TableCard
        toolbar={
          <FilterBar>
            <SearchBar
              placeholder="Search schedule no. or agency…"
              widthClassName="w-64"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <DropdownFilter
              label="Status"
              value={status}
              onChange={setStatus}
              options={[
                { value: ALL, label: "All statuses" },
                ...SCHEDULE_STATUSES.map((s) => ({ value: s, label: s })),
                { value: "Cancelled", label: "Cancelled" },
              ]}
            />
          </FilterBar>
        }
      >
        <EnterpriseTable
          columns={columns}
          data={data}
          loading={loading}
          pageSize={15}
          getRowId={(r) => r.id}
          onRowClick={(r) => navigate(`/records/${r.id}`)}
          emptyState={{
            title: "No disposition schedules yet",
            description:
              "A schedule declares how long each record series is kept, as required by RA 9470 s. 2007.",
            icon: Archive,
            action: can(user, "manage:records")
              ? { label: "New Schedule", onClick: () => navigate("/records/new") }
              : undefined,
          }}
        />
      </TableCard>
    </PageTransition>
  );
}
