import * as React from "react";
import { useNavigate } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { FileCheck2, Plus } from "lucide-react";

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
import { RecordsNav } from "@/features/records/room/records-nav";
import { useAuth } from "@/features/auth/auth-context";
import { can } from "@/features/auth/types";
import { useDisposalRequests } from "@/features/records/disposal-hooks";
import type { DisposalRequest } from "@/features/records/disposal-types";
import { SCHEDULE_STATUSES } from "@/features/records/types";

const ALL = "__all";

/** dd MMM yyyy, as the register lists a filing date. */
const listDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-PH", { day: "2-digit", month: "short", year: "numeric" });
};

/**
 * The disposal request register.
 *
 * One row per request for authority to dispose, newest first. Nothing here may
 * be destroyed until the National Archives returns the request approved.
 */
export function DisposalListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState(ALL);

  const filters = React.useMemo(
    () => ({
      search: search || undefined,
      status: status === ALL ? undefined : (status as DisposalRequest["status"]),
    }),
    [search, status],
  );

  const { data, counts, loading } = useDisposalRequests(filters);

  const columns = React.useMemo<ColumnDef<DisposalRequest, unknown>[]>(
    () => [
      {
        accessorKey: "requestNo",
        header: "Request No.",
        cell: ({ row }) => (
          <span className="font-medium tabular-nums">{row.original.requestNo}</span>
        ),
      },
      { accessorKey: "agencyName", header: "Agency" },
      {
        accessorKey: "requestDate",
        header: "Date",
        cell: ({ row }) => listDate(row.original.requestDate),
      },
      {
        id: "location",
        header: "Location of Records",
        cell: ({ row }) => row.original.locationOfRecords || "—",
      },
      {
        id: "volume",
        header: "Volume (m³)",
        cell: ({ row }) => row.original.volumeCubicMeter || "—",
      },
      {
        id: "items",
        header: "Record Series",
        cell: ({ row }) => <span className="tabular-nums">{counts[row.original.id] ?? 0}</span>,
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
        title="Request for Authority to Dispose of Records"
        description="NAP Form No. 3. No public record may be destroyed without the prior written authority of the National Archives."
        actions={
          can(user, "manage:records") ? (
            <Button onClick={() => navigate("/records/disposal/new")}>
              <Plus className="mr-2 h-4 w-4" />
              New Request
            </Button>
          ) : undefined
        }
      />
      <RecordsNav />

      <TableCard
        toolbar={
          <FilterBar>
            <SearchBar
              placeholder="Search request no., agency or location…"
              widthClassName="w-72"
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
          onRowClick={(r) => navigate(`/records/disposal/${r.id}`)}
          emptyState={{
            title: "No disposal requests yet",
            description:
              "A request asks the National Archives for written authority before any record is destroyed.",
            icon: FileCheck2,
            action: can(user, "manage:records")
              ? { label: "New Request", onClick: () => navigate("/records/disposal/new") }
              : undefined,
          }}
        />
      </TableCard>
    </PageTransition>
  );
}
