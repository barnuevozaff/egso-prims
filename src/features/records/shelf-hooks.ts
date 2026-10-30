import * as React from "react";

import { reportLoadFailure } from "@/features/shared/load-guard";
import { useRealtimeRefresh } from "@/features/shared/use-realtime";
import { listBoxes, listContents, listShelves } from "@/features/records/shelf-api";
import type { BoxContent, RecordBox, ShelfWithLevels } from "@/features/records/shelf-types";

/**
 * The Records Room, read as one picture: shelves, the boxes standing on them,
 * and the documents in the boxes. Loaded together because a box means little
 * without its place, and a place little without what stands there.
 */
export function useRecordsRoom() {
  const [shelves, setShelves] = React.useState<ShelfWithLevels[]>([]);
  const [boxes, setBoxes] = React.useState<RecordBox[]>([]);
  const [contents, setContents] = React.useState<BoxContent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const [s, b, c] = await Promise.all([listShelves(), listBoxes(), listContents()]);
      setShelves(s);
      setBoxes(b);
      setContents(c);
      setFailed(false);
    } catch (e) {
      setFailed(true);
      reportLoadFailure(e, "the Records Room");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Only the room's own collections (30 Oct 2026). Approving no longer files a
  // document, and what a save does to its box line is written to
  // record_box_contents, which is watched; the registers have their own watch.
  useRealtimeRefresh(["record_shelves", "record_shelf_levels", "record_boxes", "record_box_contents"], load);

  return { shelves, boxes, contents, loading, failed, refresh: load };
}
