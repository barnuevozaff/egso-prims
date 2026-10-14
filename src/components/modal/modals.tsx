import * as React from "react";
import { AlertTriangle, CheckCircle2, HelpCircle, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type ModalTone = "neutral" | "danger" | "success" | "warning";

const toneIconClasses: Record<ModalTone, string> = {
  neutral: "bg-neutral-100 text-neutral-600",
  danger: "bg-red-50 text-red-600",
  success: "bg-(--tone-settled-tint) text-(--tone-settled)",
  warning: "bg-amber-50 text-amber-600",
};

export interface ConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: ModalTone;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Hides the cancel button (e.g. success acknowledgement). */
  hideCancel?: boolean;
  /** Shown on the confirm button while an async action runs. */
  loading?: boolean;
  /** Keeps the confirm button shut, e.g. while the dialog explains why it cannot proceed. */
  confirmDisabled?: boolean;
  onConfirm?: () => void;
  children?: React.ReactNode;
}

/**
 * Centered confirmation dialog. DeleteModal / SuccessModal / WarningModal are
 * preconfigured variants of this component.
 */
export function ConfirmationModal({
  open,
  onOpenChange,
  title,
  description,
  icon: Icon = HelpCircle,
  tone = "neutral",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  hideCancel = false,
  loading = false,
  confirmDisabled = false,
  onConfirm,
  children,
}: ConfirmationModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-0 p-5" showCloseButton={false}>
        <span
          className={cn(
            "grid h-10 w-10 place-items-center rounded-full",
            toneIconClasses[tone],
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <DialogTitle className="mt-3 text-[14px] font-semibold text-neutral-900">
          {title}
        </DialogTitle>
        {description && (
          <DialogDescription className="mt-1 text-[12.5px] leading-relaxed text-neutral-500">
            {description}
          </DialogDescription>
        )}
        {children}
        <div className="mt-5 flex items-center justify-end gap-2">
          {!hideCancel && (
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
              {cancelLabel}
            </Button>
          )}
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            loading={loading}
            disabled={confirmDisabled}
            onClick={onConfirm ?? (() => onOpenChange(false))}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type VariantProps = Omit<ConfirmationModalProps, "icon" | "tone">;

/** Destructive confirmation (red). */
export function DeleteModal({
  confirmLabel = "Delete",
  ...props
}: VariantProps) {
  return (
    <ConfirmationModal icon={Trash2} tone="danger" confirmLabel={confirmLabel} {...props} />
  );
}

/** Success acknowledgement (emerald, no cancel). */
export function SuccessModal({
  confirmLabel = "Done",
  hideCancel = true,
  ...props
}: VariantProps) {
  return (
    <ConfirmationModal
      icon={CheckCircle2}
      tone="success"
      confirmLabel={confirmLabel}
      hideCancel={hideCancel}
      {...props}
    />
  );
}

/** Cautionary confirmation (amber). */
export function WarningModal({
  confirmLabel = "Proceed",
  ...props
}: VariantProps) {
  return (
    <ConfirmationModal
      icon={AlertTriangle}
      tone="warning"
      confirmLabel={confirmLabel}
      {...props}
    />
  );
}
