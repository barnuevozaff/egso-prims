import * as React from "react";
import { Archive, ArrowRightLeft } from "lucide-react";

import { Button } from "@/components";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { docTone } from "@/features/records/components/room/room-format";
import { placeText, type CatalogDoc, type Placement, type RoomPosition, type RoomShelf } from "@/features/records/room/room-model";
import { useAuth } from "@/features/auth/auth-context";
import { placeDocument } from "@/features/records/shelf-api";
import { DOC_TYPES } from "@/features/records/shelf-types";
import { cn } from "@/lib/utils";

/**
 * Placing a record, or moving one, by choosing: shelf, then the box on a
 * level — the accessible way to file, and the one every drop on the room
 * leads to as well, so nothing is saved without a confirmation. The record is
 * reported placed only once the function has saved it; if that fails it
 * stays where it was, unplaced or in its box, and the reason is shown here.
 */
export function PlaceDialog({
  open,
  doc,
  current,
  shelves,
  initialShelfId,
  initialPositionKey,
  onOpenChange,
  onPlaced,
}: {
  open: boolean;
  doc: CatalogDoc | null;
  /** Where it is now, when this is a move. */
  current?: Placement | null;
  shelves: RoomShelf[];
  initialShelfId?: string | null;
  initialPositionKey?: string | null;
  onOpenChange: (open: boolean) => void;
  onPlaced: (target: { shelfId: string; positionKey: string }) => void;
}) {
  // Each opening starts from where it was asked to — a shelf or box dropped on, or the
  // record's own shelf — and is not reset by the room refreshing underneath it: the page
  // mounts a fresh dialog for each record it places.
  const [shelfId, setShelfId] = React.useState<string | null>(
    () => initialShelfId ?? current?.shelf.shelf.id ?? shelves[0]?.shelf.id ?? null,
  );
  const [positionKey, setPositionKey] = React.useState<string | null>(() => initialPositionKey ?? null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const { user } = useAuth();

  if (!doc) return null;
  const shelf = shelves.find((s) => s.shelf.id === shelfId) ?? null;
  let target: { position: RoomPosition; levelTitle: string } | null = null;
  for (const l of shelf?.levels ?? []) {
    const p = l.positions.find((x) => x.key === positionKey && !x.legacy);
    if (p) target = { position: p, levelTitle: l.title };
  }
  const moving = !!current;

  const confirm = async () => {
    if (!shelf || !target) return;
    setSaving(true);
    setError(null);
    try {
      await placeDocument(doc.type, doc.id, target.position.levelId, target.position.slot, user?.name);
      onPlaced({ shelfId: shelf.shelf.id, positionKey: target.position.key });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The record could not be placed. Nothing was changed.");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-[14px] p-0 sm:max-w-[820px]">
        <DialogHeader className="border-b border-[#ececea] px-5 pb-4 pt-5 text-left">
          <DialogTitle className="text-[17px] font-semibold text-neutral-900">
            {moving ? `Move ${doc.number}` : `Place ${doc.number}`}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 text-[13px] text-[#5b606b]">
            <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", docTone(doc.type))} />
            {DOC_TYPES[doc.type].name} · {doc.title || "—"}
            {current ? ` · now in ${placeText(current)}` : ""}
          </DialogDescription>
        </DialogHeader>

        {shelves.length === 0 ? (
          <p className="px-5 py-8 text-center text-[14px] text-[#5b606b]">Add a shelf to the room first.</p>
        ) : (
          <div className="grid gap-5 px-5 py-5 sm:grid-cols-[210px_minmax(0,1fr)]">
            <fieldset>
              <legend className="mb-2 text-[12.5px] font-medium text-[#4a4f59]">1. Shelf</legend>
              <div role="radiogroup" aria-label="Shelf" className="space-y-1.5">
                {shelves.map((s) => (
                  <button
                    key={s.shelf.id}
                    type="button"
                    role="radio"
                    aria-checked={s.shelf.id === shelfId}
                    onClick={() => {
                      setShelfId(s.shelf.id);
                      setPositionKey(null);
                    }}
                    className={cn(
                      "flex min-h-11 w-full items-center justify-between gap-2 rounded-[10px] border px-3 text-left text-[13.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a6323b]",
                      s.shelf.id === shelfId ? "border-neutral-900 bg-[#fafaf9] font-medium text-neutral-900" : "border-[#e6e6e3] text-[#4a4f59] hover:border-[#cfcfcb]",
                    )}
                  >
                    <span className="min-w-0 truncate">{s.shelf.name}</span>
                    <span className="shrink-0 text-[12px] tabular-nums text-[#6b707a]">{s.records}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-[12.5px] font-medium text-[#4a4f59]">2. Box</legend>
              {shelf && (
                <div role="radiogroup" aria-label={`Boxes on ${shelf.shelf.name}`} className="space-y-2.5 rounded-[12px] border border-[#e0dcd3] bg-[#f3f1ec] p-3">
                  {shelf.levels.map((l) => (
                    <div key={l.level.id} className="grid items-center gap-2 sm:grid-cols-[minmax(0,150px)_1fr]">
                      <div className="flex min-w-0 items-center gap-2 text-[12.5px] text-[#4a4f59]">
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-white text-[11px] font-semibold shadow-[0_0_0_1px_#e0dcd3]">
                          {l.level.label}
                        </span>
                        <span className="truncate">{l.title}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {l.positions
                          .filter((p) => !p.legacy)
                          .map((p) => {
                            const here = current?.position.key === p.key;
                            const chosen = p.key === positionKey;
                            return (
                              <button
                                key={p.key}
                                type="button"
                                role="radio"
                                aria-checked={chosen}
                                disabled={here}
                                onClick={() => setPositionKey(p.key)}
                                className={cn(
                                  "min-h-12 rounded-[8px] border px-2.5 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a6323b] disabled:cursor-not-allowed disabled:opacity-60",
                                  chosen
                                    ? "border-[#a6323b] bg-white shadow-[0_0_0_3px_rgba(166,50,59,0.12)]"
                                    : p.items.length || p.box
                                      ? "border-[#cdbb9a] bg-[#e9dcc4] hover:border-[#a6323b]"
                                      : "border-dashed border-[#d4d0c7] bg-[#f7f5f0] hover:border-[#a6323b]",
                                )}
                              >
                                <span className="block truncate text-[12.5px] font-medium text-neutral-900">{p.name}</span>
                                <span className="block text-[11.5px] text-[#5b606b]">
                                  {here ? "Here now" : p.items.length ? `${p.items.length} ${p.items.length === 1 ? "record" : "records"}` : "Empty"}
                                </span>
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </fieldset>
          </div>
        )}

        {error && (
          <p role="alert" className="mx-5 mb-3 rounded-[10px] border border-[#f2d6c2] bg-[#fdf6f0] px-3.5 py-2.5 text-[13px] text-[#7c2d12]">
            {error}
          </p>
        )}
        <DialogFooter className="border-t border-[#ececea] px-5 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void confirm()} disabled={!target} loading={saving}>
            {moving ? <ArrowRightLeft /> : <Archive />}
            {target && shelf ? `${moving ? "Move" : "Place"} in ${shelf.shelf.name} › ${target.levelTitle} › ${target.position.name}` : "Choose a box"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
