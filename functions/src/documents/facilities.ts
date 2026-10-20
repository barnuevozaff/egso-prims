/**
 * Double-booking checks, server side. A copy of sameFacility and timesOverlap
 * in src/features/reservations/types.ts, which the reservation form uses to
 * warn as the user types; this copy decides. Keep the two, and the facility
 * register below, in step.
 */

/** Statuses that occupy a slot (BLOCKING_STATUSES in the app). */
export const BLOCKING_STATUSES = ["Pending", "Approved"] as const;

/** The facility register's ids and names (FACILITIES in the app). */
const REGISTERED: Record<string, string> = {
  "fac-1": "Session Hall",
  "fac-2": "Conference Room A",
  "fac-3": "Conference Room B",
  "fac-4": "Covered Court",
  "fac-5": "Audio-Visual Room",
  "fac-6": "Training Center",
};

const normalise = (name: string) => name.trim().replace(/\s+/g, " ");
const key = (name: string) => normalise(name).toLowerCase();

/**
 * Whether a saved reservation's facility is the one being booked: ignoring
 * case and spacing, and letting an old register id ("fac-1") match any typed
 * name that begins with that facility's name.
 */
export function sameFacility(saved: string, typed: string): boolean {
  const a = key(saved);
  const b = key(typed);
  if (!a || !b) return false;
  if (a === b) return true;
  const registered = REGISTERED[saved.trim()];
  return !!registered && b.startsWith(registered.toLowerCase());
}

/** Zero-pads "8:30" so times compare correctly as text. */
const padded = (hhmm: string) => hhmm.trim().padStart(5, "0");

export function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return padded(aStart) < padded(bEnd) && padded(bStart) < padded(aEnd);
}
