import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { requireFirebase, useEmulators } from "@/lib/firebase";
import { fetchAllRows, firestore, friendlyFirebaseError } from "@/lib/firestore";
import { rowToEntry, type ConfigFilters, type SystemStatus } from "@/features/config/api.supabase";
import { configDefinition, type ConfigCategory, type ConfigEntry, type ConfigValue } from "@/features/config/types";

/**
 * System configuration service — Firestore-backed. Same signatures as
 * api.supabase.ts, same document ids (cfg-{category}-{key}), so a value set
 * here and one migrated from Supabase are the same document. Only
 * Administrators may write (firestore.rules); every staff role may read.
 *
 * The Cloud Functions read the same documents: document numbering reads
 * category "Document Numbering", and the inventory service reads
 * "Inventory" — one source of settings for screens and server alike.
 */

const TABLE = "system_configuration";

const docId = (category: string, key: string) =>
  `cfg-${category.toLowerCase().replace(/\s+/g, "-")}-${key.replace(/_/g, "-")}`;

const fallbackFor = (category: string, key: string): ConfigValue =>
  configDefinition(category, key)?.fallback ?? null;

export async function listConfiguration(filters: ConfigFilters = {}): Promise<ConfigEntry[]> {
  const rows = await fetchAllRows(TABLE, [
    ...(filters.category ? [where("category", "==", filters.category)] : []),
    orderBy("category"),
    orderBy("key"),
  ]);
  return rows.map(rowToEntry);
}

/** Raw value for one setting, or the registry fallback when unset. */
export async function getConfigValue(category: string, key: string): Promise<ConfigValue> {
  try {
    const snap = await getDocs(
      query(collection(firestore(), TABLE), where("category", "==", category), where("key", "==", key), limit(1)),
    );
    const stored = snap.docs[0]?.get("value") as ConfigValue | undefined;
    return stored ?? fallbackFor(category, key);
  } catch {
    // Signed-out pages (the login screen's letterhead) cannot read settings;
    // they get the registry default, as with Supabase.
    return fallbackFor(category, key);
  }
}

/** Upserts one setting under its conventional id. */
export async function setConfigValue(
  category: string,
  key: string,
  value: ConfigValue,
  description?: string,
): Promise<ConfigEntry> {
  const row = {
    id: docId(category, key),
    category,
    key,
    value,
    description: description ?? null,
    updated_at: new Date().toISOString(),
  };
  try {
    await setDoc(doc(firestore(), TABLE, row.id), row, { merge: true });
  } catch (e) {
    throw friendlyFirebaseError(e);
  }
  return rowToEntry(row);
}

/** Writes several settings at once, e.g. when a Settings form is saved. */
export async function setConfigValues(entries: { category: string; key: string; value: ConfigValue }[]): Promise<void> {
  if (entries.length === 0) return;
  try {
    for (let i = 0; i < entries.length; i += 400) {
      const batch = writeBatch(firestore());
      for (const e of entries.slice(i, i + 400)) {
        const id = docId(e.category, e.key);
        batch.set(
          doc(firestore(), TABLE, id),
          { id, category: e.category, key: e.key, value: e.value, updated_at: new Date().toISOString() },
          { merge: true },
        );
      }
      await batch.commit();
    }
  } catch (e) {
    throw friendlyFirebaseError(e);
  }
}

/* ---------------- typed helpers (as in api.supabase.ts) ---------------- */

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

export async function getConfigObject<T extends Record<string, unknown>>(category: string, key: string): Promise<T> {
  const v = await getConfigValue(category, key);
  if (v && typeof v === "object") return v as T;
  const fb = fallbackFor(category, key);
  return (fb && typeof fb === "object" ? fb : {}) as T;
}

/* ---------------- system status ---------------- */

/** Probes Firestore so the Settings page reports a real connection state. */
export async function getSystemStatus(): Promise<SystemStatus> {
  const { app } = requireFirebase();
  const host = useEmulators ? "Firestore emulator (127.0.0.1:8085)" : `Firestore · ${app.options.projectId}`;
  const started = performance.now();
  try {
    await getDocs(query(collection(firestore(), TABLE), limit(1)));
    return { connected: true, latencyMs: Math.round(performance.now() - started), host };
  } catch (e) {
    return { connected: false, latencyMs: null, host, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/** Flattens a category into a plain object, e.g. for a Settings form. */
export async function getConfigCategory(category: ConfigCategory | string): Promise<Record<string, ConfigValue>> {
  const rows = await listConfiguration({ category });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
