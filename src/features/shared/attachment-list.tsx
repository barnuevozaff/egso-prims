/**
 * A file as documents store it. Attachments are no longer listed on a
 * record's screen (30 Oct 2026); the files a document already holds stay
 * stored, and the storage helpers still read and write them.
 */
export interface AttachmentRecord {
  id: string;
  name: string;
  kind: "pdf" | "image";
  size: number;
  uploadedBy: string;
  uploadedAt: string;
  /** Supabase Storage public URL (present once uploaded). */
  url?: string;
  /** Supabase Storage object path. */
  path?: string;
}

/** Create/update payload: metadata plus the pending browser File to upload. */
export interface AttachmentInput extends Omit<AttachmentRecord, "id" | "uploadedAt"> {
  file?: File;
}
