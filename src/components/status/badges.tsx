import { cn } from "@/lib/utils";

/**
 * Status pill anatomy from the Design Foundation:
 * rounded-full, 50-tint background, 700 text, 500 dot, 11.5px medium.
 */
type Tone = "amber" | "emerald" | "blue" | "red" | "violet" | "neutral" | "sky" | "orange";

const pillTone: Record<Tone, string> = {
  amber: "bg-amber-50 text-amber-700",
  emerald: "bg-emerald-50 text-emerald-700",
  blue: "bg-blue-50 text-blue-700",
  red: "bg-red-50 text-red-700",
  violet: "bg-violet-50 text-violet-700",
  neutral: "bg-neutral-100 text-neutral-700",
  sky: "bg-sky-50 text-sky-700",
  orange: "bg-orange-50 text-orange-700",
};

const dotTone: Record<Tone, string> = {
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  blue: "bg-blue-500",
  red: "bg-red-500",
  violet: "bg-violet-500",
  neutral: "bg-neutral-500",
  sky: "bg-sky-500",
  orange: "bg-orange-500",
};

function Pill({
  tone,
  children,
  showDot = true,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  showDot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium",
        pillTone[tone],
        className,
      )}
    >
      {showDot && <span className={cn("h-1.5 w-1.5 rounded-full", dotTone[tone])} />}
      {children}
    </span>
  );
}

/* ---------------- Status Badge ---------------- */

export type DocumentStatus =
  | "Pending"
  | "Approved"
  | "For Review"
  | "Rejected"
  | "Draft"
  | "Completed"
  | "Cancelled"
  | "Submitted"
  | "Department Head Review"
  | "BAC Review"
  | "Budget Review"
  | "Pending Approval"
  | "Released"
  | "Available"
  | "Low Stock"
  | "Critical"
  | "Out of Stock"
  | "Information"
  | "Success"
  | "Warning"
  | "Error"
  | "Failed"
  | "Increased"
  | "Decreased"
  | "No Change"
  | "Active"
  | "Inactive"
  | "Archived"
  | "Paid"
  | "No Record"
  | "Returned";

const statusTone: Record<DocumentStatus, Tone> = {
  Pending: "amber",
  Approved: "emerald",
  "For Review": "blue",
  Rejected: "red",
  Draft: "neutral",
  Completed: "emerald",
  Cancelled: "neutral",
  Submitted: "blue",
  "Department Head Review": "amber",
  "BAC Review": "violet",
  "Budget Review": "sky",
  "Pending Approval": "amber",
  Released: "blue",
  Available: "emerald",
  "Low Stock": "amber",
  Critical: "orange",
  "Out of Stock": "red",
  Information: "blue",
  Success: "emerald",
  Warning: "amber",
  Error: "red",
  Failed: "red",
  // Energy consumption movement: a rise in spend is the exception to flag.
  Increased: "red",
  Decreased: "emerald",
  "No Change": "neutral",
  // Fuel vehicle registry / submeter state.
  Active: "emerald",
  Inactive: "neutral",
  Archived: "neutral",
  // Violation payment state. A profile with nothing on record is neither
  // settled nor outstanding, so it reads neutral rather than green.
  Paid: "emerald",
  "No Record": "neutral",
  // A disposition schedule the National Archives sent back for correction.
  // Not "Rejected" — the filing stands and is amended, so it reads as work
  // to redo rather than a refusal.
  Returned: "orange",
};

/**
 * A status is a coloured dot and the word, not a tinted pill (approved admin
 * design, 15 Oct 2026). The hue still carries the meaning; the word carries
 * it for anyone who cannot tell the hues apart.
 */
export function StatusBadge({
  status,
  className,
}: {
  status: DocumentStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 whitespace-nowrap text-[13px] text-neutral-800",
        className,
      )}
    >
      <span aria-hidden="true" className={cn("h-[7px] w-[7px] shrink-0 rounded-full", dotTone[statusTone[status] ?? "neutral"])} />
      {status}
    </span>
  );
}

/* ---------------- Priority Badge ---------------- */

export type Priority = "Low" | "Medium" | "High" | "Urgent";

const priorityTone: Record<Priority, Tone> = {
  Low: "neutral",
  Medium: "blue",
  High: "amber",
  Urgent: "red",
};

export function PriorityBadge({
  priority,
  className,
}: {
  priority: Priority;
  className?: string;
}) {
  return (
    <Pill tone={priorityTone[priority]} className={className}>
      {priority}
    </Pill>
  );
}

/* ---------------- Approval Badge ---------------- */

export type ApprovalState = "Awaiting" | "Endorsed" | "Approved" | "Returned" | "Denied";

const approvalTone: Record<ApprovalState, Tone> = {
  Awaiting: "amber",
  Endorsed: "blue",
  Approved: "emerald",
  Returned: "violet",
  Denied: "red",
};

export function ApprovalBadge({
  state,
  className,
}: {
  state: ApprovalState;
  className?: string;
}) {
  return (
    <Pill tone={approvalTone[state]} className={className}>
      {state}
    </Pill>
  );
}

/* ---------------- Notification Badge ---------------- */

const countTone: Record<"blue" | "green" | "orange" | "red", string> = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-green-50 text-green-600",
  orange: "bg-orange-50 text-orange-600",
  red: "bg-red-50 text-red-600",
};

const notifDotTone: Record<"blue" | "green" | "orange" | "red", string> = {
  blue: "bg-blue-500",
  green: "bg-green-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
};

export interface NotificationBadgeProps {
  /** Count chip; omit to render a plain dot indicator. */
  count?: number | string;
  color?: "blue" | "green" | "orange" | "red";
  className?: string;
}

/** Sidebar/nav count chip (`18`) or attention dot, per the Design Foundation. */
export function NotificationBadge({
  count,
  color = "blue",
  className,
}: NotificationBadgeProps) {
  if (count === undefined) {
    return (
      <span className={cn("h-1.5 w-1.5 rounded-full", notifDotTone[color], className)} />
    );
  }
  return (
    <span
      className={cn(
        "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
        countTone[color],
        className,
      )}
    >
      {count}
    </span>
  );
}
