import { LEGACY_DEPARTMENTS } from "@/features/purchase-requests/types";

/**
 * The office directory on the Supabase fallback, which has no directory of
 * its own: it offers the offices the system listed before 29 Oct 2026, and
 * cannot change them. The live system is the Firebase build (api.firebase.ts).
 */

export interface Office {
  id: string;
  name: string;
}

export async function listOffices(): Promise<Office[]> {
  return LEGACY_DEPARTMENTS.map((d) => ({ id: d.code, name: d.name }));
}

const unavailable = (): never => {
  throw new Error("The office list is managed on the Firebase system only.");
};

export async function addOffice(name: string): Promise<Office[]> {
  void name;
  return unavailable();
}

export async function renameOffice(id: string, name: string): Promise<Office[]> {
  void id;
  void name;
  return unavailable();
}

export async function removeOffice(id: string): Promise<Office[]> {
  void id;
  return unavailable();
}
