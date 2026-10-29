import { AlertTriangle, CheckCircle2, Inbox } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface StateProps {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: { label: string; onClick: () => void };
  className?: string;
}

function StateBase({
  title,
  description,
  icon: Icon,
  iconTone,
  action,
  actionVariant = "secondary",
  className,
}: StateProps & {
  iconTone: string;
  actionVariant?: "primary" | "secondary";
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {Icon && (
        <span aria-hidden="true" className={cn("grid h-11 w-11 place-items-center rounded-xl", iconTone)}>
          <Icon className="h-5 w-5" />
        </span>
      )}
      <div className="mt-3.5 text-[14px] font-semibold text-neutral-900">{title}</div>
      {description && (
        <p className="mt-1 max-w-sm text-[13px] leading-[1.5] text-[#5b606b]">{description}</p>
      )}
      {action && (
        <Button variant={actionVariant} className="mt-4" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

/**
 * Empty state — nothing to show yet. The icon takes the soft municipal tint
 * (24 Oct 2026), so an empty register still reads as part of the app rather
 * than a blank page; the action stays the page's primary one.
 */
export function EmptyState({ icon = Inbox, ...props }: StateProps) {
  return (
    <StateBase
      icon={icon}
      iconTone="bg-[#f8edef] text-[#a6323b]"
      actionVariant="primary"
      {...props}
    />
  );
}

/** Something went wrong — offers a retry action. */
export function ErrorState({ icon = AlertTriangle, ...props }: StateProps) {
  return <StateBase icon={icon} iconTone="bg-[#fdecec] text-[#b42318]" {...props} />;
}

/** Operation completed successfully. */
export function SuccessState({ icon = CheckCircle2, ...props }: StateProps) {
  return <StateBase icon={icon} iconTone="bg-[#eaf6ef] text-[#1f7a46]" {...props} />;
}
