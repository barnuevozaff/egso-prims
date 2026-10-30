import { SectionTitle } from "@/components";
import { buildRISTimeline } from "@/features/ris/lib";
import type { RequestForIssuance } from "@/features/ris/types";
import { RISItemsTable } from "@/features/ris/components/ris-items-table";
import { RISOverview } from "@/features/ris/components/ris-overview";
import { ClosedNotice, RecordHistory } from "@/features/shared/record-history";

/** Full RIS body: overview, items issued, and — folded away — its history. */
export function RISDetailPanels({ ris }: { ris: RequestForIssuance }) {
  return (
    <div className="space-y-5">
      <RISOverview ris={ris} />
      <ClosedNotice status={ris.status} approvals={ris.approvals} />

      <section>
        <SectionTitle as="h3" className="mb-2">
          Items Issued
        </SectionTitle>
        <RISItemsTable items={ris.items} />
      </section>

      <RecordHistory steps={buildRISTimeline(ris)} changes={ris.history} updatedAt={ris.updatedAt} />
    </div>
  );
}
