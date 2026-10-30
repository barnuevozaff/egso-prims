import type { DocType } from "@/features/records/shelf-types";

/**
 * Words and colours the Records Room, its drawers and the document pages share.
 */

/**
 * The colour band on a box says which kind of document is inside: one colour
 * per form. It is never the only carrier — the kind is printed on the label
 * beside it — so the room still reads in greyscale.
 */
const DOC_TONES: Record<DocType, string> = {
  RDS: "bg-[#7e1624]",
  RIA: "bg-[#1d4ed8]",
  RAD: "bg-[#166534]",
};

export function docTone(type: DocType): string {
  return DOC_TONES[type];
}

/** yyyy-MM-dd → "Sep 29, 2026". */
export function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

/** A moment (ISO) as the day it was in the Philippines: "Oct 30, 2026". */
export function formatDay(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
}

export function recordCount(n: number): string {
  return `${n} ${n === 1 ? "record" : "records"}`;
}
