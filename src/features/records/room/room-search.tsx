import * as React from "react";
import { Archive, Crosshair, ArrowUpRight, Search, X } from "lucide-react";

import { StatusBadge, type DocumentStatus } from "@/components";
import { docTone } from "@/features/records/components/room/room-format";
import { placeText, searchRoom, type CatalogDoc, type Placement, type RoomModel, type SearchHit } from "@/features/records/room/room-model";
import { DOC_TYPES } from "@/features/records/shelf-types";
import { cn } from "@/lib/utils";

/**
 * One search over the three registers and the room: a number, an office,
 * a kind of form, or the name of a shelf, level or box. Each result says what
 * it really is — in a box (and where, with Locate), unplaced (with Place
 * record), or awaiting approval (its status, never a shelf).
 */
export function RoomSearch({
  model,
  canManage,
  onLocate,
  onPlace,
  onOpen,
}: {
  model: RoomModel;
  canManage: boolean;
  onLocate: (placement: Placement) => void;
  onPlace: (doc: CatalogDoc) => void;
  onOpen: (doc: CatalogDoc) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const box = React.useRef<HTMLDivElement>(null);
  const hits = React.useMemo(() => searchRoom(model, query, 12), [model, query]);

  React.useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const act = (hit: SearchHit) => {
    setOpen(false);
    if (hit.kind === "placed") onLocate(hit.placement);
    else if (hit.kind === "unplaced" && canManage) onPlace(hit.doc);
    else onOpen(hit.doc);
  };

  return (
    <div ref={box} className="relative w-full sm:w-[340px]">
      <label className="relative block">
        <span className="sr-only">Search records</span>
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b707a]" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => query && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter" && hits[0]) act(hits[0]);
          }}
          role="combobox"
          aria-expanded={open && !!query.trim()}
          aria-controls="records-search-results"
          placeholder="Find a record: number, office, box…"
          className="h-11 w-full rounded-[10px] border border-[#d4d5d2] bg-white pl-9 pr-9 text-[14px] text-neutral-900 placeholder:text-[#6b707a] focus:border-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              setOpen(false);
            }}
            className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-[#6b707a] hover:text-neutral-900"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        )}
      </label>
      {open && query.trim() && (
        <div
          id="records-search-results"
          role="listbox"
          aria-label="Records found"
          className="absolute right-0 top-[calc(100%+6px)] z-30 max-h-[min(440px,70vh)] w-full overflow-y-auto rounded-[12px] border border-[#e6e6e3] bg-white p-1.5 shadow-[0_18px_40px_-20px_rgba(22,24,29,0.35)] sm:w-[440px]"
        >
          {hits.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-[#5b606b]">No record matches “{query.trim()}”.</p>
          ) : (
            hits.map((hit) => (
              <button
                key={`${hit.doc.type}-${hit.doc.id}`}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => act(hit)}
                className="flex w-full items-start gap-3 rounded-[8px] px-2.5 py-2 text-left hover:bg-[#fafaf9] focus-visible:bg-[#fafaf9] focus-visible:outline-none"
              >
                <span aria-hidden="true" className={cn("mt-1 h-8 w-1 shrink-0 rounded-full", docTone(hit.doc.type))} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-['Geist_Mono',ui-monospace,monospace] text-[12.5px] text-neutral-900">{hit.doc.number}</span>
                    <span className="shrink-0 text-[11.5px] text-[#6b707a]">{DOC_TYPES[hit.doc.type].short}</span>
                  </span>
                  <span className="block truncate text-[13px] text-neutral-900">{hit.doc.title || "—"}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-[#5b606b]">
                    {hit.kind === "placed" ? (
                      <>
                        <Crosshair aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{placeText(hit.placement)}</span>
                        <span className="ml-auto shrink-0 font-medium text-[#a6323b]">Locate</span>
                      </>
                    ) : hit.kind === "unplaced" ? (
                      <>
                        <Archive aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                        Unplaced
                        {canManage && <span className="ml-auto shrink-0 font-medium text-[#a6323b]">Place record</span>}
                      </>
                    ) : (
                      <>
                        <StatusBadge status={hit.doc.status as DocumentStatus} />
                        <span>not filed until approved</span>
                        <ArrowUpRight aria-hidden="true" className="ml-auto h-3.5 w-3.5 shrink-0" />
                      </>
                    )}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
