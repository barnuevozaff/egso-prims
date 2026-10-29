/**
 * Unit-of-measure recognition and normalization for Smart Import.
 *
 * `normalizeUnit` cleans a unit token into a canonical spelling without
 * changing its meaning (PCS/Pieces → pc, Litre → L, KG → kg). The canonical
 * spellings are the system's own units (ITEM_UNITS: "pc", not "pcs"). `isRecoverable`
 * says whether a loose token is confidently a unit, so the parser can pull the
 * unit out of a row even when the column split missed it — but never grabs a
 * stray single letter that only happens to look like a unit.
 */

/** Every accepted spelling → its canonical form. */
const CANONICAL: Record<string, string> = {};
const define = (canonical: string, variants: string[]) => {
  for (const v of [canonical, ...variants]) CANONICAL[v.toLowerCase()] = canonical;
};

define("pc", ["pc", "pcs", "piece", "pieces", "pce", "pces"]);
define("box", ["box", "boxes", "bx"]);
define("ream", ["ream", "reams", "rm"]);
define("pack", ["pack", "packs", "packet", "packets", "pkg", "pkt"]);
define("roll", ["roll", "rolls"]);
define("set", ["set", "sets"]);
define("unit", ["unit", "units"]);
define("bottle", ["bottle", "bottles", "btl"]);
define("can", ["can", "cans"]);
define("gal", ["gal", "gallon", "gallons"]);
define("L", ["l", "liter", "liters", "litre", "litres", "ltr"]);
define("mL", ["ml", "milliliter", "milliliters", "millilitre"]);
define("kg", ["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms"]);
define("g", ["g", "gram", "grams", "gm"]);
define("m", ["m", "meter", "meters", "metre", "metres"]);
define("ft", ["ft", "foot", "feet"]);
define("in", ["in", "inch", "inches"]);
define("bag", ["bag", "bags"]);
define("bundle", ["bundle", "bundles", "bdl"]);
define("carton", ["carton", "cartons", "ctn"]);
define("pair", ["pair", "pairs", "pr"]);
define("tube", ["tube", "tubes"]);
define("jar", ["jar", "jars"]);
define("pail", ["pail", "pails"]);
define("dozen", ["dozen", "dozens", "doz"]);
define("lot", ["lot", "lots"]);
define("sack", ["sack", "sacks"]);
define("sheet", ["sheet", "sheets"]);

/** Single-letter canonical units — too easy to false-match when recovering. */
const SINGLE_LETTER = new Set(["l", "m", "g"]);

export interface NormalizedUnit {
  unit: string;
  /** True when the token was recognised as a known unit. */
  recognized: boolean;
}

/** Normalises a unit token; unknown tokens are returned trimmed, unchanged. */
export function normalizeUnit(raw: string): NormalizedUnit {
  const key = raw.trim().toLowerCase().replace(/[^a-z]/g, "");
  if (!key) return { unit: "", recognized: false };
  if (CANONICAL[key]) return { unit: CANONICAL[key], recognized: true };
  // Fall back to a naive de-pluralisation (e.g. "trays" → "tray").
  if (key.endsWith("s") && CANONICAL[key.slice(0, -1)]) {
    return { unit: CANONICAL[key.slice(0, -1)], recognized: true };
  }
  return { unit: raw.trim(), recognized: false };
}

/**
 * Whether a loose token can be safely recovered as the unit from within a row.
 * Requires a recognised unit of at least two characters, so a stray "m" in an
 * item name is never mistaken for metres.
 */
export function isRecoverable(token: string): boolean {
  const key = token.trim().toLowerCase().replace(/[^a-z]/g, "");
  if (key.length < 2 || SINGLE_LETTER.has(key)) return false;
  return normalizeUnit(token).recognized;
}

/**
 * Best guess at an item's unit from its name, e.g. "Bond paper A4 70gsm, ream"
 * or "Alcohol 70% isopropyl, 1 gal". Returns "" when nothing in the name reads
 * as a unit, so the caller can leave the field alone rather than guess.
 *
 * Only whole words are considered, and single-letter units are ignored, so a
 * stray "l" or "m" in a product name never becomes the unit.
 */
export function unitFromItemName(name: string): string {
  const words = name.toLowerCase().match(/[a-z]+/g) ?? [];
  // Later words win: the unit usually trails the description.
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i];
    if (SINGLE_LETTER.has(w)) continue;
    const hit = CANONICAL[w];
    if (hit) return hit;
  }
  return "";
}
