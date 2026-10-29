import type { OcrWord } from "@/features/inventory/smart-import/ocr";
import { classifyCategory } from "@/features/inventory/smart-import/classify";
import { isRecoverable, normalizeUnit } from "@/features/inventory/smart-import/units";
import {
  normalizeCategory,
  type ImportField,
  type ImportRow,
} from "@/features/inventory/smart-import/types";

/**
 * Turns OCR words into inventory rows.
 *
 * The strategy: cluster words into visual lines by their vertical position,
 * find a header line whose text names the columns, and use each header word's
 * horizontal centre to slot every data word into a column. When no header is
 * found we fall back to a conservative positional guess (leftmost text =
 * item, trailing integer = quantity) and flag everything for verification —
 * we never invent values for fields we cannot locate.
 */

let seq = 0;
const nextId = () => `imp-${Date.now()}-${seq++}`;

interface Line {
  page: number;
  yCenter: number;
  words: OcrWord[];
}

/** Groups words into lines using the median glyph height as the row gap. */
function toLines(words: OcrWord[]): Line[] {
  const sorted = [...words].sort(
    (a, b) => a.page - b.page || (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2 || a.x0 - b.x0,
  );
  const heights = sorted.map((w) => w.y1 - w.y0).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 12;
  const threshold = medianH * 0.6;

  const lines: Line[] = [];
  for (const w of sorted) {
    const yc = (w.y0 + w.y1) / 2;
    const last = lines[lines.length - 1];
    if (last && last.page === w.page && Math.abs(yc - last.yCenter) <= threshold) {
      last.words.push(w);
      last.yCenter = (last.yCenter * (last.words.length - 1) + yc) / last.words.length;
    } else {
      lines.push({ page: w.page, yCenter: yc, words: [w] });
    }
  }
  for (const l of lines) l.words.sort((a, b) => a.x0 - b.x0);
  return lines;
}

/**
 * Two-word headings read as one, so "Unit Cost" is the price and not a Unit
 * column, "Total Cost" is a line total, and "Item Description" (the official
 * PR and PO forms) is the item's name (22 Oct 2026).
 */
const HEADER_PAIRS: Record<string, ImportField> = {
  "unit cost": "unitCost",
  "unit price": "unitCost",
  "unit value": "unitCost",
  "total cost": "lineTotal",
  "total amount": "lineTotal",
  "total price": "lineTotal",
  "item description": "itemName",
  "item no": "stockNumber",
  "stock no": "stockNumber",
  "property no": "stockNumber",
};

/** Header keyword → field. Order matters: more specific tokens win. */
const HEADER_MAP: { field: ImportField; tokens: string[] }[] = [
  { field: "stockNumber", tokens: ["stock", "article", "code", "no.", "no", "number", "item no"] },
  { field: "quantity", tokens: ["qty", "quantity", "count", "on hand", "onhand", "issued", "balance"] },
  // An amount or total is quantity x unit cost, never the unit price.
  { field: "lineTotal", tokens: ["amount", "total", "value", "ext"] },
  { field: "unitCost", tokens: ["unit cost", "cost", "price", "unit price"] },
  { field: "unit", tokens: ["unit", "uom", "u/m", "u/i", "measure"] },
  { field: "category", tokens: ["category", "class", "classification", "type"] },
  { field: "description", tokens: ["description", "desc", "specification", "specs", "particular"] },
  { field: "itemName", tokens: ["item", "name", "article name", "supplies", "material", "stock item"] },
];

function fieldForHeaderToken(token: string): ImportField | null {
  const t = token.toLowerCase().replace(/[^a-z/. ]/g, "");
  for (const { field, tokens } of HEADER_MAP) {
    if (tokens.some((k) => t === k || t.includes(k))) return field;
  }
  return null;
}

interface Column {
  field: ImportField;
  center: number;
}

/** Finds the line that best names the columns; null when none is convincing. */
function detectHeader(lines: Line[]): { line: Line; columns: Column[] } | null {
  let best: { line: Line; columns: Column[]; score: number } | null = null;
  for (const line of lines) {
    const cols: Column[] = [];
    const seen = new Set<ImportField>();
    const ws = line.words;
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      const next = ws[i + 1];
      const pairKey = next ? (w.text + " " + next.text).toLowerCase().replace(/[^a-z ]/g, "") : "";
      const pair = HEADER_PAIRS[pairKey];
      const field = pair ?? fieldForHeaderToken(w.text);
      const center = pair && next ? (w.x0 + next.x1) / 2 : (w.x0 + w.x1) / 2;
      if (pair) i++;
      if (field && !seen.has(field)) {
        seen.add(field);
        cols.push({ field, center });
      }
    }
    if (cols.length >= 2 && (!best || cols.length > best.score)) {
      best = { line, columns: cols.sort((a, b) => a.center - b.center), score: cols.length };
    }
  }
  return best ? { line: best.line, columns: best.columns } : null;
}

const isNumeric = (t: string) => /^[₱$]?[\d.,]+$/.test(t) && /\d/.test(t);
const cleanNumber = (t: string) => t.replace(/[^\d.]/g, "");

/** Assigns each word in a data line to its nearest header column. */
function rowFromColumns(line: Line, columns: Column[]): ImportRow | null {
  const buckets: Record<string, OcrWord[]> = {};
  for (const w of line.words) {
    const xc = (w.x0 + w.x1) / 2;
    let nearest = columns[0];
    let dist = Infinity;
    for (const c of columns) {
      const d = Math.abs(xc - c.center);
      if (d < dist) {
        dist = d;
        nearest = c;
      }
    }
    (buckets[nearest.field] ??= []).push(w);
  }

  // When the unit column split empty, the unit value likely merged into the
  // item-name (or description) cell. Recover the last recognisable unit token
  // from there and move it into the unit bucket so the name reads cleanly.
  let unitRecovered = false;
  if (!(buckets.unit ?? []).length) {
    for (const field of ["itemName", "description"] as ImportField[]) {
      const ws = buckets[field];
      if (!ws) continue;
      for (let i = ws.length - 1; i >= 0; i--) {
        if (isRecoverable(ws[i].text)) {
          (buckets.unit ??= []).push(ws[i]);
          ws.splice(i, 1);
          unitRecovered = true;
          break;
        }
      }
      if (unitRecovered) break;
    }
  }

  const cellText = (field: ImportField) =>
    (buckets[field] ?? [])
      .sort((a, b) => a.x0 - b.x0)
      .map((w) => w.text)
      .join(" ")
      .trim();
  const cellConf = (field: ImportField) => {
    const ws = buckets[field] ?? [];
    return ws.length === 0 ? 100 : Math.min(...ws.map((w) => w.confidence));
  };

  const unitNorm = normalizeUnit(cellText("unit"));

  const row: ImportRow = {
    id: nextId(),
    selected: true,
    stockNumber: cellText("stockNumber"),
    itemName: cellText("itemName"),
    description: cellText("description"),
    category: normalizeCategory(cellText("category")),
    categorySource: cellText("category") ? "document" : "",
    unit: unitNorm.unit,
    quantity: cleanNumber(cellText("quantity")),
    unitCost: cleanNumber(cellText("unitCost")),
    lineTotal: cleanNumber(cellText("lineTotal")),
    uncertain: {},
  };

  // A table whose only text column is "Description" names its items there.
  const nameFromDescription = !row.itemName && !!row.description;
  if (nameFromDescription) {
    row.itemName = row.description;
    row.description = "";
  }
  // A line with no name and no quantity is not a real inventory row.
  if (!row.itemName && !row.quantity) return null;

  for (const f of [
    "stockNumber",
    "itemName",
    "description",
    "category",
    "unit",
    "quantity",
    "unitCost",
  ] as ImportField[]) {
    if (cellConf(f) < 60) row.uncertain[f] = true;
  }
  if (nameFromDescription && cellConf("description") < 60) row.uncertain.itemName = true;
  // A unit cost equal to the line total on a line of several is probably the total.
  const qty = Number(row.quantity);
  if (row.unitCost && row.lineTotal && qty > 1 && Number(row.unitCost) === Number(row.lineTotal)) {
    row.uncertain.unitCost = true;
  }
  // Only a total was printed: the unit price is left blank for the reviewer, never derived.
  if (!row.unitCost) row.uncertain.unitCost = true;
  // Required fields left blank are always worth flagging.
  if (!row.itemName) row.uncertain.itemName = true;
  if (!row.quantity) row.uncertain.quantity = true;
  // A recognised unit is trustworthy; an unreadable one stays flagged.
  if (!row.unit) row.uncertain.unit = true;
  else if (unitNorm.recognized) delete row.uncertain.unit;
  return row;
}

/** Conservative fallback when no header is found: item + quantity only. */
function rowFromPositional(line: Line): ImportRow | null {
  const words = line.words;
  const nums = words.filter((w) => isNumeric(w.text));
  const texts = words.filter((w) => !isNumeric(w.text));
  if (texts.length === 0) return null;

  // Last standalone integer on the line is the most likely quantity.
  const qtyWord = [...nums].reverse().find((w) => /^\d+$/.test(cleanNumber(w.text)));

  // In an "Item | Unit | Qty" layout the unit is a short recognisable token
  // between the name and the quantity. Pull the last such token out of the
  // text words so it does not end up glued to the item name.
  let unit = "";
  let unitConf = 100;
  const nameWords = [...texts];
  for (let i = nameWords.length - 1; i >= 0; i--) {
    if (isRecoverable(nameWords[i].text)) {
      unit = normalizeUnit(nameWords[i].text).unit;
      unitConf = nameWords[i].confidence;
      nameWords.splice(i, 1);
      break;
    }
  }

  const name = nameWords
    .map((w) => w.text)
    .join(" ")
    .trim();
  if (!name) return null;

  const row: ImportRow = {
    id: nextId(),
    selected: true,
    stockNumber: "",
    itemName: name,
    description: "",
    category: "",
    categorySource: "",
    unit,
    quantity: qtyWord ? cleanNumber(qtyWord.text) : "",
    unitCost: "",
    lineTotal: "",
    // A recovered, readable unit is trusted; otherwise the field stays flagged.
    uncertain: { unit: !unit || unitConf < 60, quantity: !qtyWord, category: true, unitCost: true },
  };
  // Positional extraction is inherently uncertain about the name split.
  if (line.words.some((w) => w.confidence < 70)) row.uncertain.itemName = true;
  return row;
}

const SKIP_ROW = /^(grand\s+)?(total|subtotal|prepared|approved|noted|received|page|signature)/i;

/**
 * Suggests a category for each row the document gave none, from the word
 * lists in classify.ts. A suggestion is marked as one and stays flagged
 * until the reviewer confirms or changes it (22 Oct 2026); an undetermined
 * one leaves the field blank.
 */
function autoClassify(rows: ImportRow[]): void {
  for (const row of rows) {
    if (row.category) continue; // an explicit category column already won.
    const result = classifyCategory(row.itemName, row.description);
    if (result.category) {
      row.category = result.category;
      row.categorySource = "suggested";
    }
    row.uncertain.category = true;
  }
}

/** Parses OCR words into preview rows. */
export function parseRows(words: OcrWord[]): { rows: ImportRow[]; usedHeader: boolean } {
  seq = 0;
  if (words.length === 0) return { rows: [], usedHeader: false };

  const lines = toLines(words);
  const header = detectHeader(lines);
  const rows: ImportRow[] = [];

  if (header) {
    const headerY = header.line.yCenter;
    const headerPage = header.line.page;
    for (const line of lines) {
      // Take rows below the header, plus everything on later pages.
      const below = line.page > headerPage || (line.page === headerPage && line.yCenter > headerY);
      if (!below) continue;
      const joined = line.words.map((w) => w.text).join(" ");
      if (SKIP_ROW.test(joined.trim())) continue;
      const row = rowFromColumns(line, header.columns);
      if (row) rows.push(row);
    }
    autoClassify(rows);
    return { rows, usedHeader: true };
  }

  // No header: positional fallback over every line.
  for (const line of lines) {
    const joined = line.words.map((w) => w.text).join(" ");
    if (SKIP_ROW.test(joined.trim())) continue;
    const row = rowFromPositional(line);
    if (row) rows.push(row);
  }
  autoClassify(rows);
  return { rows, usedHeader: false };
}
