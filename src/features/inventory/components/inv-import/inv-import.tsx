import * as React from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, FileUp, Plus, RotateCcw, X } from "lucide-react";

import { Button, Checkbox, Combobox, ContainerCard, Input, SelectField, toast } from "@/components";
import { importInventoryItems } from "@/features/inventory/api";
import { canonicalCategory, isNewCategory } from "@/features/inventory/categories";
import { useInventoryCategories, useInventoryItems } from "@/features/inventory/hooks";
import { ACCEPTED_EXT, extractDocument, isAcceptedFile } from "@/features/inventory/smart-import/ocr";
import { parseRows } from "@/features/inventory/smart-import/parse";
import { blankImportRow, type ImportField, type ImportRow } from "@/features/inventory/smart-import/types";
import type { ImportBasis, ImportItemRow, ImportRowResult, InventoryItem } from "@/features/inventory/types";
import { useConfigOptions } from "@/features/config/use-module-config";
import { cn } from "@/lib/utils";

/**
 * Scan / Import Inventory Items (22 Oct 2026). A document listing several
 * items — a photo or scan of a stock list, or a PDF — is read in this
 * browser (pdf.js for a PDF's text, Tesseract for images and scanned pages;
 * no cloud service), its rows proposed for review, and only the rows the
 * Administrator confirms are saved, through the same createInventoryItems
 * function as Add Item. The document itself is not uploaded or kept.
 *
 * Nothing is guessed silently: unreadable values stay blank and flagged, a
 * suggested category is marked as one, a line total is never used as a unit
 * price, and an item already on the register is skipped unless the reviewer
 * chooses to add its quantity as stock received or to create a separate item.
 */

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_PAGES = 10;
const MAX_ROWS = 200;

type Stage = "upload" | "reading" | "review" | "saving" | "done";
/** What to do with a row whose item is already on the register. */
type DupAction = "skip" | "add" | "new";

interface Row extends ImportRow {
  /** The register item with the same name, if any. */
  match?: Pick<InventoryItem, "id" | "itemCode" | "name" | "unit" | "onHand">;
  dupAction: DupAction;
}

interface Extraction {
  method: "text" | "ocr" | "mixed";
  pageCount: number;
  confidence: number;
  /** The text reads like a Purchase Order or Purchase Request. */
  looksLikeOrder: boolean;
}

const nameKey = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
/** "1,250.50" or "₱ 1250.5" → 1250.5; blank → NaN. */
const parseAmount = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(/[₱,\s]/g, "")));
const peso = (n: number) => `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-PH")} ${n === 1 ? one : many}`;

/** What stands in the way of saving a row (errors) and what to double-check (notes). */
function checkRow(row: Row, basis: ImportBasis | null, categories: string[], earlierNames: Set<string>) {
  const errors: string[] = [];
  const notes: string[] = [];
  const adding = row.dupAction === "add" && !!row.match;
  const qty = parseAmount(row.quantity);
  const price = parseAmount(row.unitCost);
  if (!row.itemName.trim()) errors.push("Name missing");
  if (!adding && !row.category.trim()) errors.push("Category missing");
  if (!adding && !row.unit.trim()) errors.push("Unit missing");
  if (basis !== "catalog" || adding) {
    if (Number.isNaN(qty)) errors.push("Quantity missing");
    else if (qty < 0) errors.push("Quantity below 0");
    else if (adding && qty === 0) errors.push("Quantity received is 0");
  }
  if (!adding) {
    if (Number.isNaN(price)) {
      errors.push(row.lineTotal ? `Unit price missing (line total ${peso(parseAmount(row.lineTotal))})` : "Unit price missing");
    } else if (price < 0) errors.push("Unit price below 0");
  }
  if (adding && basis === "catalog") errors.push("Ordered quantities cannot be added to stock");
  if (row.match && row.dupAction === "skip") notes.push(`Already on the register as ${row.match.itemCode}`);
  if (!adding && row.categorySource === "suggested" && row.category) notes.push("Suggested category — check it");
  if (!adding && row.category.trim() && isNewCategory(row.category, categories)) notes.push("New category");
  if (row.uncertain.unitCost && row.unitCost && row.lineTotal) notes.push("Unit price may be the line total");
  const unsure = (["itemName", "unit", "quantity", "unitCost"] as ImportField[]).filter(
    (f) => row.uncertain[f] && String(row[f as keyof ImportRow] ?? "").trim(),
  );
  if (unsure.length) notes.push("Read unclearly — check the highlighted values");
  if (earlierNames.has(nameKey(row.itemName))) notes.push("Appears twice in this document");
  return { errors, notes };
}

export function InvImport() {
  const navigate = useNavigate();
  const { data: register } = useInventoryItems(React.useMemo(() => ({}), []));
  const { categories } = useInventoryCategories(register);
  const { options: configuredUnits } = useConfigOptions("Procurement", "item_units");
  const units = React.useMemo(
    () => [...new Set([...configuredUnits, ...register.map((i) => i.unit)].filter(Boolean))].sort(),
    [configuredUnits, register],
  );

  const [stage, setStage] = React.useState<Stage>("upload");
  const [file, setFile] = React.useState<File | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState({ fraction: 0, note: "" });
  const [extraction, setExtraction] = React.useState<Extraction | null>(null);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [basis, setBasis] = React.useState<ImportBasis | null>(null);
  const [results, setResults] = React.useState<ImportRowResult[] | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  // One ID per document: a retry saves only the rows not saved yet.
  const requestId = React.useRef(crypto.randomUUID());

  const byName = React.useMemo(() => new Map(register.map((i) => [nameKey(i.name), i])), [register]);
  const withMatch = React.useCallback(
    (r: ImportRow): Row => {
      const hit = r.itemName.trim() ? byName.get(nameKey(r.itemName)) : undefined;
      return {
        ...r,
        match: hit ? { id: hit.id, itemCode: hit.itemCode, name: hit.name, unit: hit.unit, onHand: hit.onHand } : undefined,
        dupAction: "skip",
      };
    },
    [byName],
  );

  const read = async (picked: File) => {
    setProblem(null);
    if (!isAcceptedFile(picked)) return setProblem(`${picked.name} is not a JPG, PNG, WebP or PDF file.`);
    if (picked.size > MAX_BYTES) return setProblem(`${picked.name} is larger than 15 MB.`);
    setFile(picked);
    setStage("reading");
    setProgress({ fraction: 0, note: "Opening the document…" });
    try {
      const result = await extractDocument([picked], (fraction, note) => setProgress({ fraction, note }), MAX_PAGES);
      const parsed = parseRows(result.words).rows.slice(0, MAX_ROWS);
      const text = result.words.map((w) => w.text).join(" ");
      setExtraction({
        method: result.method,
        pageCount: result.pageCount,
        confidence: Math.round(result.meanConfidence),
        looksLikeOrder: /purchase\s*order|purchase\s*request|\bP\.?\s?O\.?\s*No|\bPR\s*No/i.test(text),
      });
      requestId.current = crypto.randomUUID();
      setRows(parsed.map((r) => withMatch(r)));
      setBasis(null);
      setResults(null);
      setStage("review");
    } catch (e) {
      setStage("upload");
      setFile(null);
      setProblem(e instanceof Error ? e.message : "The document could not be read.");
    }
  };

  const update = (id: string, patch: Partial<Row>) =>
    setRows((rs) =>
      rs.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch } as Row;
        // An edited value is the reviewer's own: no longer "read unclearly".
        const uncertain = { ...r.uncertain };
        for (const k of Object.keys(patch)) delete uncertain[k as ImportField];
        next.uncertain = uncertain;
        if ("category" in patch) next.categorySource = patch.category ? "document" : "";
        return "itemName" in patch ? { ...withMatch(next), dupAction: r.dupAction, uncertain } : next;
      }),
    );

  const checks = React.useMemo(() => {
    const seen = new Set<string>();
    return new Map(
      rows.map((r) => {
        const c = checkRow(r, basis, categories, seen);
        if (r.itemName.trim()) seen.add(nameKey(r.itemName));
        return [r.id, c] as const;
      }),
    );
  }, [rows, basis, categories]);

  /** Rows that will be saved: included, and not an item already registered left as "skip". */
  const importing = rows.filter((r) => r.selected && !(r.match && r.dupAction === "skip"));
  const blocked = importing.filter((r) => (checks.get(r.id)?.errors.length ?? 0) > 0);
  const ready = importing.length - blocked.length;
  const excluded = rows.length - importing.length;
  const duplicates = rows.filter((r) => r.match).length;
  const newRows = importing.filter((r) => !(r.match && r.dupAction === "add"));
  const addRows = importing.filter((r) => r.match && r.dupAction === "add");
  const newUnits = basis === "opening" ? newRows.reduce((s, r) => s + (parseAmount(r.quantity) || 0), 0) : 0;
  const addedUnits = addRows.reduce((s, r) => s + (parseAmount(r.quantity) || 0), 0);
  const canConfirm = stage === "review" && !!basis && importing.length > 0 && blocked.length === 0;

  const save = async () => {
    if (!canConfirm || !basis || !file) return;
    setStage("saving");
    setSaveError(null);
    const payload: ImportItemRow[] = importing.map((r) =>
      r.match && r.dupAction === "add"
        ? { key: r.id, name: r.itemName.trim(), category: "", unit: "", quantity: parseAmount(r.quantity), unitPrice: 0, addToItemId: r.match.id }
        : {
            key: r.id,
            name: r.itemName.trim(),
            category: canonicalCategory(r.category, categories),
            unit: r.unit.trim(),
            quantity: basis === "opening" ? parseAmount(r.quantity) : 0,
            unitPrice: Math.round(parseAmount(r.unitCost) * 100) / 100,
          },
    );
    try {
      const out = await importInventoryItems({ requestId: requestId.current, basis, sourceName: file.name, rows: payload });
      setResults(out);
      setStage("done");
      const saved = out.filter((r) => r.ok).length;
      if (saved === out.length) toast.success(`${plural(saved, "row")} saved`);
      else toast.error(`${saved} of ${out.length} rows saved — see which were not`);
    } catch (e) {
      // Nothing is known to be saved; the same request can be sent again safely.
      setSaveError(e instanceof Error ? e.message : "The import did not go through.");
      setStage("review");
    }
  };

  const startOver = () => {
    setStage("upload");
    setFile(null);
    setRows([]);
    setBasis(null);
    setResults(null);
    setExtraction(null);
    setSaveError(null);
    requestId.current = crypto.randomUUID();
  };

  /* ---------------- upload ---------------- */

  if (stage === "upload" || stage === "reading") {
    const reading = stage === "reading";
    return (
      <ContainerCard className="mx-auto w-full max-w-3xl p-5 sm:p-6">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!reading) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f && !reading) void read(f);
          }}
          className={cn(
            "flex flex-col items-center rounded-[12px] border border-dashed px-6 py-10 text-center transition-colors",
            dragging ? "border-[#a6323b] bg-[#fbf3f4]" : "border-[#d4d5d2] bg-[#fafaf9]",
          )}
        >
          {reading ? (
            <div className="w-full max-w-sm" role="status" aria-live="polite">
              <p className="text-[14px] font-medium text-neutral-900">Reading {file?.name}</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#ececea]">
                <div
                  className="h-full rounded-full bg-[#a6323b] transition-[width] duration-300"
                  style={{ width: `${Math.max(4, Math.round(progress.fraction * 100))}%` }}
                />
              </div>
              <p className="mt-2 text-[12.5px] text-[#5b606b]">{progress.note}</p>
            </div>
          ) : (
            <>
              <FileUp aria-hidden="true" className="h-6 w-6 text-[#6b707a]" />
              <p className="mt-3 text-[14px] font-medium text-neutral-900">Drop a document here, or</p>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED_EXT}
                className="sr-only"
                aria-label="Choose a document to scan"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void read(f);
                }}
              />
              <Button className="mt-3" onClick={() => inputRef.current?.click()}>
                <FileUp />
                Upload file
              </Button>
              <p className="mt-4 text-[12.5px] text-[#5b606b]">
                JPG, PNG, WebP or PDF · one document, up to 15 MB · PDFs up to {MAX_PAGES} pages
              </p>
            </>
          )}
        </div>
        {problem && (
          <p role="alert" className="mt-3 flex items-start gap-2 text-[13px] text-[#9a3412]">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            {problem}
          </p>
        )}
        <ul className="mt-4 space-y-1 text-[12.5px] text-[#5b606b]">
          <li>The document is read in this browser and is not uploaded or kept. Nothing is saved until you confirm.</li>
          <li>A PDF with selectable text is read exactly; photos and scans are read by text recognition, which can misread — every row is reviewed before saving.</li>
          <li>The first scan of a photo downloads the text-recognition engine (about 15 MB) once.</li>
        </ul>
      </ContainerCard>
    );
  }

  /* ---------------- done ---------------- */

  if (stage === "done" && results) {
    const saved = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    return (
      <ContainerCard className="mx-auto w-full max-w-3xl p-5 sm:p-6">
        <h2 className="text-[15px] font-semibold text-neutral-900">
          {failed.length === 0 ? `All ${plural(saved.length, "row")} saved` : `${saved.length} of ${results.length} rows saved`}
        </h2>
        <p className="mt-1 text-[13px] text-[#5b606b]">As confirmed by the database. From {file?.name}.</p>
        {saved.length > 0 && (
          <ul className="mt-4 divide-y divide-[#f0f0ee] rounded-[12px] border border-[#ececea]">
            {saved.map((r) => (
              <li key={r.index} className="flex items-center gap-3 px-4 py-2.5 text-[13.5px]">
                <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-[#15803d]" />
                <span className="font-['Geist_Mono',ui-monospace,monospace] text-[12.5px] text-neutral-700">{r.code}</span>
                <span className="min-w-0 flex-1 truncate text-neutral-900">{r.name}</span>
                <span className="text-[12.5px] text-[#5b606b]">
                  {r.action === "added-stock" ? "Stock added" : "New item"}
                  {r.already ? " · already saved earlier" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        {failed.length > 0 && (
          <>
            <h3 className="mt-5 text-[13.5px] font-semibold text-[#9a3412]">Not saved</h3>
            <ul className="mt-2 divide-y divide-[#f0f0ee] rounded-[12px] border border-[#f2d6c2]">
              {failed.map((r) => (
                <li key={r.index} className="flex items-start gap-3 px-4 py-2.5 text-[13.5px]">
                  <X aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[#9a3412]" />
                  <span className="min-w-0 flex-1 text-neutral-900">{r.name}</span>
                  <span className="text-[12.5px] text-[#9a3412]">{r.error}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {failed.length > 0 && (
            <Button variant="secondary" onClick={() => setStage("review")}>
              <RotateCcw />
              Back to review
            </Button>
          )}
          <Button variant="secondary" onClick={startOver}>
            Import another document
          </Button>
          <Button onClick={() => navigate("/inventory")}>Back to Inventory</Button>
        </div>
      </ContainerCard>
    );
  }

  /* ---------------- review ---------------- */

  const allSelected = rows.length > 0 && rows.every((r) => r.selected);
  const flagged = (r: Row, f: ImportField) => !!r.uncertain[f];
  const cell = "h-9 rounded-[8px] border-[#d4d5d2] px-2.5 text-[13.5px]";
  const unsureCell = "border-[#e0b25b] bg-[#fff8eb]";

  return (
    <div className="space-y-4">
      {/* Source document */}
      <ContainerCard className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-medium text-neutral-900">{file?.name}</p>
          <p className="text-[12.5px] text-[#5b606b]">
            {extraction ? (
              <>
                {plural(extraction.pageCount, "page")} ·{" "}
                {extraction.method === "text"
                  ? "read from the PDF's text"
                  : `read by text recognition (average confidence ${extraction.confidence}%)`}{" "}
                · {plural(rows.length, "row")} found
              </>
            ) : null}
          </p>
        </div>
        <Button variant="secondary" onClick={startOver}>
          Choose another file
        </Button>
      </ContainerCard>

      {/* What the document shows — required before anything changes stock. */}
      <ContainerCard className="px-5 py-4">
        <fieldset>
          <legend className="text-[13.5px] font-semibold text-neutral-900">
            What does this document show? <span className="font-normal text-[#5b606b]">Required</span>
          </legend>
          {extraction?.looksLikeOrder && (
            <p className="mt-2 flex items-start gap-2 rounded-[10px] border border-[#f2d6c2] bg-[#fdf6f0] px-3 py-2 text-[13px] text-[#7c2d12]">
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              This looks like a Purchase Order or Purchase Request. Ordered or requested quantities are not stock on hand —
              choose “Item list only” unless these goods were received and counted.
            </p>
          )}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(
              [
                ["opening", "Stock on hand", "A count of items on the shelf. Quantities are saved as opening stock."],
                ["catalog", "Item list only", "A PR, PO or price list. Items are registered with 0 on hand; quantities are not added."],
              ] as const
            ).map(([value, title, text]) => (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-[12px] border px-3.5 py-3 transition-colors",
                  basis === value ? "border-neutral-900 bg-white" : "border-[#e6e6e3] bg-[#fafaf9] hover:bg-white",
                )}
              >
                <input
                  type="radio"
                  name="import-basis"
                  value={value}
                  checked={basis === value}
                  onChange={() => setBasis(value)}
                  className="mt-0.5 h-4 w-4 accent-[#16181d]"
                />
                <span>
                  <span className="block text-[13.5px] font-medium text-neutral-900">{title}</span>
                  <span className="block text-[12.5px] text-[#5b606b]">{text}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </ContainerCard>

      {/* Extracted rows */}
      <ContainerCard className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#ececea] px-5 py-3">
          <h2 className="text-[13.5px] font-semibold text-neutral-900">Review the extracted items</h2>
          <Button
            variant="ghost"
            onClick={() => setRows((rs) => [...rs, { ...blankImportRow(`row-${crypto.randomUUID().slice(0, 8)}`), dupAction: "skip" }])}
            disabled={rows.length >= MAX_ROWS}
          >
            <Plus />
            Add a row
          </Button>
        </div>
        {rows.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-[14px] font-medium text-neutral-900">No item rows were found in this document.</p>
            <p className="mt-1 text-[13px] text-[#5b606b]">
              Try a sharper, straight-on photo or the original PDF, or add the rows by hand.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] border-collapse text-left">
              <thead>
                <tr className="text-[12.5px] text-[#6b707a]">
                  <th className="w-10 px-3 py-2.5 font-normal">
                    <Checkbox
                      aria-label="Include every row"
                      checked={allSelected}
                      onCheckedChange={(v) => setRows((rs) => rs.map((r) => ({ ...r, selected: v === true })))}
                    />
                  </th>
                  <th className="px-2 py-2.5 font-normal">Item name</th>
                  <th className="w-[200px] px-2 py-2.5 font-normal">Category</th>
                  <th className="w-[96px] px-2 py-2.5 font-normal">Unit</th>
                  <th className="w-[104px] px-2 py-2.5 font-normal">
                    Quantity{basis === "catalog" ? <span className="block text-[11.5px]">ordered — not added</span> : null}
                  </th>
                  <th className="w-[120px] px-2 py-2.5 font-normal">Unit price (₱)</th>
                  <th className="w-[240px] px-2 py-2.5 font-normal">Status</th>
                  <th className="w-10 px-2 py-2.5" aria-label="Remove" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const c = checks.get(r.id) ?? { errors: [], notes: [] };
                  const adding = r.dupAction === "add" && !!r.match;
                  const skipped = !r.selected || (r.match && r.dupAction === "skip");
                  const status = skipped ? "Excluded" : c.errors.length ? "Needs correction" : c.notes.length ? "Check" : "Ready";
                  const dot = skipped ? "bg-[#a3a6ad]" : c.errors.length ? "bg-[#c2410c]" : c.notes.length ? "bg-[#d39a1f]" : "bg-[#15803d]";
                  return (
                    <tr key={r.id} className={cn("border-t border-[#f0f0ee] align-top", skipped && "bg-[#fafaf9]")}>
                      <td className="px-3 py-2.5">
                        <Checkbox
                          aria-label={`Include row ${i + 1}`}
                          checked={r.selected}
                          onCheckedChange={(v) => update(r.id, { selected: v === true })}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          aria-label={`Row ${i + 1}: item name`}
                          value={r.itemName}
                          onChange={(e) => update(r.id, { itemName: e.target.value })}
                          className={cn(cell, flagged(r, "itemName") && unsureCell)}
                        />
                        {r.match && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-[#5b606b]">
                            <span>
                              On the register: {r.match.itemCode} · {r.match.onHand} {r.match.unit}
                            </span>
                            <SelectField
                              aria-label={`Row ${i + 1}: what to do with this item already on the register`}
                              value={r.dupAction}
                              onChange={(v) => update(r.id, { dupAction: v as DupAction })}
                              options={[
                                { value: "skip", label: "Don't import" },
                                { value: "add", label: "Add quantity as stock received", disabled: basis === "catalog" },
                                { value: "new", label: "Create a separate item" },
                              ]}
                              className="h-8 w-[230px] text-[12.5px]"
                            />
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {adding ? (
                          <span className="block pt-2 text-[12.5px] text-[#6b707a]">Kept from {r.match?.itemCode}</span>
                        ) : (
                          <Combobox
                            allowCustomValue
                            placeholder="Choose or type…"
                            searchPlaceholder="Search or type a new category…"
                            emptyText="Type a name to add a new category."
                            options={categories.map((cat) => ({ value: cat, label: cat }))}
                            value={r.category || undefined}
                            onChange={(v) => update(r.id, { category: v })}
                            className={cn(cell, "w-full", (flagged(r, "category") || r.categorySource === "suggested") && r.category && unsureCell)}
                          />
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {adding ? (
                          <span className="block pt-2 text-[12.5px] text-[#6b707a]">{r.match?.unit}</span>
                        ) : (
                          <Input
                            aria-label={`Row ${i + 1}: unit`}
                            list="import-units"
                            value={r.unit}
                            onChange={(e) => update(r.id, { unit: e.target.value })}
                            className={cn(cell, flagged(r, "unit") && r.unit && unsureCell)}
                          />
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          aria-label={`Row ${i + 1}: quantity`}
                          inputMode="decimal"
                          value={r.quantity}
                          onChange={(e) => update(r.id, { quantity: e.target.value })}
                          className={cn(
                            cell,
                            "tabular-nums",
                            basis === "catalog" && !adding && "text-[#6b707a]",
                            flagged(r, "quantity") && r.quantity && unsureCell,
                          )}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        {adding ? (
                          <span className="block pt-2 text-[12.5px] text-[#6b707a]">Unchanged</span>
                        ) : (
                          <Input
                            aria-label={`Row ${i + 1}: unit price in pesos`}
                            inputMode="decimal"
                            value={r.unitCost}
                            onChange={(e) => update(r.id, { unitCost: e.target.value })}
                            className={cn(cell, "tabular-nums", flagged(r, "unitCost") && r.unitCost && unsureCell)}
                          />
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-[12.5px]">
                        <span className="flex items-center gap-1.5 font-medium text-neutral-900">
                          <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", dot)} />
                          {status}
                        </span>
                        {!skipped && (
                          <ul className="mt-1 space-y-0.5">
                            {c.errors.map((m) => (
                              <li key={m} className="text-[#9a3412]">{m}</li>
                            ))}
                            {c.notes.map((m) => (
                              <li key={m} className="text-[#5b606b]">{m}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          aria-label={`Remove row ${i + 1}`}
                          onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
                        >
                          <X />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <datalist id="import-units">
              {units.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </div>
        )}
      </ContainerCard>

      {/* Summary and the one action */}
      <ContainerCard className="px-5 py-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-3 lg:grid-cols-6">
          {(
            [
              ["Extracted rows", rows.length],
              ["Ready to import", ready],
              ["Need correction", blocked.length],
              ["Excluded", excluded],
              ["Possible duplicates", duplicates],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="text-[#6b707a]">{label}</dt>
              <dd className={cn("text-[18px] font-semibold tabular-nums text-neutral-900", label === "Need correction" && value > 0 && "text-[#9a3412]")}>
                {value.toLocaleString("en-PH")}
              </dd>
            </div>
          ))}
          <div>
            <dt className="text-[#6b707a]">Expected stock change</dt>
            <dd className="text-[13px] text-neutral-900">
              {!basis
                ? "Choose what the document shows"
                : basis === "catalog" && addRows.length === 0
                  ? `None — ${plural(newRows.length, "item")} at 0 on hand`
                  : [
                      newRows.length ? `+${newUnits.toLocaleString("en-PH")} units, ${plural(newRows.length, "new item")}` : null,
                      addRows.length ? `+${addedUnits.toLocaleString("en-PH")} units to ${plural(addRows.length, "existing item")}` : null,
                    ]
                      .filter(Boolean)
                      .join("; ") || "None"}
            </dd>
          </div>
        </dl>
        {saveError && (
          <p role="alert" className="mt-3 text-[13px] text-[#9a3412]">
            {saveError} Rows already saved will not be saved twice if you confirm again.
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-[#f0f0ee] pt-4">
          <p className="mr-auto text-[12.5px] text-[#5b606b]">
            {!basis
              ? "Say what the document shows before importing."
              : blocked.length
                ? `Correct or exclude ${plural(blocked.length, "row")} to continue.`
                : importing.length === 0
                  ? "No rows are selected for import."
                  : `${plural(importing.length, "row")} will be saved. Each new item gets its code when saved.`}
          </p>
          <Button variant="ghost" onClick={() => navigate("/inventory")} disabled={stage === "saving"}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!canConfirm} loading={stage === "saving"}>
            Confirm Import
          </Button>
        </div>
      </ContainerCard>
    </div>
  );
}
