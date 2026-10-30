import * as React from "react";
import { motion } from "motion/react";
import { Plus } from "lucide-react";

import { kindsIn, type RoomShelf } from "@/features/records/room/room-model";
import { MiniBox } from "@/features/records/room/archive-box";
import { cn } from "@/lib/utils";

/**
 * The room at a glance: every shelf as it stands, with how much is on it.
 * A shelf opens with a camera-like zoom: its drawing here and the full shelf
 * share a layout id, so it grows into place rather than a new page loading.
 * A record dragged from the Unplaced list can be dropped on a shelf, which
 * opens the placing dialog on that shelf.
 */
export function ShelfOverview({
  shelves,
  onOpen,
  onDropRecord,
  onAddShelf,
  dragging,
}: {
  shelves: RoomShelf[];
  onOpen: (shelfId: string) => void;
  onDropRecord?: (shelfId: string, recordKey: string) => void;
  /** Administrators: the room's next shelf stands in its place, ready to add. */
  onAddShelf?: () => void;
  dragging: boolean;
}) {
  return (
    <ul className="grid list-none gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
      {shelves.map((s) => (
        <li key={s.shelf.id}>
          <ShelfCard shelf={s} onOpen={onOpen} onDropRecord={onDropRecord} dragging={dragging} />
        </li>
      ))}
      {onAddShelf && (
        <li>
          <button
            type="button"
            onClick={onAddShelf}
            className="grid h-full min-h-[236px] w-full place-items-center rounded-[14px] border border-dashed border-[#d4d0c7] bg-transparent text-center text-[#5b606b] transition-colors hover:border-neutral-900 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a6323b]"
          >
            <span>
              <Plus aria-hidden="true" className="mx-auto h-5 w-5" />
              <span className="mt-2 block text-[14px] font-medium">Add shelf</span>
              <span className="mt-0.5 block text-[12.5px]">Five levels, two boxes each</span>
            </span>
          </button>
        </li>
      )}
    </ul>
  );
}

function ShelfCard({
  shelf,
  onOpen,
  onDropRecord,
  dragging,
}: {
  shelf: RoomShelf;
  onOpen: (shelfId: string) => void;
  onDropRecord?: (shelfId: string, recordKey: string) => void;
  dragging: boolean;
}) {
  const [over, setOver] = React.useState(false);
  const positions = shelf.levels.reduce((n, l) => n + l.positions.filter((p) => !p.legacy).length, 0);
  return (
    <button
      type="button"
      onClick={() => onOpen(shelf.shelf.id)}
      onDragOver={(e) => {
        if (!onDropRecord || !e.dataTransfer.types.includes("application/x-record")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const key = e.dataTransfer.getData("application/x-record");
        if (key && onDropRecord) onDropRecord(shelf.shelf.id, key);
      }}
      aria-label={`${shelf.shelf.name}: ${shelf.records} ${shelf.records === 1 ? "record" : "records"}, ${shelf.boxesInUse} of ${positions} boxes in use. Open shelf.`}
      className={cn(
        "group block w-full rounded-[14px] border bg-white p-4 text-left transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-18px_rgba(22,24,29,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a6323b]",
        over ? "border-[#a6323b] shadow-[0_0_0_3px_rgba(166,50,59,0.12)]" : dragging ? "border-[#cfc9bd]" : "border-[#e6e6e3]",
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[15px] font-semibold text-neutral-900">{shelf.shelf.name}</span>
        <span className="shrink-0 text-[12.5px] tabular-nums text-[#5b606b]">
          {shelf.records} {shelf.records === 1 ? "record" : "records"}
        </span>
      </div>
      <div className="mt-0.5 text-[12.5px] text-[#6b707a]">
        {shelf.boxesInUse} of {positions} boxes in use
      </div>
      {/* The shelf itself, small: five levels of two boxes. */}
      <motion.div
        layoutId={`rack-${shelf.shelf.id}`}
        className="mt-3 space-y-[5px] rounded-[8px] border border-[#e0dcd3] bg-[#f3f1ec] p-2.5"
      >
        {shelf.levels.map((l) => (
          <div key={l.level.id}>
            <div className={cn("grid gap-[5px]", l.positions.length > 2 ? "grid-cols-3" : "grid-cols-2")}>
              {l.positions.map((p) => (
                <MiniBox key={p.key} count={p.items.length} kinds={kindsIn(p.items.map((i) => i.documentType))} />
              ))}
            </div>
            <div aria-hidden="true" className="mt-[3px] h-[3px] rounded-[1px] bg-[#d8d2c6]" />
          </div>
        ))}
      </motion.div>
    </button>
  );
}
