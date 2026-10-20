import type { AttachmentRecord } from "@/features/shared/attachment-list";
import type { ThreadComment } from "@/features/shared/comment-thread";
import type { HistoryEntry } from "@/features/shared/history-feed";

/** Facility Reservation domain types. Shapes mirror the future Supabase schema. */

export type ReservationStatus =
  | "Draft"
  | "Pending"
  | "Approved"
  | "Rejected"
  | "Completed"
  | "Cancelled";

export const RESERVATION_STATUSES: ReservationStatus[] = [
  "Draft",
  "Pending",
  "Approved",
  "Rejected",
  "Completed",
  "Cancelled",
];

/** Bookings that can still be voided, freeing their slot. */
export const VOIDABLE_RESERVATION_STATUSES: ReservationStatus[] = ["Draft", "Pending", "Approved"];

/** Statuses that occupy a facility's time slot. */
export const BLOCKING_STATUSES: ReservationStatus[] = ["Pending", "Approved"];

export interface Facility {
  id: string;
  name: string;
  /** Short label for tight calendar chips. */
  shortName: string;
  location: string;
  capacity: number;
  description: string;
  available: boolean;
  /** Tailwind bg class used as the facility's identity color. */
  color: string;
}

export const FACILITIES: Facility[] = [
  { id: "fac-1", name: "Session Hall", shortName: "Session Hall", location: "2F Municipal Hall", capacity: 150, description: "Main legislative hall with dais, sound system, and gallery seating.", available: true, color: "bg-blue-500" },
  { id: "fac-2", name: "Conference Room A", shortName: "Conf Rm A", location: "3F Municipal Hall", capacity: 30, description: "Executive conference room with LED display and video conferencing.", available: true, color: "bg-emerald-500" },
  { id: "fac-3", name: "Conference Room B", shortName: "Conf Rm B", location: "3F Municipal Hall", capacity: 20, description: "Meeting room for small workshops and coordination meetings.", available: true, color: "bg-violet-500" },
  { id: "fac-4", name: "Covered Court", shortName: "Court", location: "Municipal Compound", capacity: 500, description: "Multi-purpose covered court for large events and programs.", available: true, color: "bg-orange-500" },
  { id: "fac-5", name: "Audio-Visual Room", shortName: "AVR", location: "G/F Municipal Hall", capacity: 60, description: "Presentation room with projector, screen, and tiered seating.", available: true, color: "bg-sky-500" },
  { id: "fac-6", name: "Training Center", shortName: "Training Ctr", location: "Brgy. San Agustin", capacity: 80, description: "Skills training facility with breakout areas.", available: false, color: "bg-rose-500" },
];

export function facilityById(id: string): Facility | undefined {
  return FACILITIES.find((f) => f.id === id);
}

/**
 * Facility as it should be displayed. Requests raised since the picker was
 * removed name the facility directly; older ones resolve it from the register.
 */
export const facilityName = (id: string) => facilityById(id)?.name ?? id ?? "—";

/** A typed facility as it is saved: trimmed, single-spaced. */
export const normaliseFacility = (name: string) => name.trim().replace(/\s+/g, " ");

const facilityKey = (name: string) => normaliseFacility(name).toLowerCase();

/**
 * Whether a saved reservation's facility is the one being booked.
 *
 * Facilities are typed by hand, so the comparison ignores case and spacing.
 * A reservation saved from the old register ("fac-1") also matches any typed
 * name that begins with that facility's name, so "Session Hall, 2F" is still
 * blocked by an older Session Hall booking.
 */
export function sameFacility(saved: string, typed: string): boolean {
  const a = facilityKey(saved);
  const b = facilityKey(typed);
  if (!a || !b) return false;
  if (a === b) return true;
  const registered = facilityById(saved.trim());
  return !!registered && b.startsWith(registered.name.toLowerCase());
}

export interface EquipmentType {
  id: string;
  name: string;
  /** Total units the GSO can lend. */
  available: number;
}

export const EQUIPMENT: EquipmentType[] = [
  { id: "eq-1", name: "Monoblock chairs", available: 500 },
  { id: "eq-2", name: "Folding tables", available: 60 },
  { id: "eq-3", name: "Sound system set", available: 3 },
  { id: "eq-4", name: "Projector", available: 4 },
  { id: "eq-5", name: "Wireless microphone", available: 8 },
  { id: "eq-6", name: "Extension cord reel", available: 12 },
  { id: "eq-7", name: "Podium", available: 2 },
  { id: "eq-8", name: "Event tent", available: 10 },
];

export function equipmentById(id: string): EquipmentType | undefined {
  return EQUIPMENT.find((e) => e.id === id);
}

/** Equipment as displayed — the register's name, or the text that was typed. */
export const equipmentName = (id: string) => equipmentById(id)?.name ?? id ?? "—";

export interface ReservedEquipment {
  id: string;
  equipmentId: string;
  name: string;
  quantity: number;
  remarks?: string;
}

export interface Reservation {
  id: string;
  resNumber: string;
  facilityId: string;
  departmentCode: string;
  borrower: string;
  contactNumber: string;
  purpose: string;
  /** Reservation date (ISO date). */
  date: string;
  /** 24h times, e.g. "09:00". */
  startTime: string;
  endTime: string;
  equipment: ReservedEquipment[];
  status: ReservationStatus;
  attachments: AttachmentRecord[];
  comments: ThreadComment[];
  history: HistoryEntry[];
  approvals: { step: string; by?: string; office?: string; at?: string; remarks?: string }[];
  createdAt: string;
  updatedAt: string;
}

/** True when [aStart,aEnd) overlaps [bStart,bEnd) (times as "HH:mm"). */
export function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

const minutesOf = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mins = Number(m[2]);
  return h >= 0 && h <= 23 && mins >= 0 && mins <= 59 ? h * 60 + mins : null;
};

/**
 * The times the reservation form offers, from the opening time to the closing
 * time inclusive.
 *
 * The office sets the window and the interval in Settings → Facility
 * Reservation. Anything unparseable or inverted falls back to the defaults
 * below rather than producing an empty dropdown, so a mistyped setting cannot
 * make the form unusable.
 */
export function buildTimeSlots(
  opening = "05:00",
  closing = "20:00",
  stepMinutes = 30,
): string[] {
  const start = minutesOf(opening) ?? 5 * 60;
  const end = minutesOf(closing) ?? 20 * 60;
  const step = Number.isFinite(stepMinutes) && stepMinutes >= 5 ? Math.round(stepMinutes) : 30;
  if (end <= start) return buildTimeSlots();

  const slots: string[] = [];
  for (let t = start; t <= end; t += step) {
    slots.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
  }
  return slots;
}

/** Default slots — 5:00 AM to 8:00 PM every half hour, before Settings apply. */
export const TIME_SLOTS: string[] = buildTimeSlots();

/** "13:30" → "1:30 PM" */
export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/** Filters accepted by the list endpoint (maps 1:1 to future Supabase query). */
export interface ReservationListFilters {
  search?: string;
  facilityId?: string;
  departmentCode?: string;
  status?: ReservationStatus;
  dateFrom?: Date;
  dateTo?: Date;
}
