import * as React from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { usesFirestore } from "@/lib/data-backend";

/**
 * One Realtime channel per table, shared by everything watching it.
 *
 * Every caller used to open a channel of its own, named with a random suffix.
 * On the dashboard that meant the shell's badge counts and the dashboard's own
 * data each joined `purchase_requests`, `purchase_orders`, `reservations` and
 * `inventory_items` separately — eight subscriptions where four would do, each
 * a join round trip on the socket, and every change delivered twice.
 *
 * A table is now joined once, on the first thing that asks for it, and left
 * open while anything is still listening. Moving between two pages that watch
 * the same table no longer tears the channel down and joins it again. The last
 * listener to leave closes it, so nothing is left running after sign-out.
 *
 * Tables already on Firestore (lib/data-backend.ts) are watched with a
 * listener on the one most recently changed document instead: every write
 * stamps updated_at (the stock card stamps date), so any create or edit moves
 * a document to the top and fires the listener, for one document read per
 * change rather than the whole collection. Deleting a document that is not
 * the newest does not fire it; the screen that deletes refreshes itself.
 */
const listeners = new Map<string, Set<() => void>>();
const closers = new Map<string, () => void>();

/** The field each Firestore collection stamps on every write. */
const CHANGE_FIELD: Record<string, string> = {
  stock_card: "date",
  notifications: "created_at",
  audit_logs: "timestamp",
};

function openSupabaseChannel(table: string, deliver: () => void): () => void {
  const channel: RealtimeChannel = supabase!
    .channel(`rt-${table}`)
    .on("postgres_changes", { event: "*", schema: "public", table }, deliver)
    .subscribe();
  return () => void supabase?.removeChannel(channel);
}

// The Firebase SDK is loaded only when a Firestore table is watched, so a
// Supabase build never downloads it.
function openFirestoreListener(table: string, deliver: () => void): () => void {
  let unsubscribe: (() => void) | undefined;
  let closed = false;
  void Promise.all([import("firebase/firestore"), import("@/lib/firestore")]).then(([fs, lib]) => {
    if (closed) return;
    let first = true;
    unsubscribe = fs.onSnapshot(
      fs.query(fs.collection(lib.firestore(), table), fs.orderBy(CHANGE_FIELD[table] ?? "updated_at", "desc"), fs.limit(1)),
      () => {
        // The first snapshot is the current state, not a change.
        if (first) {
          first = false;
          return;
        }
        deliver();
      },
      // Signed-out visitors may not list staff collections: no live updates.
      () => undefined,
    );
  });
  return () => {
    closed = true;
    unsubscribe?.();
  };
}

/** Registers a listener on a table's channel. Returns its unsubscribe. */
function watchTable(table: string, fire: () => void): () => void {
  let subscribers = listeners.get(table);

  if (!subscribers) {
    subscribers = new Set();
    listeners.set(table, subscribers);
    // Read the set at delivery time: a page may have come or gone since the
    // channel was opened.
    const deliver = () => {
      for (const listener of listeners.get(table) ?? []) listener();
    };
    closers.set(
      table,
      usesFirestore(table) ? openFirestoreListener(table, deliver) : openSupabaseChannel(table, deliver),
    );
  }

  subscribers.add(fire);

  return () => {
    const remaining = listeners.get(table);
    if (!remaining) return;
    remaining.delete(fire);
    if (remaining.size > 0) return;
    listeners.delete(table);
    closers.get(table)?.();
    closers.delete(table);
  };
}

/**
 * Re-runs `onChange` when any of the given tables changes, debounced so a
 * multi-row write refreshes once. No-op for a Supabase table when Supabase
 * isn't configured.
 */
export function useRealtimeRefresh(tables: string | string[], onChange: () => void) {
  const cb = React.useRef(onChange);
  cb.current = onChange;
  const key = Array.isArray(tables) ? tables.join(",") : tables;

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fire = () => {
      clearTimeout(timer);
      timer = setTimeout(() => cb.current(), 250);
    };
    const unwatch = key
      .split(",")
      .filter((table) => usesFirestore(table) || supabase)
      .map((table) => watchTable(table, fire));
    return () => {
      clearTimeout(timer);
      for (const off of unwatch) off();
    };
  }, [key]);
}
