import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, LayoutGroup, MotionConfig, motion, useReducedMotion } from "motion/react";
import { FilePlus2, Inbox, PanelRightOpen, Plus } from "lucide-react";

import { Button, ConfirmationModal, EmptyState, ErrorState, PageTransition, Skeleton, toast } from "@/components";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/features/auth/auth-context";
import { can } from "@/features/auth/types";
import { BoxView } from "@/features/records/room/box-view";
import { PlaceDialog } from "@/features/records/room/place-dialog";
import { RecordsNav } from "@/features/records/room/records-nav";
import { AddShelfDialog, CreateRecordDialog } from "@/features/records/room/room-dialogs";
import { docKey, placeText, type CatalogDoc, type Placement } from "@/features/records/room/room-model";
import { RoomSearch } from "@/features/records/room/room-search";
import { ShelfOverview } from "@/features/records/room/shelf-overview";
import { ShelfView } from "@/features/records/room/shelf-view";
import { ToFilePanel } from "@/features/records/room/to-file-panel";
import { useRoom } from "@/features/records/room/use-room";
import { deleteShelf, renameLocation } from "@/features/records/shelf-api";
import { DOC_TYPES, type BoxContent } from "@/features/records/shelf-types";

/**
 * Records (30 Oct 2026): the Records Room, where the three National Archives
 * forms are kept. One room, its shelves of five levels and two boxes a level,
 * and beside it what is left to file.
 *
 * The address holds where you are — `?shelf=` a shelf, `&box=` the box at
 * `{levelId}~{slot}`, `&doc=` a record in it — so Back and Forward walk the
 * room, and a record's location can be linked to. Locate goes there the way a
 * person would: to the shelf, the box drawn out, then open on the record.
 *
 * Nothing is filed by the screen alone: placing and moving go through the
 * placeRecordDocument function, and the room shows what Firestore holds once
 * it has saved.
 */
export function RecordsRoomPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = can(user, "manage:records");
  const reduce = useReducedMotion() ?? false;
  const { model, loading, failed, refresh } = useRoom();
  const [params, setParams] = useSearchParams();

  const [createOpen, setCreateOpen] = React.useState(false);
  const [addShelfOpen, setAddShelfOpen] = React.useState(false);
  const [panelOpen, setPanelOpen] = React.useState(true);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [highlightKey, setHighlightKey] = React.useState<string | null>(null);
  const [justPlacedKey, setJustPlacedKey] = React.useState<string | null>(null);
  const [removeShelf, setRemoveShelf] = React.useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = React.useState(false);
  const [placing, setPlacing] = React.useState<{
    doc: CatalogDoc;
    current?: Placement | null;
    shelfId?: string | null;
    positionKey?: string | null;
  } | null>(null);
  const [placingRun, setPlacingRun] = React.useState(0);
  const timer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);
  // A placed record drops into its box once, not each time the box is opened again.
  React.useEffect(() => {
    if (!justPlacedKey) return;
    const t = window.setTimeout(() => setJustPlacedKey(null), 2500);
    return () => window.clearTimeout(t);
  }, [justPlacedKey]);

  // Where the address says we are. An old link's box is a box ID: found by where it stands.
  const shelfId = params.get("shelf");
  const rawBox = params.get("box");
  const boxKey = React.useMemo(() => {
    if (!rawBox) return null;
    if (rawBox.includes("~")) return rawBox;
    for (const [key, at] of model.positions) if (at.position.box?.id === rawBox) return key;
    return null;
  }, [rawBox, model.positions]);
  const docParam = params.get("doc");
  const shelf = shelfId ? model.shelves.find((s) => s.shelf.id === shelfId) ?? null : null;
  const openBox = boxKey ? model.positions.get(boxKey) ?? null : null;
  const view = openBox && shelf ? "box" : shelf ? "shelf" : "overview";

  const go = React.useCallback(
    (next: { shelf?: string; box?: string; doc?: string }, replace = false) => {
      const p = new URLSearchParams();
      if (next.shelf) p.set("shelf", next.shelf);
      if (next.box) p.set("box", next.box);
      if (next.doc) p.set("doc", next.doc);
      setParams(p, { replace });
    },
    [setParams],
  );

  /** To the shelf, the box drawn out, then open on the record. */
  const travel = React.useCallback(
    (to: { shelf: string; box: string; doc?: string }) => {
      window.clearTimeout(timer.current);
      if (reduce) {
        go(to);
        return;
      }
      const alreadyThere = shelfId === to.shelf && !boxKey;
      setHighlightKey(to.box);
      go({ shelf: to.shelf });
      timer.current = window.setTimeout(
        () => {
          setHighlightKey(null);
          go(to, true);
        },
        alreadyThere ? 380 : 760,
      );
    },
    [go, reduce, shelfId, boxKey],
  );

  const locate = (p: Placement) => travel({ shelf: p.shelf.shelf.id, box: p.position.key, doc: docKey(p.content.documentType, p.content.sourceId) });

  const openDoc = (type: CatalogDoc["type"], id: string) => navigate(DOC_TYPES[type].route(id));

  /** Place record: the record chosen, and where the eye already is. */
  const startPlacing = (doc: CatalogDoc, at?: { shelfId?: string | null; positionKey?: string | null }) => {
    setSheetOpen(false);
    setPlacingRun((n) => n + 1);
    setPlacing({ doc, shelfId: at?.shelfId ?? shelfId, positionKey: at?.positionKey ?? null });
  };
  const startMoving = (content: BoxContent) => {
    const key = docKey(content.documentType, content.sourceId);
    const doc = model.catalog.get(key);
    if (!doc) return;
    setPlacingRun((n) => n + 1);
    setPlacing({ doc, current: model.placed.get(key) ?? null, shelfId: shelfId });
  };

  // A record's own page sends `?place=` to be placed from here.
  const placeParam = params.get("place");
  React.useEffect(() => {
    if (!placeParam || loading) return;
    const doc = model.catalog.get(placeParam);
    if (doc && doc.status === "Approved" && !model.placed.has(placeParam) && canManage) startPlacing(doc);
    const p = new URLSearchParams(params);
    p.delete("place");
    setParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeParam, loading]);

  const dropOn = (key: string, at: { shelfId: string; positionKey?: string }) => {
    setDragging(false);
    const doc = model.catalog.get(key);
    if (!doc || !model.unplaced.some((d) => docKey(d.type, d.id) === key)) return;
    startPlacing(doc, at);
  };

  const placed = async (target: { shelfId: string; positionKey: string }) => {
    if (!placing) return;
    const key = docKey(placing.doc.type, placing.doc.id);
    const wasMove = !!placing.current;
    const at = model.positions.get(target.positionKey);
    setPlacing(null);
    setSelectedKey(null);
    await refresh();
    toast.success(`${placing.doc.number} ${wasMove ? "moved to" : "placed in"} ${at ? placeText(at) : "its box"}`);
    setJustPlacedKey(key);
    travel({ shelf: target.shelfId, box: target.positionKey, doc: key });
  };

  const panel = (collapse?: () => void) => (
    <ToFilePanel
      unplaced={model.unplaced}
      awaiting={model.awaiting}
      canManage={canManage}
      selectedKey={selectedKey}
      onSelect={setSelectedKey}
      onPlace={(doc) => startPlacing(doc)}
      onOpen={(doc) => openDoc(doc.type, doc.id)}
      onDragChange={setDragging}
      onCollapse={collapse}
    />
  );

  const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.18 } };

  return (
    <PageTransition className="flex min-h-full flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-neutral-900">Records</h1>
          <p className="mt-1 text-[13.5px] text-[#5b606b]">
            The Records Room: file approved records on the shelves, and find any record by number, office or box.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <RoomSearch
            model={model}
            canManage={canManage}
            onLocate={locate}
            onPlace={(doc) => startPlacing(doc)}
            onOpen={(doc) => openDoc(doc.type, doc.id)}
          />
          {canManage && (
            <Button variant="secondary" onClick={() => setAddShelfOpen(true)}>
              <Plus />
              Add shelf
            </Button>
          )}
          {canManage && (
            <Button onClick={() => setCreateOpen(true)}>
              <FilePlus2 />
              Create record
            </Button>
          )}
        </div>
      </div>

      <RecordsNav />

      <div className="flex min-h-0 flex-1 gap-4">
        <section
          aria-label="Records Room"
          className="relative min-h-[560px] min-w-0 flex-1 rounded-[16px] border border-[#e6e6e3] bg-[#fafaf9] p-3.5 sm:p-5"
        >
          {/* Tablet and phone: what is left to file opens as a sheet. */}
          <div className="mb-3 flex items-center justify-between gap-2 lg:hidden">
            <span className="text-[12.5px] text-[#5b606b]">
              {model.unplaced.length} unplaced · {model.awaiting.length} awaiting approval
            </span>
            <Button variant="secondary" onClick={() => setSheetOpen(true)}>
              <Inbox />
              To file
            </Button>
          </div>

          {loading ? (
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-[230px] rounded-[14px]" />
              ))}
            </div>
          ) : failed ? (
            <ErrorState title="The Records Room could not be read" description="Check the connection and try again." action={{ label: "Try again", onClick: () => void refresh() }} />
          ) : model.shelves.length === 0 ? (
            <EmptyState
              title="No shelves yet"
              description="Add the room's first shelf: five levels, two boxes on each."
              action={canManage ? { label: "Add shelf", onClick: () => setAddShelfOpen(true) } : undefined}
            />
          ) : (
            <MotionConfig reducedMotion="user" transition={{ type: "spring", stiffness: 210, damping: 30, mass: 0.9 }}>
              <LayoutGroup>
                <AnimatePresence mode="popLayout" initial={false}>
                  {view === "overview" && (
                    <motion.div key="overview" {...fade}>
                      <ShelfOverview
                        shelves={model.shelves}
                        dragging={dragging}
                        onOpen={(id) => go({ shelf: id })}
                        onDropRecord={canManage ? (id, key) => dropOn(key, { shelfId: id }) : undefined}
                        onAddShelf={canManage ? () => setAddShelfOpen(true) : undefined}
                      />
                    </motion.div>
                  )}
                  {view === "shelf" && shelf && (
                    <motion.div key={`shelf-${shelf.shelf.id}`} {...fade}>
                      <ShelfView
                        shelf={shelf}
                        canManage={canManage}
                        highlightKey={highlightKey}
                        placing={dragging}
                        onBack={() => go({})}
                        onOpenBox={(p) => go({ shelf: shelf.shelf.id, box: p.key })}
                        onPlaceAt={(p, key) => {
                          const doc = key ? model.catalog.get(key) : selectedKey ? model.catalog.get(selectedKey) : undefined;
                          if (key) dropOn(key, { shelfId: shelf.shelf.id, positionKey: p.key });
                          else if (doc) startPlacing(doc, { shelfId: shelf.shelf.id, positionKey: p.key });
                        }}
                        onRenameShelf={async (name) => {
                          await renameLocation({ kind: "shelf", id: shelf.shelf.id }, name);
                          await refresh();
                        }}
                        onRenameLevel={async (levelId, name) => {
                          await renameLocation({ kind: "level", id: levelId }, name);
                          await refresh();
                        }}
                        onDeleteShelf={() => setRemoveShelf({ id: shelf.shelf.id, name: shelf.shelf.name })}
                      />
                    </motion.div>
                  )}
                  {view === "box" && shelf && openBox && (
                    <motion.div key={`box-${openBox.position.key}`} {...fade}>
                      <BoxView
                        model={model}
                        shelf={shelf}
                        level={openBox.level}
                        position={openBox.position}
                        activeKey={docParam}
                        justPlacedKey={justPlacedKey}
                        canManage={canManage}
                        onBack={() => go({ shelf: shelf.shelf.id })}
                        onActiveChange={(key) => go({ shelf: shelf.shelf.id, box: openBox.position.key, doc: key }, true)}
                        onOpenDoc={(c) => openDoc(c.documentType, c.sourceId)}
                        onMove={startMoving}
                        onRenameBox={async (name) => {
                          await renameLocation({ kind: "box", levelId: openBox.position.levelId, slot: openBox.position.slot }, name);
                          await refresh();
                        }}
                        onPlaceHere={() => {
                          const doc = selectedKey ? model.catalog.get(selectedKey) : undefined;
                          if (doc && model.unplaced.includes(doc)) {
                            startPlacing(doc, { shelfId: shelf.shelf.id, positionKey: openBox.position.key });
                          } else {
                            toast.info("Choose a record under Unplaced, then Place record.");
                            setPanelOpen(true);
                            if (!window.matchMedia("(min-width: 1024px)").matches) setSheetOpen(true);
                          }
                        }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </LayoutGroup>
            </MotionConfig>
          )}
        </section>

        {/* Desktop: beside the room, folded away when not wanted. */}
        {panelOpen ? (
          <aside className="hidden min-h-[560px] w-[340px] shrink-0 lg:block">
            {panel(() => setPanelOpen(false))}
          </aside>
        ) : (
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            aria-label={`Show records to file: ${model.unplaced.length} unplaced`}
            className="sticky top-0 hidden h-[200px] w-12 shrink-0 flex-col items-center gap-2 self-start rounded-[14px] border border-[#e6e6e3] bg-white py-3 text-[#5b606b] hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a6323b] lg:flex"
          >
            <PanelRightOpen aria-hidden="true" className="h-4 w-4" />
            <span className="text-[12px] font-medium tabular-nums">{model.unplaced.length}</span>
            <span className="text-[11px] [writing-mode:vertical-rl]">To file</span>
          </button>
        )}
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full p-3 sm:max-w-[420px]">
          <SheetTitle className="sr-only">Records to file</SheetTitle>
          {panel()}
        </SheetContent>
      </Sheet>

      <PlaceDialog
        key={placingRun}
        open={!!placing}
        doc={placing?.doc ?? null}
        current={placing?.current}
        shelves={model.shelves}
        initialShelfId={placing?.shelfId}
        initialPositionKey={placing?.positionKey}
        onOpenChange={(o) => !o && setPlacing(null)}
        onPlaced={(t) => void placed(t)}
      />
      <CreateRecordDialog open={createOpen} onOpenChange={setCreateOpen} />
      <AddShelfDialog
        open={addShelfOpen}
        nextNumber={model.shelves.length + 1}
        position={model.shelves.reduce((m, s) => Math.max(m, s.shelf.position + 1), 0)}
        onOpenChange={setAddShelfOpen}
        onAdded={() => void refresh()}
      />
      <ConfirmationModal
        open={!!removeShelf}
        onOpenChange={(o) => !o && setRemoveShelf(null)}
        tone="danger"
        title={`Remove ${removeShelf?.name ?? "this shelf"}?`}
        description="It holds no records. Its levels and any empty, named boxes go with it."
        confirmLabel="Remove shelf"
        loading={removing}
        onConfirm={async () => {
          if (!removeShelf) return;
          setRemoving(true);
          try {
            await deleteShelf(removeShelf.id);
            toast.success(`${removeShelf.name} removed`);
            go({});
            await refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "The shelf could not be removed");
          }
          setRemoving(false);
          setRemoveShelf(null);
        }}
      />
    </PageTransition>
  );
}
