import * as React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Plus } from "lucide-react";

import { Button, Field, Input, toast } from "@/components";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { docTone } from "@/features/records/components/room/room-format";
import { createShelf } from "@/features/records/shelf-api";
import { DOC_TYPES, type DocType } from "@/features/records/shelf-types";
import { cn } from "@/lib/utils";

/** The three forms the room keeps, and where each is filled in (unchanged forms, 30 Oct 2026). */
const CREATE: { type: DocType; to: string; about: string }[] = [
  { type: "RDS", to: "/records/new", about: "The schedule that sets how long each records series is kept." },
  { type: "RIA", to: "/records/inventory/new", about: "The inventory of an office's records series and their value." },
  { type: "RAD", to: "/records/disposal/new", about: "The request to dispose of records whose retention has ended." },
];

/**
 * Create record: one of the three forms, each opening its own page as before.
 * No shelf or box is asked for: once the form is approved it waits among the
 * Unplaced records until it is placed.
 */
export function CreateRecordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 rounded-[14px] p-0 sm:max-w-[560px]">
        <DialogHeader className="px-5 pb-3 pt-5 text-left">
          <DialogTitle className="text-[17px] font-semibold text-neutral-900">Create record</DialogTitle>
          <DialogDescription className="text-[13px] text-[#5b606b]">
            Choose the form. Once it is approved, place it in a box from the Unplaced list.
          </DialogDescription>
        </DialogHeader>
        <ul className="list-none space-y-2 px-5 pb-5">
          {CREATE.map((c) => (
            <li key={c.type}>
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  navigate(c.to);
                }}
                className="group flex min-h-16 w-full items-center gap-3.5 rounded-[12px] border border-[#e6e6e3] px-4 py-3 text-left transition-colors hover:border-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a6323b]"
              >
                <span aria-hidden="true" className={cn("h-10 w-1.5 shrink-0 rounded-full", docTone(c.type))} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-medium text-neutral-900">{DOC_TYPES[c.type].name}</span>
                  <span className="block text-[12.5px] text-[#5b606b]">{c.about}</span>
                </span>
                <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[#7c818b] transition-transform group-hover:translate-x-0.5" />
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/** Adds a shelf of five levels, two boxes each, named as the office calls it. */
export function AddShelfDialog({
  open,
  nextNumber,
  position,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  nextNumber: number;
  position: number;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}) {
  const [name, setName] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  React.useEffect(() => {
    if (!open) return;
    setName(`Shelf ${nextNumber}`);
    setLocation("");
    setError(undefined);
  }, [open, nextNumber]);

  const save = async () => {
    if (!name.trim()) {
      setError("Give the shelf a name — what the office calls it out loud.");
      return;
    }
    setSaving(true);
    try {
      await createShelf({ name, location }, position);
      toast.success(`${name.trim()} added`);
      onAdded();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The shelf could not be added");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="rounded-[14px] sm:max-w-[440px]">
        <DialogHeader className="text-left">
          <DialogTitle className="text-[17px] font-semibold text-neutral-900">Add shelf</DialogTitle>
          <DialogDescription className="text-[13px] text-[#5b606b]">
            Five levels, A to E, with two boxes on each. Levels and boxes can be named later.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="space-y-3"
        >
          <Field label="Shelf name" required error={error}>
            <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Where it stands" helper="Optional, e.g. Records Room, north wall.">
            <Input value={location} maxLength={200} onChange={(e) => setLocation(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button variant="ghost" type="button" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              <Plus />
              Add shelf
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
