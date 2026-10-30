import { SectionTitle } from "@/components";
import { ResEquipmentTable } from "@/features/reservations/components/res-equipment-table";
import { ResOverview } from "@/features/reservations/components/res-overview";
import { buildReservationTimeline } from "@/features/reservations/lib";
import type { Reservation } from "@/features/reservations/types";
import { ClosedNotice, RecordHistory } from "@/features/shared/record-history";

/** A reservation read-only: overview, why it closed, equipment, and — folded away — its history. */
export function ResDetailPanels({ r }: { r: Reservation }) {
  return (
    <div className="space-y-5">
      <ResOverview r={r} />
      <ClosedNotice status={r.status} approvals={r.approvals} />

      <section>
        <SectionTitle as="h3" className="mb-2">
          Borrowed Equipment
        </SectionTitle>
        <ResEquipmentTable equipment={r.equipment} />
      </section>

      <RecordHistory steps={buildReservationTimeline(r)} changes={r.history} updatedAt={r.updatedAt} />
    </div>
  );
}
