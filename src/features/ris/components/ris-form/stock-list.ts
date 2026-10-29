import * as React from "react";

import { listStock, type StockSuggestion } from "@/features/ris/api";

/**
 * The GSO stock list behind the portal's item picker (29 Oct 2026). It is
 * fetched once and shared by every item row, so typing filters it at once
 * with no further call; a row clicked more than a minute later fetches it
 * again, so an item GSO has just added shows up.
 */
const FRESH_MS = 60 * 1000;
let cache: { at: number; promise: Promise<StockSuggestion[]> } | null = null;

/** One entry per register item, even if an answer repeats one. */
function dedupe(rows: StockSuggestion[]) {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = r.id || `${r.name}|${r.unit}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function load(): Promise<StockSuggestion[]> {
  if (!cache || Date.now() - cache.at > FRESH_MS) {
    const promise = listStock().then(dedupe);
    cache = { at: Date.now(), promise };
    // A failed load is not kept: the next click tries again.
    promise.catch(() => {
      if (cache?.promise === promise) cache = null;
    });
  }
  return cache.promise;
}

export interface StockList {
  status: "loading" | "ready" | "error";
  /** The list last loaded, kept on screen while a fresh one loads. */
  items: StockSuggestion[];
  /** Loads the list again if it is more than a minute old. */
  refresh: () => void;
}

/** With `enabled` false (the admin form, which reads the register itself) it loads nothing. */
export function useStockList(enabled = true): StockList {
  const [state, setState] = React.useState<Omit<StockList, "refresh">>({ status: "loading", items: [] });
  const mounted = React.useRef(true);

  const refresh = React.useCallback(() => {
    if (!enabled) return;
    setState((s) => (s.status === "error" ? { status: "loading", items: s.items } : s));
    load().then(
      (items) => {
        // The list already shown changes nothing, so the rows do not render again.
        if (mounted.current) setState((s) => (s.status === "ready" && s.items === items ? s : { status: "ready", items }));
      },
      () => {
        if (mounted.current) setState((s) => ({ status: "error", items: s.items }));
      },
    );
  }, [enabled]);

  React.useEffect(() => {
    mounted.current = true;
    refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  return { ...state, refresh };
}

/**
 * The items whose name or code contains every word typed, ignoring case:
 * "c", "cor", "tape" and "corr tape" all find Correction Tape. Names that
 * start with the text come first, then names with a word that starts with
 * it, then the rest, each A to Z. With nothing typed, the whole list.
 */
export function matchStock(items: StockSuggestion[], query: string): StockSuggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  const words = q.split(/\s+/);
  const rank = (name: string) => {
    const n = name.toLowerCase();
    if (n.startsWith(q)) return 0;
    if (n.split(/[^\p{L}\p{N}]+/u).some((w) => w.startsWith(words[0]))) return 1;
    return 2;
  };
  return items
    .filter((i) => {
      const text = `${i.name} ${i.code}`.toLowerCase();
      return words.every((w) => text.includes(w));
    })
    .map((i) => ({ i, rank: rank(i.name) }))
    .sort((a, b) => a.rank - b.rank || a.i.name.localeCompare(b.i.name))
    .map(({ i }) => i);
}
