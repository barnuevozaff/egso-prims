import { callFunction, type Row } from "@/lib/firestore";

/**
 * Accounts, submeters, vehicles and violator profiles hold official records
 * (approved 2026-10-21). On Firebase they are deleted by the
 * deleteRecordHolders function, and only while they hold nothing; the ones
 * that hold records are kept and named, so the screen can say why and offer
 * the archive (or Inactive) instead. Firestore only — loaded with the
 * modules' api.firebase.ts.
 */
export async function deleteHolders(collection: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const r = await callFunction<{ deleted: string[]; kept: { id: string; name: string; reason: string }[] }>(
    "deleteRecordHolders",
    { collection, ids },
  );
  if (r.kept.length === 0) return;
  const names = r.kept.map((k) => k.name).join(", ");
  const reason = r.kept[0].reason;
  throw new Error(
    r.deleted.length === 0
      ? `${names}: ${reason}`
      : `${r.deleted.length} deleted. Kept ${r.kept.length} (${names}): ${reason}`,
  );
}

/** Archives or restores an account or a violator profile, with who and when. */
export async function setArchived(collection: string, id: string, archived: boolean): Promise<Row> {
  return callFunction<Row>("setRecordHolderArchived", { collection, id, archived });
}
