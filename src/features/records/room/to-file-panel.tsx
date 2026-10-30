import * as React from "react";
import { ArrowUpRight, Archive, PanelRightClose, Search } from "lucide-react";

import { Button, StatusBadge, type DocumentStatus } from "@/components";
import { docTone, formatDate } from "@/features/records/components/room/room-format";
import { DocThumbnail } from "@/features/records/room/doc-thumbnail";
import { docKey, type CatalogDoc } from "@/features/records/room/room-model";
import { DOC_TYPES, type DocType } from "@/features/records/shelf-types";
import { cn } from "@/lib/utils";

/**
 * What is left to file, beside the room (30 Oct 2026). Two lists, kept
 * apart: Unplaced — approved, and in no box yet — and Awaiting approval —
 * forms that cannot be filed until they are approved, shown so nobody looks
 * for them on a shelf. A record is chosen here and placed with Place record;
 * on a desktop it can also be dragged onto a shelf or a box, which still asks
 * before anything is saved.
 */
export function ToFilePanel({
  unplaced,
  awaiting,
  canManage,
  selectedKey,
  onSelect,
  onPlace,
  onOpen,
  onDragChange,
  onCollapse,
}: {
  unplaced: CatalogDoc[];
  awaiting: CatalogDoc[];
  canManage: boolean;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  onPlace: (doc: CatalogDoc) => void;
  onOpen: (doc: CatalogDoc) => void;
  onDragChange: (dragging: boolean) => void;
  /** Desktop only: fold the panel to the side. */
  onCollapse?: () => void;
}) {
  const [list, setList] = React.useState<"unplaced" | "awaiting">("unplaced");
  const [kind, setKind] = React.useState<DocType | "all">("all");
  const [query, setQuery] = React.useState("");

  const source = list === "unplaced" ? unplaced : awaiting;
  const q = query.trim().toLowerCase();
  const shown = source.filter(
    (d) => (kind === "all" || d.type === kind) && (!q || `${d.number} ${d.title}`.toLowerCase().includes(q)),
  );

  return (
    <section aria-labelledby="to-file-title" className="flex h-full min-h-0 flex-col rounded-[14px] border border-[#e6e6e3] bg-white">
      <div className="flex items-start justify-between gap-2 px-4 pb-2 pt-4">
        <div>
          <h2 id="to-file-title" className="text-[15px] font-semibold text-neutral-900">
            To file
          </h2>
          <p className="mt-0.5 text-[12.5px] text-[#5b606b]">Approved records go in a box once they are placed.</p>
        </div>
        {onCollapse && (
          <button
            type="button"
            aria-label="Hide the list of records to file"
            onClick={onCollapse}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#5b606b] hover:bg-[#f4f4f2] hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a6323b]"
          >
            <PanelRightClose aria-hidden="true" className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="px-4">
        <div role="tablist" aria-label="Records to file" className="grid grid-cols-2 gap-1 rounded-[10px] bg-[#f4f4f2] p-1">
          {(
            [
              ["unplaced", "Unplaced", unplaced.length],
              ["awaiting", "Awaiting approval", awaiting.length],
            ] as const
          ).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={list === value}
              onClick={() => {
                setList(value);
                onSelect(null);
              }}
              className={cn(
                "min-h-10 rounded-[8px] px-2 text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a6323b]",
                list === value ? "bg-white font-medium text-neutral-900 shadow-sm" : "text-[#5b606b] hover:text-neutral-900",
              )}
            >
              {label} <span className="tabular-nums text-[#6b707a]">{count}</span>
            </button>
          ))}
        </div>
        <label className="relative mt-3 block">
          <span className="sr-only">Filter the list</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b707a]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Number or office"
            className="h-10 w-full rounded-[10px] border border-[#d4d5d2] bg-white pl-9 pr-3 text-[13.5px] text-neutral-900 placeholder:text-[#6b707a] focus:border-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
          />
        </label>
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Kind of document">
          {(["all", "RDS", "RIA", "RAD"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a6323b]",
                kind === k ? "border-neutral-900 bg-neutral-900 text-white" : "border-[#e6e6e3] text-[#4a4f59] hover:border-[#cfcfcb]",
              )}
            >
              {k !== "all" && <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", docTone(k))} />}
              {k === "all" ? "All" : DOC_TYPES[k].short}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-3 min-h-0 flex-1 list-none space-y-2 overflow-y-auto px-4 pb-4">
        {shown.length === 0 && (
          <li className="rounded-[10px] border border-dashed border-[#e0dcd3] px-4 py-8 text-center text-[13px] text-[#5b606b]">
            {source.length === 0
              ? list === "unplaced"
                ? "Every approved record is in a box."
                : "No record is waiting for approval."
              : "Nothing matches."}
          </li>
        )}
        {shown.map((d) => {
          const key = docKey(d.type, d.id);
          const selected = key === selectedKey;
          const placeable = list === "unplaced" && canManage;
          return (
            <li key={key}>
              <div
                draggable={placeable}
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-record", key);
                  e.dataTransfer.effectAllowed = "move";
                  onDragChange(true);
                }}
                onDragEnd={() => onDragChange(false)}
                className={cn(
                  "rounded-[10px] border transition-colors",
                  selected ? "border-neutral-900 bg-[#fafaf9]" : "border-[#ececea] hover:border-[#d9d9d6]",
                  placeable && "cursor-grab active:cursor-grabbing",
                )}
              >
                <button
                  type="button"
                  aria-expanded={selected}
                  onClick={() => onSelect(selected ? null : key)}
                  className="flex min-h-11 w-full items-start gap-3 rounded-[10px] px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a6323b]"
                >
                  <span aria-hidden="true" className={cn("mt-0.5 h-10 w-1.5 shrink-0 rounded-full", docTone(d.type))} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-['Geist_Mono',ui-monospace,monospace] text-[12.5px] text-neutral-900">{d.number}</span>
                    <span className="block truncate text-[13.5px] text-neutral-900">{d.title || "—"}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-[#5b606b]">
                      {DOC_TYPES[d.type].short} · {formatDate(d.date)}
                      {list === "awaiting" && <StatusBadge status={d.status as DocumentStatus} />}
                    </span>
                  </span>
                </button>
                {selected && (
                  <div className="flex gap-3 border-t border-[#ececea] px-3 pb-3 pt-3">
                    <DocThumbnail type={d.type} id={d.id} width={d.type === "RIA" ? 128 : 92} />
                    <div className="flex min-w-0 flex-1 flex-col justify-end gap-2">
                      {list === "unplaced" ? (
                        canManage ? (
                          <Button onClick={() => onPlace(d)} className="w-full">
                            <Archive />
                            Place record
                          </Button>
                        ) : (
                          <p className="text-[12px] text-[#5b606b]">An Administrator places it in a box.</p>
                        )
                      ) : (
                        <p className="text-[12px] text-[#5b606b]">It can be placed once it is approved.</p>
                      )}
                      <Button variant="secondary" onClick={() => onOpen(d)} className="w-full">
                        Open
                        <ArrowUpRight />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
