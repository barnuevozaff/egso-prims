/**
 * System configuration domain types.
 *
 * Every setting lives in one table and is declared once here; the Settings
 * page renders from this registry rather than hardcoding a form, so adding a
 * setting means adding an entry and a seed row — no new service code.
 *
 * THE RULE FOR THIS REGISTRY: a setting earns its place by changing something.
 * Each entry below names, in its `note`, the module behaviour it drives. An
 * earlier version of this file carried thirty-seven settings of which roughly
 * twenty-five were read by nothing at all — a Settings page that looked
 * thorough and configured almost nothing. Those are gone. If a new setting
 * cannot say what it changes, it does not belong here yet.
 */

import { STOCK_LOCATIONS } from "@/features/inventory/types";
import { FUNDING_SOURCES, ITEM_UNITS } from "@/features/purchase-requests/types";
import { PAYMENT_METHODS, VIOLATION_TYPES } from "@/features/violations/types";

export const CONFIG_CATEGORIES = [
  "General",
  "Document Numbering",
  "Procurement",
  "Inventory",
  "Facility Reservation",
  "Violation Management",
  "Signatories",
  "PO Signatories",
] as const;

export type ConfigCategory = (typeof CONFIG_CATEGORIES)[number];

/** A value may be a string, number, boolean, list, object or null. */
export type ConfigValue =
  | string
  | number
  | boolean
  | null
  | readonly string[]
  | Record<string, unknown>;

export interface ConfigEntry {
  id: string;
  category: ConfigCategory | string;
  key: string;
  value: ConfigValue;
  description?: string;
  updatedAt: string;
}

/**
 * How a setting is rendered.
 *
 * `list` is a set of option strings — the choices behind a dropdown somewhere
 * in the application. It is stored as a JSON array and edited one per line,
 * because a textarea of lines is what an administrator can actually work with
 * and raw JSON is not.
 */
export type ConfigKind = "text" | "number" | "boolean" | "select" | "json" | "list";

export interface ConfigDefinition {
  category: ConfigCategory;
  key: string;
  label: string;
  kind: ConfigKind;
  /** Used when the row is missing, so callers always get a usable value. */
  fallback: ConfigValue;
  /** Allowed values for `select` settings. */
  options?: readonly string[];
  /** What this setting changes. Every entry has one. */
  note?: string;
}

export const CONFIG_DEFINITIONS: ConfigDefinition[] = [
  /* ---------------- General ----------------
     Read by useBranding, which supplies the letterhead on every printed
     document and the login screen. */
  { category: "General", key: "organization_name", label: "Organization Name", kind: "text", fallback: "Municipality of Alaminos, Laguna", note: "Printed on every official document and shown on the login screen." },
  { category: "General", key: "office_name", label: "Office Name", kind: "text", fallback: "General Services Office", note: "Appears under the municipality on printed letterheads." },
  { category: "General", key: "province", label: "Province", kind: "text", fallback: "Laguna", note: "Printed as \"Republic of the Philippines · Province of …\" on report headers." },
  { category: "General", key: "municipality_address", label: "Municipality Address", kind: "text", fallback: null, note: "Not set. Enter the office's verified address; the placeholder that stood here was not an official detail." },
  { category: "General", key: "contact_number", label: "Contact Number", kind: "text", fallback: null, note: "Not set. Enter the office's verified contact number; the placeholder that stood here was not an official detail." },
  { category: "General", key: "official_email", label: "Official Email", kind: "text", fallback: null, note: "Not set. Enter the office's verified email; the placeholder that stood here was not an official detail." },
  { category: "General", key: "municipality_logo", label: "Municipality Logo", kind: "text", fallback: null, note: "Storage path for the seal on printed documents. Blank uses the built-in mark." },
  { category: "General", key: "currency", label: "Currency", kind: "text", fallback: "PHP", note: "Currency code shown beside every peso figure." },

  /* ---------------- Document Numbering ----------------
     Read in SQL by next_document_number(), not by the front end — which is
     why these settings look unused to a search of src/. */
  { category: "Document Numbering", key: "padding_length", label: "Padding Length", kind: "number", fallback: 6, note: "Digits in the sequence portion. Changes newly issued numbers only; existing numbers keep their width." },
  { category: "Document Numbering", key: "year_reset", label: "Reset Sequence Yearly", kind: "boolean", fallback: true, note: "On, each January restarts at 1. Off, every year shares one continuous counter that opens above the highest number already issued." },
  { category: "Document Numbering", key: "separator", label: "Separator", kind: "text", fallback: "-", note: "Character between prefix, year and sequence, e.g. PR-2026-000001." },

  /* ---------------- Procurement ---------------- */
  {
    category: "Procurement",
    key: "item_units",
    label: "Units of Measure",
    kind: "list",
    fallback: ITEM_UNITS,
    note: "The unit choices offered when adding an item to a Purchase Request or Purchase Order.",
  },
  {
    category: "Procurement",
    key: "default_funding_source",
    label: "Default Funding Source",
    kind: "select",
    // No fallback (21 Oct 2026): a fund is used only once an Administrator
    // has chosen it here; until then the public form offers an optional choice.
    fallback: null,
    options: FUNDING_SOURCES,
    note: "Recorded on every new Purchase Request when set. Leave unset to let the requester choose, or the GSO complete it.",
  },

  {
    category: "Procurement",
    key: "official_pr_prefix",
    label: "Official PR Number Prefix",
    kind: "text",
    // PROVISIONAL (21 Oct 2026): "100" is taken from the PR template
    // (100-___-___-___); it is not confirmed as the municipality's code.
    fallback: "100",
    note: "PROVISIONAL — pending formal municipal approval. Official PR numbers are issued at approval as PREFIX-YEAR-NUMBER (e.g. 100-2026-000001), separate from the PR-2026-000001 tracking reference. Changing it affects only numbers issued afterwards.",
  },

  /* ---------------- Purchase Order terms (21 Oct 2026) ----------------
     Copied onto the order created when a request is approved — only what an
     Administrator has saved here; unset, the order prints a blank line to
     fill in by hand. The notes quote the office's PO template (P.O AND
     ACCEPTANCE.xlsx, sheet PURCHASE ORDER) for reference. */
  {
    category: "Procurement",
    key: "po_place_of_delivery",
    label: "PO — Place of Delivery",
    kind: "text",
    fallback: null,
    note: "Copied onto each new Purchase Order when set. The PO template reads \"Municipality of Alaminos, Laguna\". Unset, the order prints a blank line.",
  },
  {
    category: "Procurement",
    key: "po_delivery_term",
    label: "PO — Delivery Term",
    kind: "text",
    fallback: null,
    note: "Copied onto each new Purchase Order when set. The PO template reads \"7 working Days\" — pending the office's confirmation as the standard term.",
  },
  {
    category: "Procurement",
    key: "po_payment_term",
    label: "PO — Payment Term",
    kind: "text",
    fallback: null,
    note: "Copied onto each new Purchase Order when set. The PO template reads \"Cash\" — pending the office's confirmation as the standard term.",
  },
  {
    category: "Procurement",
    key: "po_procurement_modes",
    label: "PO — Modes of Procurement",
    kind: "list",
    fallback: [],
    note: "The modes offered on a Purchase Order, one per line, as the BAC authorises them. Empty until an Administrator enters them; the field can still be typed.",
  },

  /* ---------------- Signatories (fixed roles, 21 Oct 2026) ----------------
     The official forms fix each signatory's role, designation and place; the
     only setting is the printed name of the person holding the post (see
     SIGNATORY_ROLES below). Copied onto a document when it is approved or
     authorized, so a change here never alters an approved document. */
  {
    category: "Signatories",
    key: "pr_requested_by_name",
    label: "Requested by — General Services Officer",
    kind: "text",
    fallback: null,
    note: "Printed name above \"General Services Officer\" on every Purchase Request — not the employee who filed it. Required before a request can be approved.",
  },
  {
    category: "Signatories",
    key: "pr_cash_availability_name",
    label: "Cash Availability — Municipal Treasurer",
    kind: "text",
    fallback: null,
    note: "Printed name above \"Municipal Treasurer\". Required before a Purchase Request can be approved.",
  },
  {
    category: "Signatories",
    key: "pr_approved_by_name",
    label: "Approved by — Municipal Mayor",
    kind: "text",
    fallback: null,
    note: "Printed name above \"Municipal Mayor\" on the Purchase Request, exactly as typed (the PR template reads \"Hon. …\"). Required before a request can be approved.",
  },
  {
    category: "PO Signatories",
    key: "po_approving_name",
    label: "Very truly yours — Municipal Mayor",
    kind: "text",
    fallback: null,
    note: "Printed name above \"Municipal Mayor\" on the Purchase Order, exactly as typed (the PO template reads it without \"Hon.\"). Unset, the order prints a blank name line.",
  },
  {
    category: "PO Signatories",
    key: "po_bac_secretary_name",
    label: "Certified Correct — BAC Secretary",
    kind: "text",
    fallback: null,
    note: "Printed name above \"BAC Secretary\" in the negotiated-purchase portion of the Purchase Order. Unset, that line prints empty.",
  },

  /* ---------------- Inventory ---------------- */
  {
    category: "Inventory",
    key: "default_stock_location",
    label: "Default Storage Location",
    kind: "select",
    fallback: STOCK_LOCATIONS[0],
    options: STOCK_LOCATIONS,
    // Deliberately a default rather than an editable list: nothing in the
    // application asks which location an item goes to, so a list of choices
    // would configure nothing. Where new stock lands is a real decision.
    note: "Where newly received stock is recorded, including items brought in through Smart Import.",
  },
  {
    category: "Inventory",
    key: "reorder_percent",
    label: "Reorder Level (% of stocking level)",
    kind: "number",
    fallback: 25,
    note: "An item is flagged Low Stock below this share of the quantity it was stocked at. Applies to items received from now on.",
  },
  {
    category: "Inventory",
    key: "critical_percent",
    label: "Critical Level (% of stocking level)",
    kind: "number",
    fallback: 10,
    note: "An item is flagged Critical below this share. Applies to items received from now on.",
  },

  /* ---------------- Facility Reservation ---------------- */
  {
    category: "Facility Reservation",
    key: "opening_time",
    label: "Earliest Booking Time",
    kind: "text",
    fallback: "05:00",
    note: "24-hour, e.g. 05:00. The first start time offered on the reservation form.",
  },
  {
    category: "Facility Reservation",
    key: "closing_time",
    label: "Latest Booking Time",
    kind: "text",
    fallback: "20:00",
    note: "24-hour, e.g. 20:00. The last end time offered on the reservation form.",
  },
  {
    category: "Facility Reservation",
    key: "slot_minutes",
    label: "Booking Interval (minutes)",
    kind: "number",
    fallback: 30,
    note: "How far apart the selectable times are, e.g. 30 gives 08:00, 08:30, 09:00.",
  },

  /* ---------------- Violation Management ---------------- */
  {
    category: "Violation Management",
    key: "violation_types",
    label: "Violation Types",
    kind: "list",
    fallback: VIOLATION_TYPES,
    note: "Offered when recording a violation and in the register's filter. A type already recorded stays selectable even if removed here.",
  },
  {
    category: "Violation Management",
    key: "payment_methods",
    label: "Payment Methods",
    kind: "list",
    fallback: PAYMENT_METHODS,
    note: "Offered when settling a violation.",
  },
  {
    category: "Violation Management",
    key: "default_fine_amount",
    label: "Default Fine Amount (PHP)",
    kind: "number",
    fallback: 0,
    note: "Pre-filled as the assessed amount on a new violation. Zero leaves the field empty.",
  },
];

/** Definition lookup, e.g. for a Settings form or a typed getter's fallback. */
export function configDefinition(
  category: string,
  key: string,
): ConfigDefinition | undefined {
  return CONFIG_DEFINITIONS.find((d) => d.category === category && d.key === key);
}

/**
 * The signatory blocks of the official forms (21 Oct 2026): the role and the
 * designation are fixed by the form and printed as they are; only the name is
 * a setting. The server keeps the same designations
 * (functions/src/documents/signatories.ts).
 */
export interface SignatoryRole {
  /** The setting holding the printed name. */
  key: string;
  /** The form's heading, e.g. "Requested by". */
  role: string;
  /** Printed under the name; never edited. */
  designation: string;
}

export const SIGNATORY_ROLES: Record<"Signatories" | "PO Signatories", SignatoryRole[]> = {
  Signatories: [
    { key: "pr_requested_by_name", role: "Requested by", designation: "General Services Officer" },
    { key: "pr_cash_availability_name", role: "Cash Availability", designation: "Municipal Treasurer" },
    { key: "pr_approved_by_name", role: "Approved by", designation: "Municipal Mayor" },
  ],
  "PO Signatories": [
    { key: "po_approving_name", role: "Very truly yours", designation: "Municipal Mayor" },
    { key: "po_bac_secretary_name", role: "Certified Correct", designation: "BAC Secretary" },
  ],
};
