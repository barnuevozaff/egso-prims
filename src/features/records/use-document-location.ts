import * as React from "react";

import { locateDocument } from "@/features/records/shelf-api";
import type { DocType, DocumentLocation } from "@/features/records/shelf-types";
import { useRealtimeRefresh } from "@/features/shared/use-realtime";

/**
 * Where one document is filed, for its own page (30 Oct 2026): four reads
 * instead of the whole Records Room, refreshed when anything is placed or
 * moved. `undefined` while it is being read, `null` when it is in no box.
 */
export function useDocumentLocation(type: DocType, sourceId: string | undefined, enabled = true) {
  const [location, setLocation] = React.useState<DocumentLocation | null | undefined>(undefined);
  const load = React.useCallback(async () => {
    if (!sourceId || !enabled) {
      setLocation(null);
      return;
    }
    try {
      setLocation(await locateDocument(type, sourceId));
    } catch {
      setLocation(null);
    }
  }, [type, sourceId, enabled]);

  React.useEffect(() => {
    void load();
  }, [load]);
  useRealtimeRefresh(enabled && sourceId ? "record_box_contents" : "", load);
  return location;
}
