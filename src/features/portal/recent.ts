import * as React from "react";

/**
 * The requests filed from this browser, so a returning filer sees where they
 * stand without hunting for the receipt.
 *
 * Only the reference number and when it was filed are kept; the status is
 * looked up live each time, so nothing here can go stale. The office PCs are
 * shared, which is why the home page offers "Clear list". The documents are
 * public by reference number anyway (see the public data policy), so keeping
 * the numbers in localStorage exposes nothing new.
 */

export interface FiledRequest {
  reference: string;
  /** ISO timestamp of the submission. */
  filedAt: string;
}

const KEY = "gso-portal:filed";
/** Enough to cover a busy week without the list turning into an archive. */
const LIMIT = 6;
const CHANGED = "gso-portal:filed-changed";

function read(): FiledRequest[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is FiledRequest =>
        typeof r?.reference === "string" && typeof r?.filedAt === "string",
    );
  } catch {
    // Private windows and blocked storage: behave as if nothing was filed.
    return [];
  }
}

function write(list: FiledRequest[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full or blocked: the receipt still has the number.
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** Called once a submission has its reference number. */
export function rememberFiling(reference: string) {
  const rest = read().filter((r) => r.reference !== reference);
  write([{ reference, filedAt: new Date().toISOString() }, ...rest].slice(0, LIMIT));
}

/** Empties the list and returns what it held, so the caller can offer Undo. */
export function clearFilings(): FiledRequest[] {
  const before = read();
  write([]);
  return before;
}

/** Puts back a cleared list, keeping anything filed since in front. */
export function restoreFilings(list: FiledRequest[]) {
  const now = read();
  const kept = list.filter((r) => !now.some((n) => n.reference === r.reference));
  write([...now, ...kept].slice(0, LIMIT));
}

/** The filed list, kept in step with other tabs and with "Clear list". */
export function useFiledRequests(): FiledRequest[] {
  const [list, setList] = React.useState(read);
  React.useEffect(() => {
    const sync = () => setList(read());
    window.addEventListener(CHANGED, sync);
    // `storage` fires when another tab changes the list.
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGED, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return list;
}
