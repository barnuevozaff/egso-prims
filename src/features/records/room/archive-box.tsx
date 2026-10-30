import { docTone } from "@/features/records/components/room/room-format";
import { DOC_TYPES, type DocType } from "@/features/records/shelf-types";
import { cn } from "@/lib/utils";

/**
 * An archive box seen from the front, as it stands on a shelf: a kraft
 * carton with its lid edge, a white label plate with the box's name and how
 * many records it holds, the hand hole, and a short colour mark for each kind
 * of form inside (burgundy schedules, blue inventories, green disposal
 * requests). The colour is never the only signal: the label says the count,
 * and the open box names every record.
 */

export function ArchiveBox({
  name,
  count,
  kinds,
  legacy,
  className,
}: {
  name: string;
  count: number;
  kinds: DocType[];
  /** Standing in an old third position: its records are to be moved. */
  legacy?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative h-[104px] w-full overflow-hidden rounded-[6px] border border-[#cdbb9a] bg-[#e9dcc4] shadow-[inset_0_-8px_0_rgba(80,60,30,0.05)]",
        className,
      )}
    >
      {/* The lid's front edge. */}
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[10px] border-b border-[#cdbb9a] bg-[#e2d3b6]" />
      <span className="absolute inset-x-2.5 top-[18px] rounded-[3px] border border-[#d9cfc1] bg-white px-2 py-1.5 text-left">
        <span className="block truncate text-[12.5px] font-semibold leading-tight text-neutral-900">{name}</span>
        <span className="mt-0.5 block text-[11.5px] leading-tight text-[#5b606b]">
          {count === 0 ? "Empty" : `${count} ${count === 1 ? "record" : "records"}`}
          {legacy ? " · old position" : ""}
        </span>
      </span>
      <span aria-hidden="true" className="absolute bottom-[11px] left-1/2 h-[8px] w-[36px] -translate-x-1/2 rounded-full bg-[#c9b18a] shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)]" />
      {kinds.length > 0 && (
        <span aria-hidden="true" className="absolute bottom-[10px] right-2.5 flex gap-[3px]">
          {kinds.map((k) => (
            <span key={k} title={DOC_TYPES[k].short} className={cn("h-[10px] w-[4px] rounded-[1px]", docTone(k))} />
          ))}
        </span>
      )}
    </div>
  );
}

/** An empty position on a shelf: where a box goes when the first record is placed in it. */
export function EmptyPosition({ name, active }: { name: string; active?: boolean }) {
  return (
    <div
      className={cn(
        "grid h-[104px] w-full place-items-center rounded-[6px] border border-dashed text-center transition-colors",
        active ? "border-[#a6323b] bg-[#fcf6f7]" : "border-[#d4d0c7] bg-[#f7f5f0]",
      )}
    >
      <span>
        <span className="block text-[12.5px] font-medium text-[#4a4f59]">{name}</span>
        <span className="block text-[11.5px] text-[#6b707a]">{active ? "Place here" : "Empty"}</span>
      </span>
    </div>
  );
}

/** A box at the size of the room's overview, where a shelf is a thumbnail. */
export function MiniBox({ count, kinds }: { count: number; kinds: DocType[] }) {
  if (count === 0) return <span className="block h-[18px] rounded-[3px] border border-dashed border-[#d4d0c7]" />;
  return (
    <span className="relative block h-[18px] rounded-[3px] border border-[#cdbb9a] bg-[#e5d7bc]">
      <span aria-hidden="true" className="absolute right-1 top-1/2 flex -translate-y-1/2 gap-[2px]">
        {kinds.map((k) => (
          <span key={k} className={cn("h-[8px] w-[3px] rounded-[1px]", docTone(k))} />
        ))}
      </span>
    </span>
  );
}

/** The board a level's boxes stand on. */
export function ShelfBoard() {
  return <div aria-hidden="true" className="h-[7px] rounded-[2px] bg-[#d8d2c6] shadow-[0_2px_0_rgba(60,45,20,0.08)]" />;
}
