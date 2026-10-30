import * as React from "react";
import { Check, Pencil, X } from "lucide-react";

import { toast } from "@/components";
import { cn } from "@/lib/utils";

/**
 * A name the office can change in place — a shelf's, a level's, a box's.
 * Saved through the function that keeps locations by ID, so renaming moves
 * nothing. Enter saves, Escape cancels; an empty name gives a level or a box
 * back its plain one ("Level A", "Box 1") where that is allowed.
 */
export function InlineName({
  value,
  placeholder,
  label,
  canEdit,
  required,
  onSave,
  className,
  textClassName,
  wrap,
}: {
  value: string;
  placeholder?: string;
  /** What is being named, for the button and the field: "shelf", "level", "box". */
  label: string;
  canEdit: boolean;
  /** A shelf must keep a name; a level or box may go back to its plain one. */
  required?: boolean;
  onSave: (name: string) => Promise<void>;
  className?: string;
  textClassName?: string;
  /** Long names (a level's) wrap to two lines rather than cut off. */
  wrap?: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const [saving, setSaving] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const save = async () => {
    const next = draft.trim();
    if (required && !next) {
      toast.error(`Give the ${label} a name.`);
      return;
    }
    if (next === value.trim()) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
      toast.success(`${label[0].toUpperCase()}${label.slice(1)} renamed`);
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `The ${label} could not be renamed`);
    }
    setSaving(false);
  };

  if (!editing) {
    return (
      <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
        <span className={cn("min-w-0", wrap ? "line-clamp-2 break-words" : "truncate", textClassName)}>{value}</span>
        {canEdit && (
          <button
            type="button"
            aria-label={`Rename ${label} ${value}`}
            onClick={(e) => {
              e.stopPropagation();
              setDraft(value);
              setEditing(true);
            }}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[#7c818b] transition-colors hover:bg-black/5 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a6323b]"
          >
            <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        )}
      </span>
    );
  }

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)} onClick={(e) => e.stopPropagation()}>
      <input
        ref={input}
        aria-label={`${label[0].toUpperCase()}${label.slice(1)} name`}
        value={draft}
        placeholder={placeholder}
        maxLength={120}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          if (e.key === "Escape") setEditing(false);
        }}
        className="h-9 min-w-0 flex-1 rounded-lg border border-[#d4d5d2] bg-white px-2.5 text-[14px] text-neutral-900 placeholder:text-[#6b707a] focus:border-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
      />
      <button
        type="button"
        aria-label="Save name"
        disabled={saving}
        onClick={() => void save()}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-neutral-900 text-white transition-colors hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a6323b] disabled:opacity-60"
      >
        <Check aria-hidden="true" className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Cancel renaming"
        disabled={saving}
        onClick={() => setEditing(false)}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#5b606b] transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a6323b]"
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </span>
  );
}
