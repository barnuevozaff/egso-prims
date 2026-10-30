import * as React from "react";
import { useNavigate } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardList, Plus } from "lucide-react";

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
import { useAppraisals } from "@/features/records/inventory-hooks";
import type { InventoryAppraisal } from "@/features/records/inventory-types";
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
 * The records inventory register.
 *
 * One row per inventory filed with the National Archives, newest first, with
 * the number of record series each one covers.
 */
export function InventoryListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState(ALL);

  const filters = React.useMemo(
    () => ({
      search: search || undefined,
      status: status === ALL ? undefined : (status as InventoryAppraisal["status"]),
    }),
    [search, status],
  );

  const { data, counts, loading } = useAppraisals(filters);

  const columns = React.useMemo<ColumnDef<InventoryAppraisal, unknown>[]>(
    () => [
      {
        accessorKey: "inventoryNo",
        header: "Inventory No.",
        cell: ({ row }) => (
          <span className="font-medium tabular-nums">{row.original.inventoryNo}</span>
        ),
      },
      { accessorKey: "officeName", header: "Office" },
      {
        id: "department",
        header: "Department / Division",
        cell: ({ row }) => row.original.departmentDivision || "—",
      },
      {
        accessorKey: "datePrepared",
        header: "Date Prepared",
        cell: ({ row }) => listDate(row.original.datePrepared),
      },
      {
        id: "records",
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
        title="Records Inventory and Appraisal"
        description="What the office holds, and the values that justify how long each series is kept."
        actions={
          can(user, "manage:records") ? (
            <Button onClick={() => navigate("/records/inventory/new")}>
              <Plus className="mr-2 h-4 w-4" />
              New Inventory
            </Button>
          ) : undefined
        }
      />
      <RecordsNav />

      <TableCard
        toolbar={
          <FilterBar>
            <SearchBar
              placeholder="Search inventory no., office or division…"
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
          onRowClick={(r) => navigate(`/records/inventory/${r.id}`)}
          emptyState={{
            title: "No records inventories yet",
            description:
              "An inventory describes what the office holds — volume, medium, location — and appraises each series.",
            icon: ClipboardList,
            action: can(user, "manage:records")
              ? { label: "New Inventory", onClick: () => navigate("/records/inventory/new") }
              : undefined,
          }}
        />
      </TableCard>
    </PageTransition>
  );
}
