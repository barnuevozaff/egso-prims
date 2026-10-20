import { HttpsError } from "firebase-functions/v2/https";

/**
 * Input checks for the create functions. Browsers are untrusted — the public
 * portal most of all — so every field is checked for type and size before it
 * is written. Messages name the field the way the form labels it.
 */

const invalid = (message: string) => new HttpsError("invalid-argument", message);

export function text(
  value: unknown,
  label: string,
  { max = 500, optional = false }: { max?: number; optional?: boolean } = {},
): string | undefined {
  if (value === undefined || value === null || value === "") {
    if (optional) return undefined;
    throw invalid(`${label} is required.`);
  }
  if (typeof value !== "string") throw invalid(`${label} must be text.`);
  const trimmed = value.trim();
  if (!trimmed && !optional) throw invalid(`${label} is required.`);
  if (trimmed.length > max) throw invalid(`${label} is too long (at most ${max} characters).`);
  return value;
}

export const requiredText = (value: unknown, label: string, max?: number) =>
  text(value, label, { max }) as string;

export function isoDate(value: unknown, label: string): string {
  const v = requiredText(value, label, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) {
    throw invalid(`${label} must be a date (YYYY-MM-DD).`);
  }
  return v;
}

export function clockTime(value: unknown, label: string): string {
  const v = requiredText(value, label, 5);
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw invalid(`${label} must be a time (HH:MM).`);
  return v;
}

export function amount(
  value: unknown,
  label: string,
  { min = 0, max = 1_000_000_000, positive = false }: { min?: number; max?: number; positive?: boolean } = {},
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw invalid(`${label} must be a number.`);
  if (positive ? value <= 0 : value < min) {
    throw invalid(`${label} must be ${positive ? "more than 0" : `at least ${min}`}.`);
  }
  if (value > max) throw invalid(`${label} is too large.`);
  return value;
}

export function list<T>(
  value: unknown,
  label: string,
  each: (item: Record<string, unknown>, index: number) => T,
  { min = 0, max = 200 }: { min?: number; max?: number } = {},
): T[] {
  if (value === undefined && min === 0) return [];
  if (!Array.isArray(value)) throw invalid(`${label} must be a list.`);
  if (value.length < min) throw invalid(`Add at least ${min} ${label.toLowerCase()}.`);
  if (value.length > max) throw invalid(`${label}: at most ${max} lines.`);
  return value.map((item, i) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw invalid(`${label} line ${i + 1} is not valid.`);
    }
    return each(item as Record<string, unknown>, i);
  });
}

export function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalid("The request is not valid.");
  }
  return value as Record<string, unknown>;
}

/**
 * Attachment metadata for files the browser already uploaded to Storage
 * (storage.rules decide who may upload). Only paths under attachments/ are
 * accepted, so a record cannot point at anything else in the bucket.
 */
export function attachments(value: unknown) {
  return list(
    value,
    "Attachments",
    (a, i) => {
      const path = requiredText(a.path, `Attachment ${i + 1}`, 500);
      if (!path.startsWith("attachments/") || path.includes("..")) {
        throw invalid(`Attachment ${i + 1} is not in the attachments folder.`);
      }
      const kind = a.kind === "image" ? "image" : a.kind === "pdf" ? "pdf" : null;
      if (!kind) throw invalid(`Attachment ${i + 1} must be a PDF or an image.`);
      return {
        name: requiredText(a.name, `Attachment ${i + 1} name`, 255),
        kind,
        size: amount(a.size, `Attachment ${i + 1} size`, { max: 10 * 1024 * 1024 }),
        uploadedBy: requiredText(a.uploadedBy, `Attachment ${i + 1} uploader`, 200),
        url: requiredText(a.url, `Attachment ${i + 1} link`, 2000),
        path,
      };
    },
    { max: 20 },
  );
}
