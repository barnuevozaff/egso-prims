import * as React from "react";
import { Check, Search } from "lucide-react";

import { Input, Spinner } from "@/components";
import type { StockSuggestion } from "@/features/ris/api";
import { matchStock, type StockList } from "@/features/ris/components/ris-form/stock-list";
import { cn } from "@/lib/utils";

/**
 * Rows rendered at first. Scrolling near the end, or the arrow keys, render
 * more, so opening the list and each key typed cost the same with 30 items
 * or 1,000 on an older office PC (29 Oct 2026).
 */
const PAGE = 60;

/**
 * The portal's item picker. Clicking the field opens the whole GSO stock list
 * (the Inventory), and typing narrows it at once, from the first letter and
 * anywhere in the name (29 Oct 2026). A line must be picked from the list —
 * the Inventory is the catalog of what can be requested — and picking links
 * it to that item and sets its unit (22 Oct 2026).
 */
export function StockNameInput({
  id,
  label,
  stock,
  value,
  onChange,
  onBlur,
  onPick,
  selectedId,
  invalid,
  className,
}: {
  id: string;
  label: string;
  /** The GSO stock list, loaded once for the whole form (useStockList). */
  stock: StockList;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  onPick: (s: StockSuggestion) => void;
  /** The register item the line is linked to, once picked. */
  selectedId?: string;
  invalid?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const [shown, setShown] = React.useState(PAGE);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const listId = `${id}-options`;

  // A picked item opens the whole list again, so it can be changed; typing filters it.
  const query = selectedId ? "" : value;
  const matches = React.useMemo(() => matchStock(stock.items, query), [stock.items, query]);
  const activeIndex = active < matches.length ? active : -1;
  // Two items with the same name and unit are told apart by their code.
  const twins = React.useMemo(() => {
    const count = new Map<string, number>();
    for (const s of stock.items) {
      const key = `${s.name.toLowerCase()}|${s.unit}`;
      count.set(key, (count.get(key) ?? 0) + 1);
    }
    return count;
  }, [stock.items]);

  // Highlights a row, rendering the list down to it first.
  const moveTo = (i: number) => {
    setActive(i);
    setShown((n) => Math.max(n, i + 1));
  };

  const openList = () => {
    setOpen(true);
    stock.refresh();
    setShown(PAGE);
    moveTo(selectedId ? matches.findIndex((s) => s.id === selectedId) : -1);
  };

  // Stable, so the memoized rows do not all render again with each parent render.
  const onPickRef = React.useRef(onPick);
  React.useLayoutEffect(() => {
    onPickRef.current = onPick;
  });
  const pick = React.useCallback((s: StockSuggestion) => {
    onPickRef.current(s);
    setOpen(false);
    setActive(-1);
  }, []);

  // The list opens below the field; bring it into view if the page cuts it off.
  React.useEffect(() => {
    if (open) panelRef.current?.scrollIntoView({ block: "nearest" });
  }, [open, stock.status]);

  React.useEffect(() => {
    if (open && activeIndex >= 0) document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, listId]);

  const listed = open && matches.length > 0;
  const typed = query.trim();

  return (
    <div className="relative">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a8f98]"
      />
      <Input
        id={id}
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listed ? listId : undefined}
        aria-activedescendant={listed && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        autoComplete="off"
        placeholder="Search or choose an item"
        value={value}
        invalid={invalid}
        className={cn(className, "pl-9")}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
          // New matches start from the top.
          setShown(PAGE);
          listRef.current?.scrollTo({ top: 0 });
        }}
        onFocus={openList}
        // Reopens the list in a field that still has focus, after Escape or a pick.
        onClick={() => {
          if (!open) openList();
        }}
        onBlur={() => {
          setOpen(false);
          onBlur();
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) return openList();
            if (matches.length === 0) return;
            const last = matches.length - 1;
            moveTo(
              e.key === "ArrowDown"
                ? activeIndex >= last ? 0 : activeIndex + 1
                : activeIndex <= 0 ? last : activeIndex - 1,
            );
          } else if (e.key === "Enter" && open) {
            // Enter in an open list picks; it never submits the form.
            e.preventDefault();
            const s = activeIndex >= 0 ? matches[activeIndex] : matches.length === 1 ? matches[0] : undefined;
            if (s) pick(s);
          } else if (e.key === "Escape" && open) {
            e.preventDefault();
            setOpen(false);
          } else if (e.key === "Tab" && open && activeIndex >= 0) {
            // Only an item chosen with the arrow keys; focus then moves on as usual.
            pick(matches[activeIndex]);
          }
        }}
      />
      {open && (
        <div
          ref={panelRef}
          // Keeps focus in the field, so a pick or a scroll does not close the list first.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute inset-x-0 top-[calc(100%+4px)] z-30 scroll-mb-4 overflow-hidden rounded-xl border border-[#e4e4e1] bg-white shadow-[0_12px_32px_-8px_rgba(22,24,29,0.22)]"
        >
          <div className="flex items-baseline justify-between gap-3 px-3 pb-1.5 pt-2.5 text-[12px] text-[#5b606b]">
            <span className="font-medium">GSO stock list</span>
            {stock.items.length > 0 && (
              <span role="status" className="tabular-nums">
                {typed ? `${matches.length} of ${stock.items.length}` : `${stock.items.length} items`}
              </span>
            )}
          </div>
          {listed ? (
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label="GSO stock list"
              onScroll={(e) => {
                const el = e.currentTarget;
                if (shown < matches.length && el.scrollTop + el.clientHeight > el.scrollHeight - 240) {
                  setShown((n) => n + PAGE);
                }
              }}
              className="max-h-[min(19rem,45vh)] list-none overflow-y-auto overscroll-contain px-1 pb-1"
            >
              {matches.slice(0, shown).map((s, i) => (
                <StockOption
                  key={s.id || `${s.name}|${s.unit}`}
                  id={`${listId}-${i}`}
                  item={s}
                  position={i + 1}
                  total={matches.length}
                  query={typed}
                  active={i === activeIndex}
                  chosen={!!selectedId && s.id === selectedId}
                  showCode={(twins.get(`${s.name.toLowerCase()}|${s.unit}`) ?? 0) > 1}
                  onPick={pick}
                />
              ))}
            </ul>
          ) : stock.items.length === 0 && stock.status === "loading" ? (
            <p className="flex items-center gap-2 px-3 pb-3 pt-1 text-[13px] text-[#5b606b]">
              <Spinner size="sm" label="Loading" />
              Loading the stock list…
            </p>
          ) : stock.items.length === 0 && stock.status === "error" ? (
            <p role="alert" className="px-3 pb-3 pt-1 text-[13px] text-[#5b606b]">
              The stock list could not be loaded. Check the connection, then click the field again.
            </p>
          ) : stock.items.length === 0 ? (
            <p role="status" className="px-3 pb-3 pt-1 text-[13px] text-[#5b606b]">
              The GSO stock list has no items yet. Ask the GSO.
            </p>
          ) : (
            <div role="status" className="px-3 pb-3 pt-1 text-[13px]">
              <p className="font-medium text-neutral-900">No matching inventory items found</p>
              <p className="mt-0.5 text-[#5b606b]">
                Nothing on the list contains “{typed}”. Check the spelling or try a shorter word.
              </p>
            </div>
          )}
          <p className="border-t border-[#ececea] px-3 py-2 text-[12px] text-[#5b606b]">
            Only items on the GSO stock list can be requested.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * One row of the list. Memoized, so moving through a 300-item list with the
 * arrow keys renders two rows, not all of them; rows scrolled out of view
 * skip style and layout (content-visibility, Chrome 85+), which keeps
 * opening the list quick on older office PCs.
 */
const StockOption = React.memo(function StockOption({
  id,
  item: s,
  position,
  total,
  query,
  active,
  chosen,
  showCode,
  onPick,
}: {
  id: string;
  item: StockSuggestion;
  /** Where the row is among all matches, rendered or not ("3 of 301"). */
  position: number;
  total: number;
  query: string;
  active: boolean;
  chosen: boolean;
  /** Two items share this name and unit: tell them apart by code. */
  showCode: boolean;
  onPick: (s: StockSuggestion) => void;
}) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      aria-posinset={position}
      aria-setsize={total}
      onClick={() => onPick(s)}
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-1.5 text-[14px] text-neutral-900 [contain-intrinsic-size:auto_44px] [content-visibility:auto]",
        active ? "bg-[#f3f3f1]" : "hover:bg-[#fafaf9]",
      )}
    >
      <span className="min-w-0 flex-1 wrap-break-word">
        <span className={chosen ? "font-medium" : undefined}>
          <Highlight text={s.name} query={query} />
        </span>{" "}
        <span className="text-[#5b606b]">· {s.unit}</span>
        {showCode && s.code && <span className="block text-[12px] text-[#5b606b]">{s.code}</span>}
      </span>
      {s.inStock ? (
        <span className="shrink-0 text-[12px] font-medium text-neutral-900">In stock</span>
      ) : (
        <span className="shrink-0 text-[12px] text-[#5b606b]">Out of stock</span>
      )}
      <span className="grid w-4 shrink-0 place-items-center">
        {chosen && (
          <>
            <Check aria-hidden="true" className="h-4 w-4 text-neutral-900" />
            <span className="sr-only">, chosen</span>
          </>
        )}
      </span>
    </li>
  );
});

/** The name with the typed text in bold, where it appears as typed. */
function Highlight({ text, query }: { text: string; query: string }) {
  const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-transparent font-semibold text-inherit">{text.slice(at, at + query.length)}</mark>
      {text.slice(at + query.length)}
    </>
  );
}
