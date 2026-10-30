import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, Clock3, Undo2, X } from "lucide-react";

import { Skeleton, Spinner, type ApprovalTimelineStep } from "@/components";
import {
  standingOf,
  trackReference,
  type Standing,
  type TrackResult,
} from "@/features/portal/track";
import { PortalPage } from "@/features/portal/components/submission-success";
import { FiledOnThisComputer } from "@/features/portal/components/filed-on-this-computer";
import { useFiledRequests } from "@/features/portal/recent";
import { cn } from "@/lib/utils";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/** A reference number as the office writes it: trimmed and in capitals. */
const normaliseReference = (value: string) => value.trim().toUpperCase();

/**
 * Public read-only tracking by reference number (PR / PO / RIS / FR).
 *
 * The page stays in the ink world of the home page's tracking card: crimson
 * starts a document, ink follows one. On the progress list ink means "done",
 * an ink outline means "with this office now", a hairline circle means "not
 * yet", and red means the request was stopped.
 */
export function PortalTrackPage() {
  const [params, setParams] = useSearchParams();
  const reduce = useReducedMotion();
  const filed = useFiledRequests();
  /** The reference last searched, so writing it to ?ref= does not search again. */
  const lastLinked = React.useRef<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [ref, setRef] = React.useState(params.get("ref") ?? "");
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<TrackResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const search = React.useCallback(
    async (value: string) => {
      const reference = normaliseReference(value);
      if (!reference) {
        setResult(null);
        setError("Enter the reference number from your receipt.");
        inputRef.current?.focus();
        return;
      }
      lastLinked.current = reference;
      setLoading(true);
      setError(null);
      // Keep the address in step with what is shown, so a reload or a copied
      // link opens the same request.
      setParams({ ref: reference }, { replace: true });
      const found = await trackReference(reference);
      setResult(found);
      setLoading(false);
      if (!found) {
        setError(
          `No request has the number ${reference}. Check your receipt: it starts with PR-, PO-, RIS- or FR-.`,
        );
        inputRef.current?.focus();
      }
    },
    [setParams],
  );

  // Search when the address names a reference: on arrival (from the home
  // page or a receipt) and when a row in "Requests from this device" is picked.
  // search() records what it searched, so its own ?ref= write is skipped.
  const linked = params.get("ref");
  React.useEffect(() => {
    if (!linked || linked === lastLinked.current) return;
    lastLinked.current = normaliseReference(linked);
    setRef(linked);
    void search(linked);
  }, [linked, search]);

  return (
    <PortalPage
      title="Track a Request"
      description="Enter the reference number from your receipt to see where it is now."
    >
      {/* grid-cols-1 (minmax(0, 1fr)) keeps a long title in the side panel
          from widening the page past a phone's screen. */}
      <div className="grid w-full grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void search(ref);
            }}
            noValidate
            className="rounded-[14px] border border-[#e4e4e1] bg-white p-5 sm:p-6"
          >
            <label htmlFor="track-ref" className="block text-[14px] font-medium text-neutral-900">
              Reference number
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                ref={inputRef}
                id="track-ref"
                placeholder="e.g. PR-2026-000214"
                value={ref}
                onChange={(e) => {
                  setRef(e.target.value);
                  if (error) setError(null);
                }}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "track-ref-error" : "track-ref-helper"}
                className="h-11 min-w-0 flex-1 rounded-[10px] border border-[#d4d5d2] bg-white px-3.5 font-['Geist_Mono',ui-monospace,monospace] text-[15px] uppercase text-neutral-900 transition-[border-color,box-shadow] placeholder:font-['Geist',ui-sans-serif,system-ui,sans-serif] placeholder:normal-case placeholder:text-[#6b707a] focus:border-[#a7353b] focus:outline-none focus:ring-4 focus:ring-[#a7353b]/15 aria-invalid:border-red-600 aria-invalid:ring-red-600/15"
              />
              <button
                type="submit"
                disabled={loading}
                className="group inline-flex h-11 shrink-0 items-center gap-2 rounded-[10px] ui-accent ui-accent-hover px-[18px] text-[15px] font-medium transition-[background-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ring) focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-70"
              >
                Track
                {loading ? (
                  <Spinner size="sm" label="Searching" />
                ) : (
                  <ArrowRight className="h-[18px] w-[18px] transition-transform duration-150 ease-out group-hover:translate-x-[3px]" />
                )}
              </button>
            </div>
            {error ? (
              <p id="track-ref-error" role="alert" className="mt-1.5 text-[13px] text-red-700">
                {error}
              </p>
            ) : (
              <p id="track-ref-helper" className="mt-1.5 text-[13px] text-[#5b606b]">
                It starts with PR-, PO-, RIS- or FR-, and is printed on your receipt.
              </p>
            )}
          </form>

          {loading && <ResultSkeleton />}

          {!loading && result && (
            <motion.div
              initial={reduce ? false : { opacity: 0, transform: "translateY(8px)" }}
              animate={{ opacity: 1, transform: "translateY(0px)" }}
              transition={{ duration: 0.26, ease: EASE_OUT }}
            >
              <TrackResultCard result={result} />
            </motion.div>
          )}

          {!loading && !result && (
            // Holds the space the result will take, so the page is not a lone
            // field on an empty canvas at desktop widths.
            <div className="rounded-[14px] border border-dashed border-[#d4d5d2] px-6 py-10 text-center">
              <p className="text-[15px] font-medium text-neutral-900">The request's progress shows here</p>
              <p className="mt-1.5 text-[14px] text-[#5b606b]">
                Type a reference number above, or select one under Recent Requests.
              </p>
            </div>
          )}
        </div>

        <FiledOnThisComputer filed={filed} />
      </div>
    </PortalPage>
  );
}

function TrackResultCard({ result }: { result: TrackResult }) {
  const standing = standingOf(result.timeline);

  return (
    <article
      aria-labelledby="track-result-title"
      className="rounded-[14px] border border-[#e4e4e1] bg-white p-5 sm:p-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          {/* The document type belongs to the heading, not to a label above it. */}
          <h2
            id="track-result-title"
            className="text-[17px] font-semibold leading-snug text-neutral-900"
          >
            {/* On a phone the type and the number take a line each, so neither
                breaks in the middle. */}
            <span className="whitespace-nowrap font-medium text-neutral-500">{result.kind}</span>
            <span aria-hidden="true" className="mx-1.5 hidden text-neutral-300 sm:inline">
              ·
            </span>
            <span className="block whitespace-nowrap tabular-nums sm:inline">{result.number}</span>
          </h2>
          <p className="mt-1 text-pretty text-[14px] leading-relaxed text-neutral-600">
            {result.title}
          </p>
        </div>
        <StandingTag standing={standing} status={result.status} />
      </header>

      <dl className="mt-5 grid gap-4 border-t border-neutral-200 pt-5 sm:grid-cols-2">
        <div>
          <dt className="text-[13px] text-neutral-500">Now at</dt>
          <dd className="mt-0.5 text-[14px] font-medium text-neutral-900">
            {result.currentOffice}
          </dd>
        </div>
        <div>
          <dt className="text-[13px] text-neutral-500">Last update</dt>
          <dd className="mt-0.5 text-[14px] font-medium text-neutral-900">
            {result.latestEvent}
            <span className="block text-[12.5px] font-normal tabular-nums text-neutral-500">
              {format(new Date(result.updatedAt), "d MMM yyyy, h:mm a")}
            </span>
          </dd>
        </div>
      </dl>

      <section aria-labelledby="track-progress-title" className="mt-5 border-t border-neutral-200 pt-5">
        <h3 id="track-progress-title" className="text-[15px] font-semibold text-neutral-900">
          Progress
        </h3>
        <ProgressSteps steps={result.timeline} />
      </section>
    </article>
  );
}

/**
 * The document's status in words, with the icon that says which way it is
 * going. Ink while it moves or once it is done; red only when it was stopped.
 */
function StandingTag({ standing, status }: { standing: Standing; status: string }) {
  const Icon = standing === "stopped" ? X : standing === "finished" ? Check : Clock3;
  return (
    <p
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-semibold",
        standing === "stopped"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-neutral-300 bg-white text-neutral-900",
      )}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.5} />
      <span className="sr-only">Status: </span>
      {status}
    </p>
  );
}

const STEP_STATE_TEXT: Record<ApprovalTimelineStep["status"], string> = {
  approved: "Done",
  current: "In progress",
  pending: "Not yet",
  rejected: "Stopped",
  returned: "Returned for revision",
};

function ProgressSteps({ steps }: { steps: ApprovalTimelineStep[] }) {
  return (
    <ol className="mt-4 list-none">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const isCurrent = step.status === "current";
        return (
          <li
            key={`${step.label}-${i}`}
            aria-current={isCurrent ? "step" : undefined}
            className="relative flex gap-3.5 pb-5 last:pb-0"
          >
            {/* The rule below a finished step is ink, so the line itself shows
                how far the document has come. */}
            {!isLast && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute left-[13.5px] top-7 bottom-0 w-px",
                  step.status === "approved" ? "bg-neutral-900" : "bg-neutral-300",
                )}
              />
            )}
            <StepMarker status={step.status} />
            <div className="min-w-0 flex-1 pt-[3px]">
              <div className="flex flex-col gap-x-3 gap-y-0.5 sm:flex-row sm:items-baseline sm:justify-between">
                <p
                  className={cn(
                    "text-[14px] font-medium",
                    step.status === "pending" && "text-neutral-500",
                    step.status === "rejected" && "text-red-700",
                    (step.status === "approved" || step.status === "returned" || isCurrent) && "text-neutral-900",
                  )}
                >
                  {step.label}
                  <span className="sr-only">, {STEP_STATE_TEXT[step.status]}</span>
                  {isCurrent && (
                    <span
                      aria-hidden="true"
                      className="ml-2 inline-block rounded-md bg-neutral-100 px-1.5 py-px align-[1px] text-[12.5px] font-semibold text-neutral-700"
                    >
                      In progress
                    </span>
                  )}
                </p>
                {step.time && (
                  <p className="shrink-0 text-[12.5px] tabular-nums text-neutral-500">{step.time}</p>
                )}
              </div>
              {step.person && (
                <p className="mt-0.5 text-[13px] text-neutral-600">
                  {step.person.name}
                  {step.person.office && (
                    <span className="text-neutral-500"> · {step.person.office}</span>
                  )}
                </p>
              )}
              {step.remarks && (
                <p className="mt-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-[13px] leading-relaxed text-neutral-700">
                  “{step.remarks}”
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StepMarker({ status }: { status: ApprovalTimelineStep["status"] }) {
  const base = "relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full";
  if (status === "approved") {
    return (
      <span aria-hidden="true" className={cn(base, "bg-neutral-900 text-white")}>
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
    );
  }
  if (status === "current") {
    return (
      <span aria-hidden="true" className={cn(base, "border border-neutral-900 bg-white")}>
        <span className="h-2.5 w-2.5 rounded-full bg-neutral-900" />
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span aria-hidden="true" className={cn(base, "bg-red-700 text-white")}>
        <X className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
    );
  }
  if (status === "returned") {
    return (
      <span aria-hidden="true" className={cn(base, "border border-neutral-900 bg-white text-neutral-900")}>
        <Undo2 className="h-3.5 w-3.5" strokeWidth={2.5} />
      </span>
    );
  }
  return <span aria-hidden="true" className={cn(base, "border border-neutral-300 bg-white")} />;
}

/** The result card's shape while the request is being looked up. */
function ResultSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="rounded-[14px] border border-[#e4e4e1] bg-white p-5 sm:p-6"
    >
      <Skeleton className="h-5 w-64 max-w-full" />
      <Skeleton className="mt-2 h-4 w-40" />
      <div className="mt-5 grid gap-4 border-t border-neutral-200 pt-5 sm:grid-cols-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="mt-5 space-y-5 border-t border-neutral-200 pt-5">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-3.5">
            <Skeleton className="h-7 w-7 rounded-full" />
            <Skeleton className="h-4 w-48" />
          </div>
        ))}
      </div>
    </div>
  );
}
