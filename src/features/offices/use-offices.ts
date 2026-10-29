import * as React from "react";

import { listOffices, type Office } from "@/features/offices/api";
import { departmentByCode } from "@/features/purchase-requests/types";

/**
 * The office directory behind every Office / Department field and filter
 * (29 Oct 2026): loaded once and shared by every field on the page, fetched
 * again when it is more than a minute old, and replaced at once when
 * Settings changes it, so every open list follows.
 */

interface OfficesState {
  status: "loading" | "ready" | "error";
  offices: Office[];
}

const FRESH_MS = 60 * 1000;
let state: OfficesState = { status: "loading", offices: [] };
let fetchedAt = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

const emit = (next: OfficesState) => {
  state = next;
  for (const l of listeners) l();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Loads the list unless a fresh one is already here or on its way. */
function load(): void {
  if (inflight || (state.status === "ready" && Date.now() - fetchedAt < FRESH_MS)) return;
  inflight = listOffices()
    .then(
      (offices) => {
        fetchedAt = Date.now();
        emit({ status: "ready", offices });
      },
      () => {
        // A list already shown stays; only a first load that fails says so.
        if (state.status !== "ready") emit({ status: "error", offices: state.offices });
      },
    )
    .finally(() => {
      inflight = null;
    });
}

/** The list as Settings left it after a change, for every field at once. */
export function setOffices(offices: Office[]): void {
  fetchedAt = Date.now();
  emit({ status: "ready", offices });
}

export function useOffices(): OfficesState & { reload: () => void } {
  const snapshot = React.useSyncExternalStore(subscribe, () => state);
  React.useEffect(load, []);
  return { ...snapshot, reload: load };
}

/**
 * The options for an office field or filter: the active offices, in their
 * order. When a record already holds an office that is no longer listed —
 * renamed or removed since, or one of the short codes used before
 * 29 Oct 2026 — that value is kept as the first option, so editing an older
 * record never changes its office.
 */
export function useOfficeOptions(current?: string) {
  const { offices, status, reload } = useOffices();
  const options = React.useMemo(() => {
    const list = offices.map((o) => ({ value: o.name, label: o.name }));
    if (current && !offices.some((o) => o.name === current)) {
      list.unshift({ value: current, label: `${departmentByCode(current).name} (not on the current list)` });
    }
    return list;
  }, [offices, current]);
  return { options, status, reload };
}
