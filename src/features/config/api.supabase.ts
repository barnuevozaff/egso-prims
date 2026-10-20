import { fetchAll, requireDb, unwrap } from "@/lib/db";
import {
  configDefinition,
  type ConfigCategory,
  type ConfigEntry,
  type ConfigValue,
} from "@/features/config/types";

/**
 * System configuration service — the ONE place settings are read or written.
 * Components never call Supabase directly, and no module should hardcode a
 * value that belongs here.
 *
 * Every getter falls back to the registry default in `types.ts`, so a missing
 * row degrades to sensible behaviour rather than an error.
 */

const TABLE = "system_configuration";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function rowToEntry(r: any): ConfigEntry {
  return {
    id: r.id,
    category: r.category,
    key: r.key,
    value: r.value as ConfigValue,
    description: r.description ?? undefined,
    updatedAt: r.updated_at,
  };
}

export interface ConfigFilters {
  category?: ConfigCategory | string;
}

export async function listConfiguration(filters: ConfigFilters = {}): Promise<ConfigEntry[]> {
  const db = requireDb();
  let q = db.from(TABLE).select("*").order("category").order("key");
  if (filters.category) q = q.eq("category", filters.category);
  return (await fetchAll((from, to) => q.range(from, to))).map(rowToEntry);
}

/** Raw value for one setting, or the registry fallback when unset. */
export async function getConfigValue(
  category: string,
  key: string,
): Promise<ConfigValue> {
  const db = requireDb();
  const { data, error } = await db
    .from(TABLE)
    .select("value")
    .eq("category", category)
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return configDefinition(category, key)?.fallback ?? null;
  const stored = (data as { value: ConfigValue }).value;
  // A NULL column means the setting was explicitly cleared; fall back to the
  // registry default so callers always receive a usable value.
  return stored ?? configDefinition(category, key)?.fallback ?? null;
}

/**
 * Upserts one setting. `id` follows the seeded convention so a value written
 * here and one seeded by the migration are the same row.
 */
export async function setConfigValue(
  category: string,
  key: string,
  value: ConfigValue,
  description?: string,
): Promise<ConfigEntry> {
  const db = requireDb();
  const row = {
    id: `cfg-${category.toLowerCase().replace(/\s+/g, "-")}-${key.replace(/_/g, "-")}`,
    category,
    key,
    value,
    description: description ?? null,
    updated_at: new Date().toISOString(),
  };
  return rowToEntry(
    unwrap(await db.from(TABLE).upsert(row, { onConflict: "category,key" }).select().single()),
  );
}

/** Writes several settings at once, e.g. when a Settings form is saved. */
export async function setConfigValues(
  entries: { category: string; key: string; value: ConfigValue }[],
): Promise<void> {
  const db = requireDb();
  if (entries.length === 0) return;
  const rows = entries.map((e) => ({
    id: `cfg-${e.category.toLowerCase().replace(/\s+/g, "-")}-${e.key.replace(/_/g, "-")}`,
    category: e.category,
    key: e.key,
    value: e.value,
    updated_at: new Date().toISOString(),
  }));
  unwrap(await db.from(TABLE).upsert(rows, { onConflict: "category,key" }).select());
}

/* ---------------- typed helpers ---------------- */

const fallbackFor = (category: string, key: string): ConfigValue =>
  configDefinition(category, key)?.fallback ?? null;

/** Reads a setting as a string, falling back to the registry default. */
export async function getConfigString(category: string, key: string): Promise<string> {
  const v = await getConfigValue(category, key);
  if (typeof v === "string") return v;
  const fb = fallbackFor(category, key);
  return typeof fb === "string" ? fb : "";
}

export async function getConfigNumber(category: string, key: string): Promise<number> {
  const v = await getConfigValue(category, key);
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  const fb = fallbackFor(category, key);
  return typeof fb === "number" ? fb : 0;
}

export async function getConfigBoolean(category: string, key: string): Promise<boolean> {
  const v = await getConfigValue(category, key);
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  const fb = fallbackFor(category, key);
  return typeof fb === "boolean" ? fb : false;
}

export async function getConfigObject<T extends Record<string, unknown>>(
  category: string,
  key: string,
): Promise<T> {
  const v = await getConfigValue(category, key);
  if (v && typeof v === "object") return v as T;
  const fb = fallbackFor(category, key);
  return (fb && typeof fb === "object" ? fb : {}) as T;
}

/* ---------------- system status ---------------- */

export interface SystemStatus {
  connected: boolean;
  /** Round-trip time of the probe query, in milliseconds. */
  latencyMs: number | null;
  /** Supabase project URL, host only. */
  host: string;
  error?: string;
}

/**
 * Probes the database with a trivial query so the Settings page can report a
 * real connection state rather than assuming one.
 */
export async function getSystemStatus(): Promise<SystemStatus> {
  const host = (() => {
    try {
      return new URL(import.meta.env.VITE_SUPABASE_URL ?? "").host;
    } catch {
      return "not configured";
    }
  })();

  const started = performance.now();
  try {
    const db = requireDb();
    const { error } = await db.from(TABLE).select("id").limit(1);
    if (error) throw new Error(error.message);
    return { connected: true, latencyMs: Math.round(performance.now() - started), host };
  } catch (e) {
    return {
      connected: false,
      latencyMs: null,
      host,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

/** Flattens a category into a plain object, e.g. for a Settings form. */
export async function getConfigCategory(
  category: ConfigCategory | string,
): Promise<Record<string, ConfigValue>> {
  const rows = await listConfiguration({ category });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
