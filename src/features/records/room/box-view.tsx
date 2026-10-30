import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRightLeft, FileText, Plus } from "lucide-react";

import { Button } from "@/components";
import { docTone, formatDate } from "@/features/records/components/room/room-format";
import { useCalmMotion } from "@/features/records/room/calm-motion";
import { DocThumbnail } from "@/features/records/room/doc-thumbnail";
import { InlineName } from "@/features/records/room/inline-name";
import { docKey, type CatalogDoc, type RoomLevel, type RoomModel, type RoomPosition, type RoomShelf } from "@/features/records/room/room-model";
import { DOC_TYPES, type BoxContent } from "@/features/records/shelf-types";
import { cn } from "@/lib/utils";

/**
 * An open box, seen from above: the records in it stand as folders, side by
 * side, to browse with the wheel or a trackpad, by dragging, by swiping, or
 * with the arrow keys. The folder in focus rises and its first page and
 * details float above the row; opening it leads to the document's own page,
 * where it is printed and worked on. Its lid lifts as it opens.
 *
 * Kept light for the office PCs (30 Oct 2026): the folders rise with a CSS
 * transform rather than a spring each, only the record just placed drops in
 * with motion, and on a low-power computer the lid and the drop are left out.
 */
export function BoxView({
  model,
  shelf,
  level,
  position,
  activeKey,
  justPlacedKey,
  canManage,
  onBack,
  onActiveChange,
  onOpenDoc,
  onMove,
  onRenameBox,
  onPlaceHere,
}: {
  model: RoomModel;
  shelf: RoomShelf;
  level: RoomLevel;
  position: RoomPosition;
  /** The record the address points to: a search found it, or it was just placed. */
  activeKey: string | null;
  justPlacedKey: string | null;
  canManage: boolean;
  onBack: () => void;
  onActiveChange: (key: string) => void;
  onOpenDoc: (content: BoxContent) => void;
  onMove: (content: BoxContent) => void;
  onRenameBox: (name: string) => Promise<void>;
  onPlaceHere: () => void;
}) {
  const reduce = useCalmMotion();
  const items = position.items;
  const keys = items.map((c) => docKey(c.documentType, c.sourceId));
  const [hoverKey, setHoverKey] = React.useState<string | null>(null);
  const shownKey = (hoverKey && keys.includes(hoverKey) ? hoverKey : null) ?? (activeKey && keys.includes(activeKey) ? activeKey : null) ?? keys[0] ?? null;
  const shown = items.find((c) => docKey(c.documentType, c.sourceId) === shownKey);
  const track = React.useRef<HTMLDivElement>(null);
  const hoverTimer = React.useRef<number | undefined>(undefined);

  // The wheel and the trackpad scroll the row sideways.
  React.useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // A located or just-placed record is brought into view.
  React.useEffect(() => {
    if (!activeKey) return;
    const el = track.current?.querySelector<HTMLElement>(`[data-doc="${CSS.escape(activeKey)}"]`);
    el?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", inline: "center", block: "nearest" });
  }, [activeKey, reduce]);

  // Dragging the row with the mouse; touch scrolls natively.
  const drag = React.useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !track.current) return;
    drag.current = { x: e.clientX, left: track.current.scrollLeft, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !track.current) return;
    if (Math.abs(e.clientX - d.x) > 4) d.moved = true;
    if (d.moved) track.current.scrollLeft = d.left - (e.clientX - d.x);
  };
  const endDrag = () => {
    window.setTimeout(() => (drag.current = null), 0);
  };

  const hover = (key: string | null) => {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setHoverKey(key), key ? 60 : 160);
  };

  const focusAt = (i: number) => {
    const key = keys[Math.max(0, Math.min(keys.length - 1, i))];
    if (!key) return;
    onActiveChange(key);
    setHoverKey(null);
    track.current?.querySelector<HTMLElement>(`[data-doc="${CSS.escape(key)}"]`)?.focus();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" onClick={onBack} className="shrink-0">
            <ArrowLeft />
            {shelf.shelf.name}
          </Button>
          <span aria-hidden="true" className="h-5 w-px bg-[#e6e6e3]" />
          <h2 className="min-w-0 text-[18px] font-semibold tracking-[-0.01em] text-neutral-900">
            <InlineName value={position.name} placeholder={`Box ${position.slot}`} label="box" canEdit={canManage} onSave={onRenameBox} />
          </h2>
        </div>
        <p className="text-[12.5px] text-[#5b606b]">
          {shelf.shelf.name} › {level.title} › Box {position.slot} · {items.length} {items.length === 1 ? "record" : "records"}
        </p>
      </div>

      <div className="relative rounded-[16px] border border-[#cdbb9a] bg-[#e9dcc4] p-2.5 [perspective:1400px] sm:p-3.5">
        {/* The lid lifts as the box opens. */}
        {!reduce && (
          <motion.div
            aria-hidden="true"
            initial={{ rotateX: 0, opacity: 1 }}
            animate={{ rotateX: -96, opacity: 0 }}
            transition={{ duration: 0.5, delay: 0.12, ease: [0.2, 0.8, 0.2, 1] }}
            style={{ transformOrigin: "top center" }}
            className="pointer-events-none absolute inset-0 z-20 rounded-[16px] border border-[#cdbb9a] bg-[#e2d3b6]"
          />
        )}
        <div className="rounded-[11px] bg-[#f3eadb] p-3 shadow-[inset_0_8px_18px_rgba(80,60,30,0.16)] sm:p-4">
          {items.length === 0 ? (
            <div className="grid min-h-[260px] place-items-center text-center">
              <div>
                <p className="text-[15px] font-medium text-neutral-900">This box is empty</p>
                <p className="mt-1 text-[13px] text-[#5b606b]">Approved records waiting in Unplaced can be placed here.</p>
                {canManage && (
                  <Button className="mt-4" onClick={onPlaceHere}>
                    <Plus />
                    Place a record here
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="min-h-[278px]" aria-live="polite">
                <AnimatePresence mode="wait" initial={false}>
                  {shown && (
                    <motion.div
                      key={docKey(shown.documentType, shown.sourceId)}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: reduce ? 0 : 0.14 }}
                    >
                      <Preview
                        content={shown}
                        doc={model.catalog.get(docKey(shown.documentType, shown.sourceId))}
                        boxNames={model.boxNames}
                        canManage={canManage}
                        onOpen={() => onOpenDoc(shown)}
                        onMove={() => onMove(shown)}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div
                ref={track}
                role="list"
                aria-label={`Records in ${position.name}`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onPointerLeave={() => {
                  endDrag();
                  hover(null);
                }}
                className="mt-4 flex snap-x gap-3 overflow-x-auto px-1 pb-3 pt-6 [scrollbar-width:thin]"
              >
                {items.map((c, i) => {
                  const key = docKey(c.documentType, c.sourceId);
                  const active = key === shownKey;
                  return (
                    <div key={key} role="listitem" className="snap-center">
                      <button
                        type="button"
                        data-doc={key}
                        onPointerEnter={(e) => e.pointerType === "mouse" && hover(key)}
                        onFocus={() => setHoverKey(key)}
                        onClick={(e) => {
                          if (drag.current?.moved) return;
                          // A tap brings a folder up first; a click on the one shown opens it.
                          if (!active && (e.nativeEvent as PointerEvent).pointerType === "touch") {
                            onActiveChange(key);
                            return;
                          }
                          onOpenDoc(c);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowRight") {
                            e.preventDefault();
                            focusAt(i + 1);
                          } else if (e.key === "ArrowLeft") {
                            e.preventDefault();
                            focusAt(i - 1);
                          }
                        }}
                        aria-label={`${c.documentNo}, ${DOC_TYPES[c.documentType].short}, ${c.agency}. Open document.`}
                        className={cn(
                          "relative block h-[152px] w-[118px] text-left transition-transform duration-200 ease-out focus-visible:outline-none motion-reduce:transition-none",
                          active && "z-10 -translate-y-3.5",
                        )}
                      >
                        {key === justPlacedKey && !reduce ? (
                          <motion.span
                            className="absolute inset-0"
                            initial={{ y: -90, opacity: 0, rotate: -3 }}
                            animate={{ y: 0, opacity: 1, rotate: 0 }}
                            transition={{ type: "spring", stiffness: 420, damping: 30 }}
                          >
                            <Folder content={c} active={active} />
                          </motion.span>
                        ) : (
                          <Folder content={c} active={active} />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
              <p className="px-1 text-[12px] text-[#6b707a]">
                Scroll, drag or use the arrow keys to browse. Click a folder to open the document.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** A manila folder standing in the box, with its tab and the colour of its kind. */
function Folder({ content, active }: { content: BoxContent; active: boolean }) {
  return (
    <span
      className={cn(
        "absolute inset-0 rounded-[3px] rounded-tl-none border bg-[#f6e8c3]",
        active ? "border-[#b8964f] ring-2 ring-[#a6323b] ring-offset-2 ring-offset-[#f3eadb]" : "border-[#dcc58e]",
      )}
    >
      {/* The tab, with the document's number. */}
      <span className="absolute -top-[15px] left-[-1px] flex h-[16px] w-[78%] items-center rounded-t-[5px] border border-b-0 border-[#dcc58e] bg-[#f3e2b4] px-1.5 font-['Geist_Mono',ui-monospace,monospace] text-[9.5px] text-[#5a4a24]">
        <span className="truncate">{content.documentNo.replace(/^[A-Z]+-/, "")}</span>
      </span>
      <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-[4px]", docTone(content.documentType))} />
      <span className="absolute inset-x-2.5 top-3 block">
        <span className="block text-[10.5px] font-medium uppercase tracking-[0.06em] text-[#6b5a2e]">{content.documentType}</span>
        <span className="mt-1 line-clamp-4 block text-[12px] leading-snug text-[#2d2614]">{content.agency || "—"}</span>
      </span>
      <span className="absolute inset-x-2.5 bottom-2 block text-[11px] tabular-nums text-[#6b5a2e]">{formatDate(content.date)}</span>
    </span>
  );
}

/** The floating card over the row: the record's first page, what it is, where it has been. */
function Preview({
  content,
  doc,
  boxNames,
  canManage,
  onOpen,
  onMove,
}: {
  content: BoxContent;
  doc?: CatalogDoc;
  boxNames: Map<string, string>;
  canManage: boolean;
  onOpen: () => void;
  onMove: () => void;
}) {
  const landscape = content.documentType === "RIA";
  return (
    <div className="flex flex-col gap-4 rounded-[12px] border border-[#e6e6e3] bg-white p-3.5 sm:flex-row">
      <div className="shrink-0 self-center sm:self-start">
        <DocThumbnail type={content.documentType} id={content.sourceId} width={landscape ? 232 : 164} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[12px] text-[#5b606b]">
          <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", docTone(content.documentType))} />
          {DOC_TYPES[content.documentType].name}
        </div>
        <div className="mt-1 font-['Geist_Mono',ui-monospace,monospace] text-[15px] font-semibold text-neutral-900">{content.documentNo}</div>
        <div className="mt-0.5 text-[14px] text-neutral-900">{content.agency || "—"}</div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
          <div>
            <dt className="text-[#6b707a]">Date</dt>
            <dd className="text-neutral-900">{formatDate(content.date)}</dd>
          </div>
          <div>
            <dt className="text-[#6b707a]">Status</dt>
            <dd className="text-neutral-900">{doc?.status ?? "Approved"}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-[#6b707a]">Placed</dt>
            <dd className="text-neutral-900">
              {formatDate(content.filedAt)}
              {content.filedBy ? ` by ${content.filedBy}` : ""}
            </dd>
          </div>
        </dl>
        {content.moves.length > 0 && (
          <div className="mt-2.5">
            <div className="text-[12px] text-[#6b707a]">Moves</div>
            <ul className="mt-0.5 list-none space-y-0.5 text-[12px] text-[#4a4f59]">
              {[...content.moves].reverse().slice(0, 3).map((m, i) => (
                <li key={i}>
                  {formatDate(m.at)}: {boxNames.get(m.fromBoxId) ?? "another box"} → {boxNames.get(m.toBoxId) ?? "this box"}
                  {m.by ? ` · ${m.by}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-3.5 flex flex-wrap gap-2">
          <Button onClick={onOpen}>
            <FileText />
            Open document
          </Button>
          {/* Only an approved record is moved, as only an approved one is placed (placeRecordDocument). */}
          {canManage && (!doc || doc.status === "Approved") && (
            <Button variant="secondary" onClick={onMove}>
              <ArrowRightLeft />
              Move to another box
            </Button>
          )}
        </div>
        {doc && doc.status !== "Approved" && (
          <p className="mt-2 text-[12.5px] text-[#5b606b]">
            {doc.status === "Cancelled" ? "Voided: it stays here, marked voided, and is not moved." : `${doc.status}: it is moved only while it is approved.`}
          </p>
        )}
      </div>
    </div>
  );
}
