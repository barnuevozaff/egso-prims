import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { requireFirebase } from "@/lib/firebase";
import { friendlyFirebaseError } from "@/lib/firestore";
import type { AttachmentInput, AttachmentRecord } from "@/features/shared/attachment-list";

/**
 * Cloud Storage counterpart of lib/storage.ts: same folder layout
 * (attachments/{folder}/{timestamp}-{name}), same metadata shape. The URL is
 * a download URL, which carries its own token, so it opens for anyone who
 * has it — as the Supabase public URL did — while storage.rules keep the
 * bucket itself staff-only.
 */
export async function uploadAttachmentInputs(
  inputs: AttachmentInput[],
  folder: string,
): Promise<Omit<AttachmentRecord, "id" | "uploadedAt">[]> {
  const { storage } = requireFirebase();
  const out: Omit<AttachmentRecord, "id" | "uploadedAt">[] = [];
  for (const input of inputs) {
    const { file, ...meta } = input;
    if (!file) {
      out.push(meta);
      continue;
    }
    const path = `attachments/${folder}/${Date.now()}-${file.name.replaceAll(/[^\w.-]/g, "_")}`;
    try {
      const objectRef = ref(storage, path);
      await uploadBytes(objectRef, file, { contentType: file.type || undefined });
      out.push({ ...meta, path, url: await getDownloadURL(objectRef) });
    } catch (e) {
      throw friendlyFirebaseError(e);
    }
  }
  return out;
}

/**
 * Deletes an attachment's file. Files saved under the Supabase bucket's
 * layout ("{folder}/{file}", no "attachments/" prefix) are found too.
 * A file already gone is not an error.
 */
export async function removeAttachmentFile(path: string): Promise<void> {
  const { storage } = requireFirebase();
  const full = path.startsWith("attachments/") ? path : `attachments/${path}`;
  try {
    await deleteObject(ref(storage, full));
  } catch (e) {
    if ((e as { code?: string }).code !== "storage/object-not-found") throw friendlyFirebaseError(e);
  }
}
