import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useReducedMotion } from "motion/react";
import { Archive, ArrowLeft, Layers, Plus, Trash2 } from "lucide-react";

import {
  Button,
  ConfirmationModal,
  ContainerCard,
  DeleteModal,
  EmptyState,
  IconButton,
  Input,
  PageHeader,
  PageTransition,
  SearchBar,
  Skeleton,
  toast,
} from "@/components";
import { useAuth } from "@/features/auth/auth-context";
import { can } from "@/features/auth/types";
import { useRecordsRoom } from "@/features/records/shelf-hooks";
import { createShelf, deleteShelf, updateShelf } from "@/features/records/shelf-api";
import {
  DOC_TYPES,
  POSITIONS_PER_SHELF,
  SLOTS,
  boxName,
  boxYearLine,
  levelName,
  locationOf,
  type BoxContent,
  type DocType,
  type RecordBox,
  type ShelfLevel,
  type ShelfWithLevels,
  type Slot,
} from "@/features/records/shelf-types";
import { BoxDrawer } from "@/features/records/components/room/box-drawer";
import { LocationLine } from "@/features/records/components/room/room-parts";
import { docTone, formatDate, recordCount } from "@/features/records/components/room/room-format";

/**
 * The Records Room: one room, its shelves, and the boxes on them.
 *
 * Every shelf has five levels, A to E, and every level three box positions. A
 * box holds one kind of Records Management document for one year —
 * "Records Disposition Schedule — 2026 — Box 01" — and inside it are the
 * approved documents themselves. Nobody files by hand: when a schedule, an
 * inventory or a disposal request is approved, the database puts it in the
 * current box for its kind and year, making the box (and, if the room is
 * full, a shelf) when there is none (migration 047).
 *
 * So this page is for finding and seeing, not placing: search answers "where
 * is RDS-2026-000003", View Location points at the box, and a box opens to
 * what is in it.
 *
 * The rack is drawn at the proportions of a real one. A level holds three
 * boxes, so a shelf is narrow — it is not stretched to the width of the
 * page — and each level is one row, named for what is on it ("Disposition
 * Schedules", "Available Storage"), with its letter beside the name.
 */

/* ---------------- inline editing ---------------- */

/**
 * Text that edits in place: it reads as the value until you click it.
 *
 * Declared at module level, never inside the components that render it. A
 * component defined inside another remounts its input on every keystroke and
 * the cursor jumps to the end — the fault this module has already had twice,
 * in the appraisal and disposal editors.
 */
function InlineText({
  value,
  placeholder,
  ariaLabel,
  className = "",
  onCommit,
}: {
  value: string;
  placeholder: string;
  ariaLabel: string;
  className?: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);

  const commit = () => {
    const next = draft.trim();
    if (next === value.trim()) return;
    onCommit(next);
  };

  return (
    <input
      aria-label={ariaLabel}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
      className={`w-full rounded-[3px] border border-transparent bg-transparent px-1.5 py-0.5 outline-none transition placeholder:font-normal placeholder:text-neutral-400 hover:border-neutral-300 focus:border-neutral-400 focus:bg-white focus:ring-2 focus:ring-(--accent-ring) ${className}`}
    />
  );
}

/* ---------------- the steel ---------------- */

/**
 * The rack is slotted-angle steel: a grey upright punched with a line of
 * square holes. Drawn as a gradient rather than as elements, so an upright
 * the full height of a tall shelf costs nothing.
 */
function slottedUpright(slot: number, pitch: number): React.CSSProperties {
  return {
    backgroundColor: "#b9bec6",
    // The holes are the palette's neutral-600 (DESIGN.md nav-idle). The build
    // emits that token as #525252 for old Chrome, so it holds on office PCs.
    backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${pitch - slot}px, var(--color-neutral-600) ${pitch - slot}px ${pitch}px)`,
    backgroundSize: `${Math.max(3, Math.round(slot * 0.8))}px 100%`,
    backgroundPosition: "center top",
    backgroundRepeat: "no-repeat",
  };
}

/** The cardboard of an archive box, the same on the tile and on the open shelf. */
const BOX = "border border-[#d9cfc1] bg-[#f4efe8]";

const boxCount = (n: number) => `${n} ${n === 1 ? "box" : "boxes"}`;
const shelfCount = (n: number) => `${n} ${n === 1 ? "shelf" : "shelves"}`;

/**
 * One box on the steel: an archive box with its end facing out — a hand-hole
 * and a label card read straight across: the kind of document, the year and
 * box number, and how many documents are inside.
 */
function BoxCard({
  box,
  count,
  located,
  onOpen,
}: {
  box: RecordBox;
  count: number;
  located: boolean;
  onOpen: () => void;
}) {
  const kind = box.labelOverride?.trim() || DOC_TYPES[box.documentType].short;
  return (
    <button
      type="button"
      id={`box-${box.id}`}
      onClick={onOpen}
      aria-label={`${boxName(box)}, ${recordCount(count)}. Open the box.`}
      title={boxName(box)}
      className={`relative flex h-full w-full min-w-0 flex-col items-center rounded-[3px] p-1 text-left sm:p-1.5 transition hover:border-neutral-500 hover:shadow-[0_2px_6px_rgba(0,0,0,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ring) ${BOX} ${
        located ? "outline outline-[3px] outline-offset-2 outline-[#d97706]" : ""
      }`}
    >
      {located && (
        <span className="absolute -top-2.5 right-2 rounded-[3px] bg-[#d97706] px-1.5 py-px text-[11px] font-semibold uppercase tracking-[0.06em] text-white">
          Here
        </span>
      )}
      {/* The hand-hole. */}
      <span aria-hidden className="h-[5px] w-[30px] shrink-0 rounded-full bg-[#625d55]" />
      <span className="mt-1 block w-full min-w-0 border border-[#e2dbd0] bg-white px-1.5 py-1 sm:px-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden className={`h-[8px] w-[8px] shrink-0 ${docTone(box.documentType)}`} />
          {box.labelOverride?.trim() ? (
            <span className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-neutral-700">
              {kind}
            </span>
          ) : (
            <>
              <span className="truncate text-[11px] font-semibold uppercase tracking-[0.04em] text-neutral-700 md:hidden">
                {box.documentType}
              </span>
              <span className="hidden truncate text-[11px] font-semibold uppercase tracking-[0.04em] text-neutral-700 md:inline">
                {kind}
              </span>
            </>
          )}
        </span>
        {/* Wraps between year and box number on a narrow card rather than
            cutting the box number off; one truncated line from md up. */}
        <span className="mt-0.5 block text-[12px] font-semibold uppercase leading-tight tabular-nums text-neutral-900 md:truncate md:text-[12.5px]">
          {box.year}{" "}
          <span className="whitespace-nowrap">· Box {String(box.sequence).padStart(2, "0")}</span>
        </span>
        <span className="block text-[12px] tabular-nums text-neutral-600">{recordCount(count)}</span>
      </span>
    </button>
  );
}

/** A position with no box in it: present, but quiet. */
function EmptySlot({ slot }: { slot: Slot }) {
  return (
    <div className="flex h-full min-h-[72px] flex-col justify-center rounded-[3px] border border-dashed border-neutral-300 px-3 text-[12px] leading-snug">
      <span className="font-medium text-neutral-500">Box {slot}</span>
      <span className="text-neutral-400">Empty</span>
    </div>
  );
}

/**
 * One level: what it holds, named from the boxes on it, beside its three box
 * positions, with the board they stand on beneath — one row. The letter is the
 * level's fixed place on the steel and stays beside the name, quieter, for
 * anyone walking to "Level B".
 */
function LevelRow({
  level,
  boxAt,
  counts,
  located,
  locatedBox,
  onOpenBox,
}: {
  level: ShelfLevel;
  boxAt: (slot: Slot) => RecordBox | undefined;
  counts: Map<string, number>;
  located: boolean;
  locatedBox: string | null;
  onOpenBox: (box: RecordBox) => void;
}) {
  const standing = SLOTS.map((slot) => boxAt(slot)).filter((b): b is RecordBox => !!b);
  // Named for what is filed here: a box whose documents have all been taken
  // back out of Approved holds nothing, so it does not name the level.
  const filed = standing.filter((b) => (counts.get(b.id) ?? 0) > 0);
  const name = levelName(filed.map((b) => b.documentType));
  return (
    <div id={`level-${level.id}`}>
      {/* One grid: on a phone the name sits above the three boxes; from sm up
          it takes a column of its own at the left, so naming the level
          costs no height. */}
      <div
        className={`grid grid-cols-3 items-stretch gap-1.5 px-2 pb-2 pt-2 shadow-[inset_0_8px_10px_-8px_rgba(0,0,0,0.18)] transition-colors sm:grid-cols-[6.5rem_repeat(3,minmax(0,1fr))] sm:gap-2 sm:px-2.5 sm:pt-2.5 ${
          located ? "bg-[#fef3c7]" : "bg-[#eceef1]"
        }`}
      >
        <div className="col-span-3 flex min-w-0 items-baseline gap-2 px-0.5 sm:col-span-1 sm:flex-col sm:justify-center sm:gap-0.5">
          <span
            className={`text-[11.5px] font-semibold uppercase leading-snug tracking-[0.08em] ${
              filed.length ? "text-neutral-900" : "text-neutral-500"
            }`}
          >
            {name}
          </span>
          <span className="shrink-0 text-[11.5px] text-neutral-500">Level {level.label}</span>
        </div>
        {SLOTS.map((slot) => {
          const box = boxAt(slot);
          return box ? (
            <BoxCard
              key={slot}
              box={box}
              count={counts.get(box.id) ?? 0}
              located={locatedBox === box.id}
              onOpen={() => onOpenBox(box)}
            />
          ) : (
            <EmptySlot key={slot} slot={slot} />
          );
        })}
      </div>
      {/* The board. */}
      <div className="h-[6px] border-t border-[#9aa1ab] bg-[#c4c9d1]" />
    </div>
  );
}

/* ---------------- one shelf ---------------- */

function ShelfCard({
  shelf,
  boxesOnShelf,
  boxAt,
  counts,
  locatedLevel,
  locatedBox,
  onRenameShelf,
  onDeleteShelf,
  onOpenBox,
  canManage,
}: {
  shelf: ShelfWithLevels;
  boxesOnShelf: number;
  boxAt: (levelId: string, slot: Slot) => RecordBox | undefined;
  counts: Map<string, number>;
  locatedLevel: string | null;
  locatedBox: string | null;
  onRenameShelf: (name: string) => void;
  onDeleteShelf: () => void;
  onOpenBox: (box: RecordBox) => void;
  /** Administrators rename and remove shelves; everyone else reads the room. */
  canManage: boolean;
}) {
  return (
    <ContainerCard className="w-full max-w-3xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          {canManage ? (
            <InlineText
              value={shelf.name}
              placeholder="Shelf name"
              ariaLabel="Shelf name"
              className="text-[15px] font-semibold text-neutral-900"
              onCommit={onRenameShelf}
            />
          ) : (
            <div className="truncate px-1.5 text-[15px] font-semibold text-neutral-900">{shelf.name}</div>
          )}
          {shelf.location ? (
            <div className="truncate px-1.5 text-[12.5px] text-neutral-500">{shelf.location}</div>
          ) : null}
        </div>
        <span className="shrink-0 text-[12.5px] tabular-nums text-neutral-600">
          {boxesOnShelf} of {POSITIONS_PER_SHELF} boxes occupied
        </span>
        {canManage && (
          <IconButton
            size="icon-sm"
            aria-label={`Remove ${shelf.name}`}
            title={`Remove ${shelf.name}`}
            onClick={onDeleteShelf}
            className="bg-transparent text-neutral-400 hover:text-neutral-900"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        )}
      </div>

      {/* The rack. The slotted uprights run the full height beside the
          levels, which is what makes a stack of boards read as one unit. */}
      <div className="relative border-t border-neutral-200 px-[12px]">
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[12px] border-r border-[#8f959e]"
          style={slottedUpright(5, 18)}
        />
        <span
          aria-hidden
          className="absolute inset-y-0 right-0 w-[12px] border-l border-[#8f959e]"
          style={slottedUpright(5, 18)}
        />
        <div className="relative">
          {shelf.levels.map((level) => (
            <LevelRow
              key={level.id}
              level={level}
              boxAt={(slot) => boxAt(level.id, slot)}
              counts={counts}
              located={locatedLevel === level.id}
              locatedBox={locatedBox}
              onOpenBox={onOpenBox}
            />
          ))}
        </div>
      </div>
    </ContainerCard>
  );
}

/* ---------------- the room, seen from the door ---------------- */

/**
 * One shelf as it looks from across the room: the uprights, five boards, and
 * on each board its two positions — a box in the colour of its document kind,
 * or a faint outline — so free space shows before you walk to it.
 */
function ShelfTile({
  shelf,
  boxesOnShelf,
  boxAt,
  onOpen,
}: {
  shelf: ShelfWithLevels;
  boxesOnShelf: number;
  boxAt: (levelId: string, slot: Slot) => RecordBox | undefined;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${shelf.name}: ${boxesOnShelf} of ${POSITIONS_PER_SHELF} boxes`}
      className="group block w-full text-left focus-visible:outline-none"
    >
      <div className="relative aspect-[6/5] p-[4px] transition group-hover:-translate-y-0.5 group-focus-visible:ring-2 group-focus-visible:ring-(--accent-ring)">
        <div className="relative flex h-full flex-col bg-[#eceef1] px-[8px]">
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-[8px] border-r border-[#8f959e]"
            style={slottedUpright(3, 11)}
          />
          <span
            aria-hidden
            className="absolute inset-y-0 right-0 w-[8px] border-l border-[#8f959e]"
            style={slottedUpright(3, 11)}
          />
          <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-[#8f959e]" />
          <div className="relative flex h-full flex-col pt-[3px]">
            {shelf.levels.map((level) => (
              <div key={level.id} className="flex min-h-0 flex-1 flex-col">
                <div className="grid min-h-0 flex-1 grid-cols-3 items-end gap-[5px] px-[7px] pt-[5px]">
                  {SLOTS.map((slot) => {
                    const box = boxAt(level.id, slot);
                    return box ? (
                      <span key={slot} aria-hidden className={`flex h-[80%] flex-col px-[12%] pb-[5%] ${BOX}`}>
                        <span className="flex-[3]" />
                        <span className={`h-[3px] shrink-0 ${docTone(box.documentType)}`} />
                        <span className="mt-[2px] flex-[4] bg-white" />
                      </span>
                    ) : (
                      <span key={slot} aria-hidden className="h-[80%] border border-dashed border-neutral-300" />
                    );
                  })}
                </div>
                <span aria-hidden className="h-[5px] shrink-0 border-t border-[#9aa1ab] bg-[#c4c9d1]" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-1.5 flex items-baseline justify-between gap-2 px-0.5">
        <span className="truncate text-[14px] font-semibold text-neutral-900 group-hover:underline">
          {shelf.name}
        </span>
        <span className="shrink-0 text-[12.5px] tabular-nums text-neutral-500">
          {boxCount(boxesOnShelf)} · {POSITIONS_PER_SHELF - boxesOnShelf} empty
        </span>
      </div>
    </button>
  );
}

/** The loading state, shaped like what is loading: shelves and the room panel. */
function RoomSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading the Records Room">
      <div className="space-y-2">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-5">
          <Skeleton className="h-9 w-full" />
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-[6/5] w-full rounded-[3px]" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
        </div>
        <Skeleton className="h-56 w-full rounded-lg" />
      </div>
    </div>
  );
}

/* ---------------- page ---------------- */

export function ShelfMapPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = can(user, "manage:records");
  const { shelves, boxes, contents, loading, failed, refresh } = useRecordsRoom();
  const still = useReducedMotion() ?? false;

  // The open shelf lives in the address, so the browser's Back returns to
  // the room rather than leaving it. `level` and `box` are set by View
  // Location, to say which part of the shelf to point at.
  const [searchParams, setSearchParams] = useSearchParams();
  const openShelf = shelves.find((s) => s.id === searchParams.get("shelf")) ?? null;
  const openShelfById = (id: string | null) =>
    setSearchParams(id ? { shelf: id } : {}, { replace: false });

  const [query, setQuery] = React.useState("");
  const [openBoxId, setOpenBoxId] = React.useState<string | null>(null);

  const [newShelfOpen, setNewShelfOpen] = React.useState(false);
  const [newShelfName, setNewShelfName] = React.useState("");
  const [newShelfLocation, setNewShelfLocation] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [shelfToRemove, setShelfToRemove] = React.useState<ShelfWithLevels | null>(null);

  /* ---- derived ---- */

  const boxByPosition = React.useMemo(() => {
    const map = new Map<string, RecordBox>();
    for (const b of boxes) map.set(`${b.shelfLevelId}:${b.slot}`, b);
    return map;
  }, [boxes]);
  const boxAt = (levelId: string, slot: Slot) => boxByPosition.get(`${levelId}:${slot}`);

  const contentsByBox = React.useMemo(() => {
    const map = new Map<string, BoxContent[]>();
    for (const c of contents) {
      const list = map.get(c.boxId);
      if (list) list.push(c);
      else map.set(c.boxId, [c]);
    }
    return map;
  }, [contents]);

  const counts = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const [id, list] of contentsByBox) map.set(id, list.length);
    return map;
  }, [contentsByBox]);

  const boxesOn = (shelf: ShelfWithLevels) =>
    shelf.levels.reduce(
      (sum, level) => sum + SLOTS.filter((slot) => boxAt(level.id, slot)).length,
      0,
    );

  const boxById = (id: string) => boxes.find((b) => b.id === id);
  const openBox = openBoxId ? (boxById(openBoxId) ?? null) : null;

  const totalPositions = shelves.length * POSITIONS_PER_SHELF;
  const perType = (t: DocType) => contents.filter((c) => c.documentType === t).length;

  /* ---- search: across the documents actually in boxes ---- */

  const q = query.trim().toLowerCase();
  const results = React.useMemo(() => {
    if (!q) return [];
    return contents.filter((c) => {
      const box = boxes.find((b) => b.id === c.boxId);
      const location = locationOf(box, shelves);
      return [
        c.documentNo,
        c.agency,
        DOC_TYPES[c.documentType].name,
        c.documentType,
        box ? boxName(box) : "",
        box ? String(box.year) : "",
        location?.text ?? "",
      ].some((v) => v.toLowerCase().includes(q));
    });
  }, [contents, boxes, shelves, q]);

  /* ---- view location ---- */

  // Pointed at from the address so it survives the shelf opening, and so the
  // document pages can link here: the level is scrolled to and tinted, and
  // the box outlined with a "Here" tag, for a few seconds.
  const flashLevel = searchParams.get("level");
  const flashBox = searchParams.get("box");
  const [flash, setFlash] = React.useState<{ level: string | null; box: string | null }>({
    level: null,
    box: null,
  });

  React.useEffect(() => {
    if (!openShelf || (!flashLevel && !flashBox)) return;
    setFlash({ level: flashLevel, box: flashBox });
    document
      .getElementById(`level-${flashLevel}`)
      ?.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
    const t = window.setTimeout(() => {
      setFlash({ level: null, box: null });
      setSearchParams({ shelf: openShelf.id }, { replace: true });
    }, 4500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openShelf?.id, flashLevel, flashBox]);

  const viewLocation = (box: RecordBox | undefined) => {
    const location = locationOf(box, shelves);
    if (!box || !location) return;
    setQuery("");
    setOpenBoxId(null);
    setSearchParams(
      { shelf: location.shelfId, level: location.levelId, box: box.id },
      { replace: false },
    );
  };

  const viewRecord = (c: BoxContent) => {
    setOpenBoxId(null);
    navigate(DOC_TYPES[c.documentType].route(c.sourceId));
  };

  /* ---- writes ---- */

  const run = async (work: () => Promise<void>, failure: string) => {
    try {
      await work();
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : failure);
    }
  };

  const addShelf = async () => {
    setSaving(true);
    try {
      await createShelf(
        { name: newShelfName, location: newShelfLocation },
        shelves.reduce((max, s) => Math.max(max, s.position + 1), 0),
      );
      await refresh();
      setNewShelfOpen(false);
      setNewShelfName("");
      setNewShelfLocation("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to add the shelf");
    }
    setSaving(false);
  };

  if (loading) return <RoomSkeleton />;

  return (
    <>
      <PageTransition className="space-y-5">
        <PageHeader
          title="Records Room"
          description="Approved Records Management documents, filed automatically into boxes — five levels to a shelf, three boxes to a level."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" onClick={() => navigate("/records")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Schedules
              </Button>
              {canManage && (
                <Button onClick={() => setNewShelfOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Shelf
                </Button>
              )}
            </div>
          }
        />

        {failed && shelves.length === 0 ? (
          <ContainerCard padded>
            <div className="flex items-center justify-between gap-3 text-[13px] text-neutral-700">
              The Records Room could not be loaded.
              <Button variant="outline" size="sm" onClick={() => void refresh()}>
                Try again
              </Button>
            </div>
          </ContainerCard>
        ) : shelves.length === 0 ? (
          <ContainerCard padded>
            <EmptyState
              icon={Layers}
              title="The room has no shelves yet"
              description={
                canManage
                  ? "The first approved disposition schedule, inventory or disposal request brings a shelf with it. You can also add one now."
                  : "The first approved disposition schedule, inventory or disposal request brings a shelf with it."
              }
              action={canManage ? { label: "Add Shelf", onClick: () => setNewShelfOpen(true) } : undefined}
            />
          </ContainerCard>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="min-w-0 space-y-5">
              <div className="space-y-3">
                <SearchBar
                  placeholder="Find a filed document — number, agency, document type or box"
                  widthClassName="w-full"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />

                {q ? (
                  <ContainerCard className="overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3">
                      <h2 className="text-[13.5px] font-semibold text-neutral-900">
                        {results.length} filed {results.length === 1 ? "document" : "documents"}{" "}
                        found
                      </h2>
                      <Button variant="ghost" size="sm" onClick={() => setQuery("")}>
                        Clear
                      </Button>
                    </div>
                    {results.length === 0 ? (
                      <p className="border-t border-neutral-200 px-4 py-4 text-[12.5px] text-neutral-500">
                        No filed document matches “{query.trim()}”. Documents are filed here once
                        they are Approved.
                      </p>
                    ) : (
                      <ul className="divide-y divide-neutral-200 border-t border-neutral-200">
                        {results.slice(0, 100).map((c) => {
                          const box = boxById(c.boxId);
                          return (
                            <li
                              key={c.id}
                              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="text-[13.5px] font-semibold tabular-nums text-neutral-900">
                                  {c.documentNo}
                                </div>
                                {/* Where it is — the answer the search is for. */}
                                <LocationLine
                                  location={locationOf(box, shelves)}
                                  className="mt-0.5 text-[13.5px]"
                                />
                                <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-neutral-500">
                                  <span
                                    aria-hidden
                                    className={`h-[8px] w-[8px] shrink-0 ${docTone(c.documentType)}`}
                                  />
                                  <span className="truncate" title={`${DOC_TYPES[c.documentType].name} · ${c.agency}`}>
                                    {box ? `${c.documentType} ${boxYearLine(box)}` : c.documentType} ·{" "}
                                    {DOC_TYPES[c.documentType].name} · {c.agency} ·{" "}
                                    {formatDate(c.date)}
                                  </span>
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5">
                                <Button variant="ghost" size="sm" onClick={() => viewRecord(c)}>
                                  View Record
                                </Button>
                                <Button size="sm" onClick={() => viewLocation(box)}>
                                  View Location
                                </Button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {results.length > 100 && (
                      <p className="border-t border-neutral-200 px-4 py-2.5 text-[12px] text-neutral-500">
                        Showing the first 100. Add more to the search to narrow it.
                      </p>
                    )}
                  </ContainerCard>
                ) : null}
              </div>

              {!openShelf ? (
                <div className="grid grid-cols-1 content-start gap-6 sm:grid-cols-2 xl:grid-cols-3">
                  {shelves.map((shelf) => (
                    <ShelfTile
                      key={shelf.id}
                      shelf={shelf}
                      boxesOnShelf={boxesOn(shelf)}
                      boxAt={boxAt}
                      onOpen={() => openShelfById(shelf.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="min-w-0 space-y-3">
                  <Button variant="ghost" size="sm" onClick={() => openShelfById(null)}>
                    <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                    All shelves
                  </Button>
                  <ShelfCard
                    key={openShelf.id}
                    shelf={openShelf}
                    boxesOnShelf={boxesOn(openShelf)}
                    boxAt={boxAt}
                    counts={counts}
                    locatedLevel={flash.level}
                    locatedBox={flash.box}
                    onRenameShelf={(name) =>
                      void run(
                        () => updateShelf(openShelf.id, { name, location: openShelf.location }),
                        "Unable to rename the shelf",
                      )
                    }
                    onDeleteShelf={() => setShelfToRemove(openShelf)}
                    onOpenBox={(b) => setOpenBoxId(b.id)}
                    canManage={canManage}
                  />
                </div>
              )}
            </div>

            {/* The room at a glance: how much of it is used, and by what. */}
            <ContainerCard className="h-fit overflow-hidden lg:sticky lg:top-4">
              <div className="px-4 pb-3 pt-3.5">
                <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
                  The room
                </h2>
                <p className="mt-1 text-[12.5px] text-neutral-500">
                  Approved Records Management documents are filed automatically.
                </p>
              </div>
              <div className="border-t border-neutral-200 px-4 py-3">
                <div className="text-[13px] text-neutral-700">{shelfCount(shelves.length)}</div>
                <div className="mt-1 text-[20px] font-semibold leading-tight tabular-nums text-neutral-900">
                  {boxes.length} / {totalPositions}
                  <span className="ml-1.5 text-[13px] font-normal text-neutral-600">
                    box positions used
                  </span>
                </div>
                <div className="mt-0.5 text-[12.5px] tabular-nums text-neutral-500">
                  {Math.max(0, totalPositions - boxes.length)}{" "}
                  {totalPositions - boxes.length === 1 ? "position" : "positions"} available
                </div>
              </div>
              <div className="border-t border-neutral-200 px-4 py-3">
                <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
                  Filed documents
                </div>
                <ul className="mt-1.5 space-y-1 text-[13px]">
                  {(Object.keys(DOC_TYPES) as DocType[]).map((t) => (
                    <li key={t} className="flex items-center gap-2">
                      <span aria-hidden className={`h-[8px] w-[8px] shrink-0 ${docTone(t)}`} />
                      <span className="flex-1 truncate text-neutral-700">{DOC_TYPES[t].short}</span>
                      <span className="tabular-nums text-neutral-900">{perType(t)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </ContainerCard>
          </div>
        )}
      </PageTransition>

      <BoxDrawer
        box={openBox}
        location={locationOf(openBox ?? undefined, shelves)}
        contents={openBox ? (contentsByBox.get(openBox.id) ?? []) : []}
        shelves={shelves}
        boxes={boxes}
        onOpenChange={(open) => !open && setOpenBoxId(null)}
        onViewRecord={viewRecord}
        onViewLocation={() => viewLocation(openBox ?? undefined)}
        onChanged={() => void refresh()}
        canManage={canManage}
      />

      <ConfirmationModal
        open={newShelfOpen}
        onOpenChange={setNewShelfOpen}
        title="Add a shelf"
        description="It comes with levels A to E, three box positions each. Name it the way the office already refers to it."
        icon={Archive}
        confirmLabel="Add Shelf"
        loading={saving}
        onConfirm={() => void addShelf()}
      >
        <div className="mt-4 space-y-3 text-left">
          <Input
            aria-label="Shelf name"
            placeholder={`Shelf ${shelves.length + 1}`}
            value={newShelfName}
            onChange={(e) => setNewShelfName(e.target.value)}
          />
          <Input
            aria-label="Where the shelf stands"
            placeholder="Where it stands (optional)"
            value={newShelfLocation}
            onChange={(e) => setNewShelfLocation(e.target.value)}
          />
        </div>
      </ConfirmationModal>

      <DeleteModal
        open={shelfToRemove !== null}
        onOpenChange={(open) => !open && setShelfToRemove(null)}
        title={shelfToRemove ? `Remove ${shelfToRemove.name}?` : "Remove this shelf?"}
        description={
          shelfToRemove && boxesOn(shelfToRemove) > 0
            ? `${boxCount(boxesOn(shelfToRemove))} still ${boxesOn(shelfToRemove) === 1 ? "stands" : "stand"} on this shelf. Move ${boxesOn(shelfToRemove) === 1 ? "it" : "them"} to another shelf first — a shelf holding boxes cannot be removed.`
            : "The empty shelf and its five levels are removed."
        }
        onConfirm={() => {
          const shelf = shelfToRemove;
          setShelfToRemove(null);
          if (!shelf) return;
          void run(async () => {
            await deleteShelf(shelf.id);
            openShelfById(null);
          }, "Unable to remove the shelf");
        }}
      />
    </>
  );
}
