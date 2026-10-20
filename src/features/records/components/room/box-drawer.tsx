import * as React from "react";
import { ArrowLeft, ArrowRightLeft, Pencil } from "lucide-react";

import {
  Button,
  Drawer,
  DrawerActions,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Input,
  toast,
} from "@/components";
import { moveBox, relabelBox } from "@/features/records/shelf-api";
import {
  DOC_TYPES,
  boxName,
  boxYearLine,
  type BoxContent,
  type BoxLocation,
  type RecordBox,
  type ShelfWithLevels,
  type Slot,
  SLOTS,
} from "@/features/records/shelf-types";
import { LocationLine } from "@/features/records/components/room/room-parts";
import { docTone, formatDate, recordCount } from "@/features/records/components/room/room-format";

/**
 * One box, opened: what it is, where it stands, and the documents inside it,
 * each a click from its own page.
 *
 * Moving the box and correcting its label happen in this same panel, as a
 * second view, rather than in a dialog stacked on top of it — one layer at a
 * time, and Back returns to the contents.
 */
type View = "contents" | "move" | "label";

export function BoxDrawer({
  box,
  location,
  contents,
  shelves,
  boxes,
  onOpenChange,
  onViewRecord,
  onViewLocation,
  onChanged,
  canManage = true,
}: {
  box: RecordBox | null;
  location: BoxLocation | null;
  contents: BoxContent[];
  shelves: ShelfWithLevels[];
  boxes: RecordBox[];
  onOpenChange: (open: boolean) => void;
  onViewRecord: (c: BoxContent) => void;
  onViewLocation: () => void;
  onChanged: () => void;
  /** Whether the viewer may move the box or correct its label (Administrators). */
  canManage?: boolean;
}) {
  const [view, setView] = React.useState<View>("contents");
  const [label, setLabel] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setView("contents");
    setLabel(box?.labelOverride ?? "");
  }, [box?.id, box?.labelOverride]);

  const taken = React.useMemo(
    () => new Set(boxes.map((b) => `${b.shelfLevelId}:${b.slot}`)),
    [boxes],
  );

  const move = async (levelId: string, slot: Slot) => {
    if (!box) return;
    setSaving(true);
    try {
      await moveBox(box.id, levelId, slot);
      toast.success(`${boxName(box)} moved`);
      setView("contents");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to move the box");
    }
    setSaving(false);
  };

  const saveLabel = async () => {
    if (!box) return;
    setSaving(true);
    try {
      await relabelBox(box.id, label);
      toast.success("Label saved");
      setView("contents");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unable to save the label");
    }
    setSaving(false);
  };

  const back = (
    <Button variant="ghost" size="sm" onClick={() => setView("contents")} disabled={saving}>
      <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
      Back to contents
    </Button>
  );

  return (
    <Drawer open={box !== null} onOpenChange={onOpenChange} size="md">
      {box ? (
        <>
          <DrawerHeader
            title={box.labelOverride?.trim() || DOC_TYPES[box.documentType].name}
            onClose={() => onOpenChange(false)}
          >
            {/* Where the box stands is the first thing read after its name. */}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold uppercase tabular-nums tracking-[0.04em] text-neutral-900">
                <span aria-hidden className={`h-[8px] w-[8px] ${docTone(box.documentType)}`} />
                {boxYearLine(box)}
              </span>
              <span className="text-[12.5px] tabular-nums text-neutral-500">
                {recordCount(contents.length)}
              </span>
            </div>
            <div className="mt-2">
              <LocationLine location={location} className="text-[14px]" />
            </div>
          </DrawerHeader>

          {view === "contents" && (
            <>
              <DrawerBody className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
                    Contents
                  </h3>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setView("label")}>
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />
                        Correct label
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setView("move")}>
                        <ArrowRightLeft className="mr-1.5 h-3.5 w-3.5" />
                        Move Box
                      </Button>
                    </div>
                  )}
                </div>
                {contents.length === 0 ? (
                  <p className="rounded-[3px] border border-dashed border-neutral-300 px-3 py-4 text-center text-[12.5px] text-neutral-500">
                    This box is empty. A document taken back out of Approved leaves its box.
                  </p>
                ) : (
                  <ul className="divide-y divide-neutral-200 rounded-[3px] border border-neutral-200">
                    {contents.map((c) => (
                      <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] font-semibold tabular-nums text-neutral-900">
                            {c.documentNo}
                          </div>
                          <div className="truncate text-[12.5px] text-neutral-600" title={c.agency}>
                            {c.agency} · <span className="tabular-nums">{formatDate(c.date)}</span>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => onViewRecord(c)}>
                          View Record
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </DrawerBody>
              <DrawerFooter>
                <DrawerActions>
                  <Button variant="secondary" onClick={() => onOpenChange(false)}>
                    Close
                  </Button>
                  <Button onClick={onViewLocation} disabled={!location}>
                    View Location
                  </Button>
                </DrawerActions>
              </DrawerFooter>
            </>
          )}

          {view === "move" && (
            <>
              <DrawerBody className="space-y-3">
                <div>
                  <h3 className="text-[13.5px] font-semibold text-neutral-900">Move this box</h3>
                  <p className="text-[12.5px] text-neutral-500">
                    Everything in the box moves with it. Choose an empty position.
                  </p>
                </div>
                {shelves.map((shelf) => (
                  <div key={shelf.id}>
                    <div className="pb-1 text-[12px] font-semibold text-neutral-900">{shelf.name}</div>
                    <div className="grid grid-cols-[1.5rem_repeat(3,minmax(0,1fr))] items-center gap-1.5">
                      {shelf.levels.map((level) => (
                        <React.Fragment key={level.id}>
                          <span className="grid h-6 w-6 place-items-center rounded-[2px] bg-neutral-900 text-[11.5px] font-bold text-white">
                            {level.label}
                          </span>
                          {SLOTS.map((slot) => {
                            const here = box.shelfLevelId === level.id && box.slot === slot;
                            const occupied = taken.has(`${level.id}:${slot}`);
                            return (
                              <button
                                key={slot}
                                type="button"
                                disabled={occupied || saving}
                                onClick={() => void move(level.id, slot)}
                                aria-label={`${shelf.name}, level ${level.label}, box ${slot}${here ? ", this box" : occupied ? ", taken" : ", empty"}`}
                                className="rounded-[3px] border border-neutral-300 bg-white px-2 py-1.5 text-left text-[12px] text-neutral-800 transition hover:border-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ring) disabled:cursor-default disabled:border-dashed disabled:bg-transparent disabled:text-neutral-400"
                              >
                                <span className="block truncate">
                                  Box {slot} · {here ? "this box" : occupied ? "taken" : "empty"}
                                </span>
                              </button>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </DrawerBody>
              <DrawerFooter>
                <DrawerActions>{back}</DrawerActions>
              </DrawerFooter>
            </>
          )}

          {view === "label" && (
            <>
              <DrawerBody className="space-y-3">
                <div>
                  <h3 className="text-[13.5px] font-semibold text-neutral-900">Correct the label</h3>
                  <p className="text-[12.5px] text-neutral-500">
                    Only when the label on the physical box reads differently. Leave it empty to
                    use the generated name.
                  </p>
                </div>
                <Input
                  aria-label="Box label"
                  value={label}
                  placeholder={boxName({ ...box, labelOverride: undefined })}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </DrawerBody>
              <DrawerFooter>
                <DrawerActions>
                  {back}
                  <Button onClick={() => void saveLabel()} loading={saving}>
                    Save label
                  </Button>
                </DrawerActions>
              </DrawerFooter>
            </>
          )}
        </>
      ) : null}
    </Drawer>
  );
}
