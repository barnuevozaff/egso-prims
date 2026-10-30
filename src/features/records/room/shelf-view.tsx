import * as React from "react";
import { motion } from "motion/react";
import { ArrowLeft, Trash2 } from "lucide-react";

import { Button } from "@/components";
import { kindsIn, type RoomPosition, type RoomShelf } from "@/features/records/room/room-model";
import { ArchiveBox, EmptyPosition, ShelfBoard } from "@/features/records/room/archive-box";
import { InlineName } from "@/features/records/room/inline-name";
import { cn } from "@/lib/utils";

/**
 * One shelf, close up: its five levels, each with its name and its two box
 * positions. The drawing shares its layout id with the shelf's card in the
 * overview, so opening a shelf is one continuous zoom. A box shares its own
 * with the open box, which grows out of it.
 *
 * When a record is being placed, or dragged in from the Unplaced list, the
 * positions it can go to say "Place here"; dropping one still asks first.
 */
export function ShelfView({
  shelf,
  canManage,
  highlightKey,
  placing,
  onBack,
  onOpenBox,
  onPlaceAt,
  onRenameShelf,
  onRenameLevel,
  onDeleteShelf,
}: {
  shelf: RoomShelf;
  canManage: boolean;
  /** A position to draw the eye to: the one a search is about to open. */
  highlightKey?: string | null;
  /** A record is on its way in: empty and used positions both take it. */
  placing: boolean;
  onBack: () => void;
  onOpenBox: (position: RoomPosition) => void;
  /** Dropped on, or chosen while placing: open the placing dialog at this position. */
  onPlaceAt: (position: RoomPosition, recordKey?: string) => void;
  onRenameShelf: (name: string) => Promise<void>;
  onRenameLevel: (levelId: string, name: string) => Promise<void>;
  onDeleteShelf: () => void;
}) {
  const positions = shelf.levels.reduce((n, l) => n + l.positions.filter((p) => !p.legacy).length, 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" onClick={onBack} className="shrink-0">
            <ArrowLeft />
            All shelves
          </Button>
          <span aria-hidden="true" className="h-5 w-px bg-[#e6e6e3]" />
          <h2 className="min-w-0 text-[18px] font-semibold tracking-[-0.01em] text-neutral-900">
            <InlineName value={shelf.shelf.name} label="shelf" required canEdit={canManage} onSave={onRenameShelf} />
          </h2>
        </div>
        <div className="flex items-center gap-3 text-[12.5px] text-[#5b606b]">
          <span className="tabular-nums">
            {shelf.records} {shelf.records === 1 ? "record" : "records"} · {shelf.boxesInUse} of {positions} boxes in use
          </span>
          {canManage && shelf.records === 0 && (
            <Button variant="ghost" onClick={onDeleteShelf} className="text-[#5b606b] hover:text-red-700">
              <Trash2 />
              Remove shelf
            </Button>
          )}
        </div>
      </div>

      <motion.div
        layoutId={`rack-${shelf.shelf.id}`}
        className="relative mx-auto max-w-[920px] rounded-[14px] border border-[#e0dcd3] bg-[#f3f1ec] px-3 pb-4 pt-3 sm:px-5"
      >
        {/* The uprights, so the levels read as one standing shelf. */}
        <span aria-hidden="true" className="absolute inset-y-3 left-1.5 w-[5px] rounded-full bg-[#d8d2c6] sm:left-2.5" />
        <span aria-hidden="true" className="absolute inset-y-3 right-1.5 w-[5px] rounded-full bg-[#d8d2c6] sm:right-2.5" />
        <ol className="list-none space-y-3 px-2 sm:px-3">
          {shelf.levels.map((l) => {
            const levelHighlighted = !!highlightKey && l.positions.some((p) => p.key === highlightKey);
            return (
              <li key={l.level.id}>
                <div
                  className={cn(
                    "grid items-end gap-3 rounded-[10px] px-1 py-1 transition-colors sm:grid-cols-[minmax(0,200px)_1fr] sm:gap-4",
                    levelHighlighted && "bg-[#fcf6f7]",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2 pb-1 sm:flex-col sm:items-start sm:gap-0.5">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white text-[12px] font-semibold text-[#4a4f59] shadow-[0_0_0_1px_#e0dcd3]">
                      {l.level.label}
                    </span>
                    <InlineName
                      value={l.title}
                      placeholder={`Level ${l.level.label}`}
                      label="level"
                      canEdit={canManage}
                      onSave={(name) => onRenameLevel(l.level.id, name)}
                      className="max-w-full"
                      wrap
                      textClassName="text-[13px] font-medium leading-snug text-neutral-900"
                    />
                  </div>
                  <div className={cn("grid gap-3", l.positions.length > 2 ? "grid-cols-3" : "grid-cols-2")}>
                    {l.positions.map((p) => (
                      <PositionButton
                        key={p.key}
                        position={p}
                        levelTitle={l.title}
                        highlighted={p.key === highlightKey}
                        placing={placing && !p.legacy}
                        onOpen={() => (placing && !p.legacy ? onPlaceAt(p) : onOpenBox(p))}
                        onDropRecord={canManage && !p.legacy ? (key) => onPlaceAt(p, key) : undefined}
                      />
                    ))}
                  </div>
                </div>
                <ShelfBoard />
              </li>
            );
          })}
        </ol>
      </motion.div>
    </div>
  );
}

function PositionButton({
  position,
  levelTitle,
  highlighted,
  placing,
  onOpen,
  onDropRecord,
}: {
  position: RoomPosition;
  levelTitle: string;
  highlighted: boolean;
  placing: boolean;
  onOpen: () => void;
  onDropRecord?: (recordKey: string) => void;
}) {
  const [over, setOver] = React.useState(false);
  const count = position.items.length;
  const label = `${position.name}, ${levelTitle}: ${count === 0 ? "empty" : `${count} ${count === 1 ? "record" : "records"}`}${position.legacy ? ", old third position" : ""}. ${placing ? "Place the record here." : "Open box."}`;
  return (
    <motion.button
      type="button"
      layoutId={`box-${position.key}`}
      onClick={onOpen}
      onDragOver={(e) => {
        if (!onDropRecord || !e.dataTransfer.types.includes("application/x-record")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const key = e.dataTransfer.getData("application/x-record");
        if (key && onDropRecord) onDropRecord(key);
      }}
      whileHover={{ y: -3 }}
      animate={highlighted ? { y: -6, scale: 1.02 } : { y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      aria-label={label}
      className={cn(
        "block w-full rounded-[8px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a6323b] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f3f1ec]",
        (highlighted || over) && "ring-2 ring-[#a6323b] ring-offset-2 ring-offset-[#f3f1ec]",
      )}
    >
      {count === 0 && !position.box ? (
        <EmptyPosition name={position.name} active={placing || over} />
      ) : (
        <ArchiveBox
          name={position.name}
          count={count}
          kinds={kindsIn(position.items.map((i) => i.documentType))}
          legacy={position.legacy}
          className={placing || over ? "border-[#a6323b]" : undefined}
        />
      )}
    </motion.button>
  );
}
