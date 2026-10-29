import { ITEM_CATEGORIES } from "@/features/inventory/types";

/**
 * Inventory categories (22 Oct 2026): the office's standard list, the ones an
 * Administrator added (saved in Firestore, inventory_categories), and any
 * already on an item. One category is the same words whatever the capitals
 * or spacing, so "cleaning supplies " files under "Cleaning Supplies".
 * The same rule runs on the server (functions/src/documents/inventory.ts).
 */

/** Readable form of a typed name: trimmed, single spaces. */
export const tidyCategory = (s: string) => s.trim().replace(/\s+/g, " ");

/** Category identity, ignoring capitals and spacing. */
export const categoryKey = (s: string) => tidyCategory(s).toLowerCase();

/** Document ID of a saved category (Firestore IDs cannot hold "/"). */
export const categoryDocId = (s: string) => categoryKey(s).replaceAll("/", "%2F");

/**
 * One list without repeats, keeping the first spelling met — so pass the
 * standard list first, then saved ones, then the items' own.
 */
export function mergeCategories(...lists: readonly string[][]): string[] {
  const seen = new Map<string, string>();
  for (const list of lists) {
    for (const raw of list) {
      const name = tidyCategory(raw ?? "");
      if (name && !seen.has(categoryKey(name))) seen.set(categoryKey(name), name);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** The known spelling of a typed category, or the tidied text when it is new. */
export function canonicalCategory(typed: string, known: readonly string[]): string {
  const key = categoryKey(typed);
  return known.find((c) => categoryKey(c) === key) ?? tidyCategory(typed);
}

/** True when the category is neither standard nor already known. */
export function isNewCategory(typed: string, known: readonly string[]): boolean {
  const key = categoryKey(typed);
  return !!key && !known.some((c) => categoryKey(c) === key);
}

export const STANDARD_CATEGORIES: readonly string[] = ITEM_CATEGORIES;
