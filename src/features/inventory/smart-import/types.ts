import { ITEM_CATEGORIES } from "@/features/inventory/types";

/** The seven fields Smart Import tries to extract from a document. */
export type ImportField =
  | "stockNumber"
  | "itemName"
  | "description"
  | "category"
  | "unit"
  | "quantity"
  | "unitCost"
  /** A line's total (quantity x unit cost): read, never used as the unit price. */
  | "lineTotal";

/** One editable, selectable row in the import preview. */
export interface ImportRow {
  id: string;
  selected: boolean;
  stockNumber: string;
  itemName: string;
  description: string;
  /** As printed in the document, a suggestion, or empty. */
  category: string;
  /** Where the category came from: the document itself, or the word-list suggestion. */
  categorySource: "document" | "suggested" | "";
  unit: string;
  /** Kept as text for free editing; parsed to a number on import. */
  quantity: string;
  unitCost: string;
  /** The line total printed beside it, if any (for checking only). */
  lineTotal: string;
  /** Fields OCR was unsure about, highlighted in the preview. */
  uncertain: Partial<Record<ImportField, boolean>>;
}

/** How the administrator chose to resolve a detected duplicate. */
export type DuplicateResolution = "skip" | "update" | "create";

/** A preview row matched to an existing inventory item. */
export interface DuplicateMatch {
  rowId: string;
  itemName: string;
  /** Existing item id + code it collides with. */
  existingId: string;
  existingCode: string;
  resolution: DuplicateResolution;
}

const EMPTY_UNCERTAIN: ImportRow["uncertain"] = {};

/** A blank row for the "add row manually" affordance in the preview. */
export function blankImportRow(id: string): ImportRow {
  return {
    id,
    selected: true,
    stockNumber: "",
    itemName: "",
    description: "",
    category: "",
    categorySource: "",
    unit: "",
    quantity: "",
    unitCost: "",
    lineTotal: "",
    uncertain: EMPTY_UNCERTAIN,
  };
}

/**
 * A category as printed: the standard spelling when it is one of the
 * standard categories, otherwise the document's own words (a category the
 * office uses that is not on the standard list yet).
 */
export function normalizeCategory(raw: string): string {
  const tidy = raw.trim().replace(/\s+/g, " ");
  const t = tidy.toLowerCase();
  if (!t) return "";
  const hit = ITEM_CATEGORIES.find(
    (c) => c.toLowerCase() === t || c.toLowerCase().startsWith(t) || t.startsWith(c.toLowerCase()),
  );
  return hit ?? tidy;
}
