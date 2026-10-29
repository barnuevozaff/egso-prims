import * as React from "react";

import { useRealtimeRefresh } from "@/features/shared/use-realtime";
import { reportLoadFailure } from "@/features/shared/load-guard";

import {
  getInventoryItem,
  listInventoryCategories,
  listInventoryItems,
  listStockCard,
} from "@/features/inventory/api";
import { STANDARD_CATEGORIES, mergeCategories } from "@/features/inventory/categories";
import type {
  InventoryItem,
  InventoryListFilters,
  StockCardEntry,
} from "@/features/inventory/types";

/** List query with loading state and manual refresh. */
export function useInventoryItems(filters: InventoryListFilters) {
  const [data, setData] = React.useState<InventoryItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const requestSeq = React.useRef(0);

  const filtersKey = JSON.stringify({
    ...filters,
    dateFrom: filters.dateFrom?.toISOString() ?? null,
    dateTo: filters.dateTo?.toISOString() ?? null,
  });
  const filtersRef = React.useRef(filters);
  filtersRef.current = filters;

  const load = React.useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const rows = await listInventoryItems(filtersRef.current);
      if (seq === requestSeq.current) setData(rows);
    } catch (e) {
      if (seq === requestSeq.current) reportLoadFailure(e, "inventory items");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, load]);

  useRealtimeRefresh("inventory_items", load);

  return { data, loading, refresh: load };
}

/** Single-record query keyed by id. */
export function useInventoryItem(id: string | null) {
  const [data, setData] = React.useState<InventoryItem | null>(null);
  const [loading, setLoading] = React.useState(!!id);

  const load = React.useCallback(async () => {
    if (!id) {
      setData(null);
      return;
    }
    setLoading(true);
    try {
      setData(await getInventoryItem(id));
    } catch (e) {
      reportLoadFailure(e, "this inventory item");
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, refresh: load, setData };
}

/** Stock-card ledger for one item (or the full register when id is null). */
export function useStockCard(itemId: string | null) {
  const [data, setData] = React.useState<StockCardEntry[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setData(await listStockCard(itemId ?? undefined));
    } catch (e) {
      reportLoadFailure(e, "the stock card");
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  useRealtimeRefresh("stock_card", load);

  return { data, loading, refresh: load };
}

/**
 * Every category an item can be filed under: the standard list, the ones an
 * Administrator added, and any already on an item — one entry each, whatever
 * the capitals or spacing. Shared by Add Item, Scan / Import, the filters and
 * editing (22 Oct 2026).
 */
export function useInventoryCategories(items?: InventoryItem[]) {
  const [saved, setSaved] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      setSaved(await listInventoryCategories());
    } catch (e) {
      reportLoadFailure(e, "the inventory categories");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  useRealtimeRefresh("inventory_categories", load);

  const categories = React.useMemo(
    () => mergeCategories([...STANDARD_CATEGORIES], saved, (items ?? []).map((i) => i.category)),
    [saved, items],
  );
  return { categories, loading, refresh: load };
}
