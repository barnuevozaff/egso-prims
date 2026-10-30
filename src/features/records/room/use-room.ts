import * as React from "react";

import { listSchedules } from "@/features/records/api";
import { listRequests } from "@/features/records/disposal-api";
import { listAppraisals } from "@/features/records/inventory-api";
import { buildRoom, type CatalogDoc } from "@/features/records/room/room-model";
import { useRecordsRoom } from "@/features/records/shelf-hooks";
import { reportLoadFailure } from "@/features/shared/load-guard";
import { useRealtimeRefresh } from "@/features/shared/use-realtime";

/** The three registers, as one list of documents. */
async function listCatalog(): Promise<CatalogDoc[]> {
  const [schedules, appraisals, requests] = await Promise.all([listSchedules(), listAppraisals(), listRequests()]);
  return [
    ...schedules.map((d) => ({ type: "RDS" as const, id: d.id, number: d.scheduleNo, title: d.agencyName, date: d.datePrepared, status: d.status })),
    ...appraisals.map((d) => ({ type: "RIA" as const, id: d.id, number: d.inventoryNo, title: d.officeName, date: d.datePrepared, status: d.status })),
    ...requests.map((d) => ({ type: "RAD" as const, id: d.id, number: d.requestNo, title: d.agencyName, date: d.requestDate, status: d.status })),
  ];
}

/**
 * The Records Room and the documents to file, read from Firestore and kept
 * current: a placement, a rename or an approval anywhere shows here without
 * a reload.
 */
export function useRoom() {
  const room = useRecordsRoom();
  const [catalog, setCatalog] = React.useState<CatalogDoc[]>([]);
  const [catalogLoading, setCatalogLoading] = React.useState(true);

  const loadCatalog = React.useCallback(async () => {
    try {
      setCatalog(await listCatalog());
    } catch (e) {
      reportLoadFailure(e, "the Records Management registers");
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);
  useRealtimeRefresh(["disposition_schedules", "inventory_appraisals", "disposal_requests"], loadCatalog);

  const model = React.useMemo(
    () => buildRoom({ shelves: room.shelves, boxes: room.boxes, contents: room.contents, catalog }),
    [room.shelves, room.boxes, room.contents, catalog],
  );

  const refresh = React.useCallback(async () => {
    await Promise.all([room.refresh(), loadCatalog()]);
  }, [room, loadCatalog]);

  return { model, loading: room.loading || catalogLoading, failed: room.failed, refresh };
}
