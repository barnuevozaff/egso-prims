/**
 * Smart Import OCR engine — browser-side, no backend.
 *
 * Images are OCR'd directly; PDFs are first rasterized page by page with
 * pdf.js, then OCR'd. Both libraries are heavy, so they are dynamically
 * imported here — the main bundle stays lean and the ~15 MB Tesseract model
 * only downloads the first time an administrator actually runs Smart Import.
 *
 * The result is a flat list of recognised words with their bounding boxes and
 * per-word confidence; the parser (parse.ts) turns that into table rows.
 */

export interface OcrWord {
  text: string;
  /** 0–100 recognition confidence for this word. */
  confidence: number;
  /** Pixel bounds within its page. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 1-based page the word came from (multi-page PDFs). */
  page: number;
}

export interface OcrResult {
  words: OcrWord[];
  /** Mean confidence across all recognised words, 0–100. */
  meanConfidence: number;
  pageCount: number;
  /**
   * How the document was read:
   * - "text": every page had a usable text layer, so OCR was skipped entirely
   * - "ocr":  no text layer anywhere (scanned/images), Tesseract was used
   * - "mixed": some text pages, some scanned pages
   */
  method: "text" | "ocr" | "mixed";
}

export const ACCEPTED_MIME = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
];

export const ACCEPTED_EXT = ".jpg,.jpeg,.png,.webp,.pdf";

export function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_MIME.includes(file.type)) return true;
  return /\.(jpe?g|png|webp|pdf)$/i.test(file.name);
}

/**
 * Loads pdf.js once and points it at the bundled worker (no CDN).
 *
 * The legacy build, not the default one: pdf.js 5 assumes browsers newer
 * than the office PCs' Chrome 109 (it calls Promise.withResolvers, Chrome
 * 119+). The legacy build carries the polyfills, in the worker too.
 */
async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const worker = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

const hasAlnum = (s: string) => /[A-Za-z0-9]/.test(s);

/**
 * Reads a PDF page's embedded text layer and converts each text run into a
 * word with a bounding box, in the same shape OCR produces. Returns null when
 * the page has no meaningful text layer (i.e. it is a scanned image), so the
 * caller knows to fall back to OCR for that page.
 *
 * Text-layer confidence is 100 — the characters are exact, not recognised.
 */
async function textWordsFromPage(
  pdfjs: Awaited<ReturnType<typeof loadPdfjs>>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  pageNum: number,
): Promise<OcrWord[] | null> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const words: OcrWord[] = [];
  for (const item of content.items) {
    const str: string = item.str ?? "";
    if (!str.trim() || !hasAlnum(str)) continue;
    // Map the text matrix into device space (top-left origin).
    const tx = pdfjs.Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.hypot(tx[2], tx[3]) || Math.abs(tx[3]) || 10;
    const x0 = tx[4];
    const yBaseline = tx[5];
    const width = (item.width ?? 0) * Math.hypot(viewport.transform[0], viewport.transform[1]);
    words.push({
      text: str.trim(),
      confidence: 100,
      x0,
      y0: yBaseline - fontHeight,
      x1: x0 + (width || fontHeight),
      y1: yBaseline,
      page: pageNum,
    });
  }
  // A real table's text layer yields several runs; a scanned page yields none.
  const alnum = words.reduce((n, w) => n + w.text.length, 0);
  if (words.length < 3 || alnum < 15) return null;
  return words;
}

/** Rasterises one PDF page to a canvas at a legible scale for OCR fallback. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pageToCanvas(page: any): Promise<HTMLCanvasElement | null> {
  // 2x scale keeps small tabular text readable for the recogniser.
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  return canvas;
}

/** Loads an image file into a canvas so it and PDFs share one OCR path. */
async function imageToCanvas(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read the image."));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d")?.drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** OCRs a single canvas, appending its words (page-numbered) to `sink`. */
async function ocrCanvas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  worker: any,
  canvas: HTMLCanvasElement,
  page: number,
  sink: OcrWord[],
): Promise<void> {
  const { data } = await worker.recognize(canvas, {}, { blocks: true });
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        for (const w of line.words ?? []) {
          const t = w.text?.trim();
          if (!t) continue;
          sink.push({
            text: t,
            confidence: w.confidence ?? 0,
            x0: w.bbox.x0,
            y0: w.bbox.y0,
            x1: w.bbox.x1,
            y1: w.bbox.y1,
            page,
          });
        }
      }
    }
  }
}

/**
 * Two-stage extraction over one or more uploaded files.
 *
 * Stage 1 — for PDFs, read the embedded text layer with pdf.js. Any page that
 * has selectable text is parsed directly, so OCR is skipped and no recognition
 * errors are introduced.
 *
 * Stage 2 — only pages with no text layer (scanned PDFs) and image uploads are
 * rasterised and run through Tesseract.
 *
 * `onProgress` reports 0–1 so the dialog can show a bar.
 */
export async function extractDocument(
  files: File[],
  onProgress?: (fraction: number, note: string) => void,
): Promise<OcrResult> {
  const words: OcrWord[] = [];
  // Canvases that still need OCR, tagged with a global page number.
  const ocrQueue: { canvas: HTMLCanvasElement; page: number }[] = [];
  let usedText = false;
  let pageCounter = 0;
  let pdfjs: Awaited<ReturnType<typeof loadPdfjs>> | null = null;

  // ---- Stage 1: text layer + collect scanned pages ----
  for (const file of files) {
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (isPdf) {
      pdfjs ??= await loadPdfjs();
      onProgress?.(0, `Reading ${file.name}…`);
      const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      for (let n = 1; n <= doc.numPages; n++) {
        pageCounter++;
        const page = await doc.getPage(n);
        const textWords = await textWordsFromPage(pdfjs, page, pageCounter);
        if (textWords) {
          // Text-based page — no OCR needed.
          words.push(...textWords);
          usedText = true;
        } else {
          const canvas = await pageToCanvas(page);
          if (canvas) ocrQueue.push({ canvas, page: pageCounter });
        }
      }
    } else {
      pageCounter++;
      onProgress?.(0, `Reading ${file.name}…`);
      ocrQueue.push({ canvas: await imageToCanvas(file), page: pageCounter });
    }
  }

  // ---- Stage 2: OCR only the pages that had no text layer ----
  const usedOcr = ocrQueue.length > 0;
  if (usedOcr) {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    try {
      for (let i = 0; i < ocrQueue.length; i++) {
        onProgress?.(i / ocrQueue.length, `Recognising scanned page ${i + 1} of ${ocrQueue.length}…`);
        await ocrCanvas(worker, ocrQueue[i].canvas, ocrQueue[i].page, words);
      }
    } finally {
      await worker.terminate();
    }
  }

  onProgress?.(1, "Extracting rows…");
  const meanConfidence =
    words.length === 0 ? 0 : words.reduce((s, w) => s + w.confidence, 0) / words.length;
  const method: OcrResult["method"] =
    usedText && usedOcr ? "mixed" : usedText ? "text" : "ocr";
  return { words, meanConfidence, pageCount: pageCounter, method };
}
