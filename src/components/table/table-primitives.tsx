import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Low-level table primitives with the Design Foundation's exact anatomy:
 * 11px uppercase headers, 13px body, hairline row dividers, soft row hover.
 * Prefer EnterpriseTable for data grids; use these for bespoke compositions.
 */

export function Table({
  className,
  minWidth = 900,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement> & {
  minWidth?: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table
        className={cn(
          "w-full text-left",
          className,
        )}
        style={{ minWidth }}
        {...props}
      />
    </div>
  );
}

export function TableHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={className} {...props} />;
}

export function TableHeaderRow({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        // Band, case, tracking and colour come from tokens rather than from
        // literals here, so the header can be restyled in one place. They
        // resolve to the values this table has always used: a neutral-50 band
        // with uppercase, wide-tracked neutral-400 labels.
        "bg-(--thead-bg) text-[12.5px]",
        "[text-transform:var(--thead-transform)] tracking-(--thead-tracking)",
        "text-(--thead-fg)",
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({
  className,
  first = false,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { first?: boolean }) {
  return (
    <th
      className={cn(
        // The weight sits here, not on the row: the UA stylesheet gives
        // `th` its own `font-weight: bold`, which an inherited value cannot
        // out-rank.
        "py-head [font-weight:var(--thead-weight)]",
        first ? "px-rowx-first" : "px-rowx",
        className,
      )}
      {...props}
    />
  );
}

export function TableBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("text-[13.5px] text-neutral-800", className)} {...props} />;
}

/**
 * A row that opens a record is a control, not decoration.
 *
 * `interactive` used to add nothing but `cursor-pointer`, which left the main
 * verb of every list page — open this document — reachable by mouse only. The
 * row now takes focus, responds to Enter and Space, and shows the same accent
 * ring every other control uses. Space is prevented on keydown so the page
 * does not scroll under the activation.
 *
 * Deliberately **not** `role="button"`. Putting a button role on a `<tr>`
 * removes it from the table's own semantics, so a screen reader loses the
 * row/column structure that makes a data grid readable in the first place —
 * a worse trade than the one it fixes. The row keeps its native role; the
 * fully correct treatment is a real link on the document number in the first
 * cell, which is a per-page change rather than one this primitive can make.
 */
export function TableRow({
  className,
  interactive = false,
  onClick,
  onKeyDown,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean }) {
  const activate = (e: React.KeyboardEvent<HTMLTableRowElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented || !onClick) return;
    if (e.key !== "Enter" && e.key !== " ") return;
    // Let a control inside the row keep its own keyboard behaviour.
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    onClick(e as unknown as React.MouseEvent<HTMLTableRowElement>);
  };

  return (
    <tr
      className={cn(
        "border-t border-[#f0f0ee] transition-colors hover:bg-[#fafaf9]",
        interactive &&
          "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ring) focus-visible:ring-inset",
        className,
      )}
      onClick={onClick}
      onKeyDown={interactive ? activate : onKeyDown}
      {...(interactive ? { tabIndex: 0 } : null)}
      {...props}
    />
  );
}

export function TableCell({
  className,
  first = false,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { first?: boolean }) {
  return (
    <td
      className={cn("py-row", first ? "px-rowx-first" : "px-rowx", className)}
      {...props}
    />
  );
}
