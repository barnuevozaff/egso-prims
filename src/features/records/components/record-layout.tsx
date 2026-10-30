import { useNavigate } from "react-router-dom";
import { Archive, CheckCircle2, Crosshair, Send, Undo2 } from "lucide-react";

import { Button, ConfirmationModal, StatusBadge, WarningModal, type DocumentStatus } from "@/components";
import { docTone } from "@/features/records/components/room/room-format";
import { DOC_TYPES, type DocType, type DocumentLocation } from "@/features/records/shelf-types";
import type { RecordsDocStatus } from "@/features/records/types";
import { filingState, statusNote, type RecordAction } from "@/features/records/workflow";
import { cn } from "@/lib/utils";

/**
 * A Records Management form on its page, and beside it the panel that says
 * where it stands and what to do next (30 Oct 2026). The record page and the
 * form being filled in share the layout and the panel's parts.
 *
 * The sheet is a fixed paper width. Where the window has room for both, the
 * panel stands to its right and stays in view while the sheet scrolls; where
 * it has not — the landscape inventory on most screens, a tablet — the panel
 * becomes a bar above the sheet, still in view on a desktop. Container
 * queries, not the window, decide it, so the sidebar is allowed for.
 */
export function RecordLayout({
  orientation = "portrait",
  panel,
  children,
}: {
  orientation?: "portrait" | "landscape";
  panel: React.ReactNode;
  children: React.ReactNode;
}) {
  const landscape = orientation === "landscape";
  return (
    <div className="@container">
      <div
        className={cn(
          "grid grid-cols-[minmax(0,1fr)] items-start justify-start gap-5",
          // The sheet at its paper width (210 or 297mm), the gap and a panel of
          // at least 300px; the sheet column is fixed so the panel never takes
          // width from the paper.
          landscape
            ? "@min-[1447px]:grid-cols-[297mm_minmax(300px,360px)] @min-[1447px]:gap-6"
            : "@min-[1118px]:grid-cols-[210mm_minmax(300px,360px)] @min-[1118px]:gap-6",
        )}
      >
        {/* Sticky offsets count from inside the page's 24px padding: the bar
            sits flush under the top bar, the side panel 24px below it. */}
        <div
          className={cn(
            "z-20 @min-[900px]:sticky @min-[900px]:-top-6",
            landscape ? "@min-[1447px]:order-2 @min-[1447px]:top-6" : "@min-[1118px]:order-2 @min-[1118px]:top-6",
          )}
        >
          {panel}
        </div>
        <div className={cn("min-w-0 space-y-3", landscape ? "@min-[1447px]:order-1" : "@min-[1118px]:order-1")}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** A section of the panel: ruled off when it reads top to bottom, open when it is one row. */
const SECTION = "border-t border-[#f0f0ee] px-5 py-4 @min-[640px]:border-0 @min-[640px]:p-0";

/**
 * The panel itself. Narrow (beside the sheet) it reads top to bottom; wide
 * (a bar above the sheet) its sections stand in one row.
 */
export function PanelShell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <aside aria-label={label} className="@container rounded-[14px] border border-[#e6e6e3] bg-white print:hidden">
      <div className="flex flex-col @min-[640px]:flex-row @min-[640px]:flex-wrap @min-[640px]:items-center @min-[640px]:gap-x-6 @min-[640px]:gap-y-3 @min-[640px]:px-5 @min-[640px]:py-3.5">
        {children}
      </div>
    </aside>
  );
}

export function PanelSection({ label, className, children }: { label?: string; className?: string; children: React.ReactNode }) {
  return (
    <section aria-label={label} className={cn(SECTION, className)}>
      {children}
    </section>
  );
}

/** What it is and where it stands: kind, number (when it has one), status and the one line on what comes next. */
export function PanelHead({
  kind,
  number,
  status,
  compact = false,
}: {
  kind: DocType;
  number?: string;
  /** Null for a form not saved yet. */
  status: RecordsDocStatus | null;
  /** Status and its line only, where the page title already names the form. */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="min-w-0 px-5 pb-4 pt-5 @min-[640px]:min-w-[240px] @min-[640px]:flex-1 @min-[640px]:p-0">
        <div className="text-[12px] text-[#6b707a]">Status</div>
        <div className="mt-1">{status ? <StatusBadge status={status as DocumentStatus} /> : null}</div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-[#5b606b]">{statusNote(status)}</p>
      </div>
    );
  }
  return (
    <div className="min-w-0 px-5 pb-4 pt-5 @min-[640px]:min-w-[240px] @min-[640px]:flex-1 @min-[640px]:p-0">
      <div className="flex items-center gap-2 text-[12.5px] text-[#5b606b]">
        <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", docTone(kind))} />
        {DOC_TYPES[kind].name}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {/* Geist Mono for the document number only (design system). */}
        {number ? (
          <span className="font-['Geist_Mono',ui-monospace,monospace] text-[16px] font-semibold text-neutral-900">{number}</span>
        ) : (
          <span className="text-[16px] font-semibold text-neutral-900">New form</span>
        )}
        {status ? <StatusBadge status={status as DocumentStatus} /> : <span className="text-[12.5px] text-[#5b606b]">Not saved</span>}
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-[#5b606b]">{statusNote(status)}</p>
    </div>
  );
}

/** The figures beside the sheet. Above it, as a bar, they would only repeat the sheet. */
export function PanelFacts({ facts }: { facts: { label: string; value: React.ReactNode }[] }) {
  if (facts.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-[#f0f0ee] px-5 py-4 text-[13px] @min-[640px]:hidden">
      {facts.map((f) => (
        <div key={f.label} className="min-w-0">
          <dt className="text-[12px] text-[#6b707a]">{f.label}</dt>
          <dd className="truncate tabular-nums text-neutral-900">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One workflow step as a button: the next step solid, a return in warm text, the rest quiet. */
export function StepButton({
  action,
  primary,
  busy,
  disabled,
  onClick,
}: {
  action: RecordAction;
  primary: boolean;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const back = action.kind === "back";
  return (
    <Button
      variant={primary ? "primary" : back ? "outline" : "secondary"}
      className={cn("h-11 w-full text-[13px] @min-[640px]:w-auto", back && "text-[#9a3412] hover:text-[#7c2d12]")}
      onClick={onClick}
      disabled={disabled}
      loading={busy}
    >
      {back ? <Undo2 /> : action.to === "Approved" && primary ? <CheckCircle2 /> : action.to === "Submitted" && primary ? <Send /> : null}
      {action.label}
    </Button>
  );
}

/** Approving and returning are asked first, in the step's own words. */
export function StepConfirm({
  asking,
  onClose,
  onConfirm,
}: {
  asking: RecordAction | null;
  onClose: () => void;
  onConfirm: (action: RecordAction) => void;
}) {
  if (!asking?.confirm) return null;
  const props = {
    open: true,
    onOpenChange: (o: boolean) => !o && onClose(),
    title: asking.confirm.title,
    description: asking.confirm.description,
    confirmLabel: asking.confirm.confirmLabel,
    onConfirm: () => onConfirm(asking),
  };
  return asking.kind === "back" ? <WarningModal {...props} /> : <ConfirmationModal {...props} tone="success" icon={CheckCircle2} />;
}

/**
 * The form and the Records Room: in a box (where, and Locate), approved and
 * waiting (Place), or not eligible yet and why. Only an approved form is
 * offered Place — placeRecordDocument refuses the rest the same way.
 */
export function RoomBlock({
  kind,
  docId,
  status,
  location,
  canManage,
  placeVariant = "primary",
}: {
  kind: DocType;
  docId?: string;
  status: RecordsDocStatus;
  /** `undefined` while it is read, `null` when it is in no box. */
  location: DocumentLocation | null | undefined;
  canManage: boolean;
  /** Primary on the record page, where placing is the next step; secondary beside a form's Save. */
  placeVariant?: "primary" | "secondary";
}) {
  const navigate = useNavigate();
  const key = docId ? `${kind}-${docId}` : "";
  const filing = filingState(status, !!location);

  return (
    <PanelSection label="Records Room" className="@min-[640px]:max-w-[420px]">
      <div className="text-[12px] text-[#6b707a]">Records Room</div>
      {location === undefined ? (
        <div className="mt-1.5 h-5 w-44 rounded bg-[#f0f0ee]" />
      ) : (
        <>
          <div className="mt-0.5 text-[13.5px] font-medium text-neutral-900">{filing.title}</div>
          {location && (
            <div className="mt-0.5 text-[13px] text-neutral-900">
              {location.shelfName} › {location.levelTitle} › {location.boxName}
            </div>
          )}
          {filing.note && <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#5b606b]">{filing.note}</p>}
          {filing.canPlace &&
            (canManage && docId ? (
              <Button
                variant={placeVariant}
                className="mt-3 h-11 w-full text-[13px] @min-[640px]:w-auto"
                onClick={() => navigate(`/records?place=${encodeURIComponent(key)}`)}
              >
                <Archive />
                Place in the Records Room
              </Button>
            ) : (
              <p className="mt-1 text-[12.5px] text-[#5b606b]">An Administrator places it in a box.</p>
            ))}
          {filing.canLocate && location && (
            <Button
              variant="secondary"
              className="mt-3 h-11 w-full text-[13px] @min-[640px]:w-auto"
              onClick={() =>
                navigate(
                  `/records?shelf=${encodeURIComponent(location.shelfId)}&box=${encodeURIComponent(location.positionKey)}&doc=${encodeURIComponent(key)}`,
                )
              }
            >
              <Crosshair />
              Locate in the Records Room
            </Button>
          )}
        </>
      )}
    </PanelSection>
  );
}
