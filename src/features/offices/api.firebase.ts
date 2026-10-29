import { callFunction } from "@/lib/firestore";
import type { Office } from "@/features/offices/api.supabase";

/**
 * The office directory on Firestore (29 Oct 2026), through the listOffices and
 * manageOffice functions (functions/src/offices.ts). Signed-out portal
 * visitors and staff read the same list; every change returns the list as it
 * stands afterwards.
 */

export async function listOffices(): Promise<Office[]> {
  const rows = await callFunction<Office[]>("listOffices", {});
  return Array.isArray(rows) ? rows : [];
}

export async function addOffice(name: string): Promise<Office[]> {
  return callFunction<Office[]>("manageOffice", { action: "add", name });
}

export async function renameOffice(id: string, name: string): Promise<Office[]> {
  return callFunction<Office[]>("manageOffice", { action: "rename", id, name });
}

export async function removeOffice(id: string): Promise<Office[]> {
  return callFunction<Office[]>("manageOffice", { action: "remove", id });
}
