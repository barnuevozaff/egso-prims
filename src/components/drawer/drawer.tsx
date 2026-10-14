import * as React from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Caption } from "@/components/typography/typography";

// Centered-modal widths. `2xl` is a comfortable large panel that keeps content
// from looking sparse; `wide` nearly fills the screen for drawers with wide
// tables (submeter breakdowns, the Smart Import preview) so they don't scroll.
const sizeClasses = {
  sm: "sm:max-w-md",
  md: "sm:max-w-2xl",
  lg: "sm:max-w-4xl",
  "2xl": "sm:max-w-5xl",
  wide: "w-[94vw] sm:max-w-[1500px]",
} as const;

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  size?: keyof typeof sizeClasses;
  children: React.ReactNode;
}

/**
 * Centered modal panel for record details and contextual work. Compose with
 * DrawerHeader / DrawerBody / DrawerFooter — the header/footer stay fixed and
 * the body scrolls within a 90vh box.
 */
export function Drawer({ open, onOpenChange, size = "md", children }: DrawerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "flex max-h-[90vh] w-full flex-col gap-0 overflow-hidden p-0",
          sizeClasses[size],
        )}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function DrawerHeader({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose?: () => void;
  /** Extra header content (e.g. status badge) rendered under the title row. */
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-neutral-100 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <DialogTitle className="text-[14px] font-semibold text-neutral-900">
            {title}
          </DialogTitle>
          {description && <Caption as="p" className="mt-0.5">{description}</Caption>}
        </div>
        {onClose && (
          <button
            aria-label="Close panel"
            onClick={onClose}
            className="rounded-md p-1.5 text-neutral-500 transition hover:bg-neutral-100"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

export function DrawerBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex-1 overflow-y-auto px-5 py-4", className)}>{children}</div>
  );
}

export function DrawerFooter({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("border-t border-neutral-100 px-5 py-4", className)}>{children}</div>
  );
}

/** Right-aligned action row for a drawer footer. */
export function DrawerActions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>;
}
