import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, ChevronRight, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { Skeleton, toast } from "@/components";
import { PORTAL_SERVICES, type PortalService } from "@/features/portal/data";
import {
  clearFilings,
  restoreFilings,
  useFiledRequests,
  type FiledRequest,
} from "@/features/portal/recent";
import { standingOf, trackReference, type TrackResult } from "@/features/portal/track";
import { cn } from "@/lib/utils";

/**
 * The staff portal's home, approved 14 Oct 2026 (canvas "Portal Home
 * Redesign"). White page, ink actions, the seal the only colour.
 *
 * Tracking sits under the question because it is the one thing a returning
 * filer comes for; the three filings follow as cards; the steps close the page
 * so a first-time filer knows what happens after they submit.
 */

/** Strong ease-out: things arrive quickly and settle. */
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const FILING = PORTAL_SERVICES.filter((s) => s.kind === "filing");
const TRACKING = PORTAL_SERVICES.find((s) => s.kind === "lookup");

/** What a filer does, start to finish. */
const STEPS = [
  { title: "Choose a service", body: "Pick the form that matches what your office needs." },
  { title: "Complete and submit", body: "You get a receipt with a reference number right away." },
  { title: "Track it here", body: "Enter the reference number above to see where it is." },
] as const;

/** A reference number as the office writes it: trimmed and in capitals. */
const normaliseReference = (value: string) => value.trim().toUpperCase();

/** Arrive once, in reading order, from a small offset. Nothing loops. */
function Reveal({
  index,
  className,
  children,
}: {
  index: number;
  className?: string;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, transform: "translateY(8px)" }}
      animate={{ opacity: 1, transform: "translateY(0px)" }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: EASE_OUT }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function TrackForm({ service }: { service: PortalService }) {
  const navigate = useNavigate();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [reference, setReference] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const ref = normaliseReference(reference);
    if (!ref) {
      setError("Enter the reference number from your receipt.");
      inputRef.current?.focus();
      return;
    }
    // The Track page searches on arrival when it is given ?ref=.
    navigate(`${service.to}?ref=${encodeURIComponent(ref)}`);
  };

  return (
    <form onSubmit={submit} noValidate className="mt-10 max-w-[560px]">
      <label htmlFor="portal-track-ref" className="mb-2 block text-[14px] font-medium">
        Track a request
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          id="portal-track-ref"
          value={reference}
          onChange={(e) => {
            setReference(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Reference number, e.g. PR-2026-000214"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "portal-track-error" : "portal-track-hint"}
          className="h-12 min-w-0 flex-[1_1_280px] rounded-[10px] border border-[#d4d5d2] bg-white px-4 text-[15px] uppercase text-neutral-900 transition-[border-color,box-shadow] duration-150 placeholder:normal-case placeholder:text-[#6b707a] focus:border-neutral-900 focus:outline-none focus:ring-4 focus:ring-neutral-900/10 aria-invalid:border-red-600 aria-invalid:ring-red-600/15"
        />
        <button
          type="submit"
          className="h-12 rounded-[10px] bg-neutral-900 px-[22px] text-[15px] font-medium text-white transition-[background-color,transform] duration-150 hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 active:scale-[0.98]"
        >
          Track
        </button>
      </div>
      {error ? (
        <p id="portal-track-error" role="alert" className="mt-2 text-[13px] text-red-700">
          {error}
        </p>
      ) : (
        <p id="portal-track-hint" className="mt-2 text-[13px] text-[#5b606b]">
          The reference number is printed on your receipt.
        </p>
      )}
    </form>
  );
}

function FilingCard({ service }: { service: PortalService }) {
  const Icon = service.icon;
  return (
    // The card is not a link; only its button opens the form (owner's call:
    // a stray click on the card should not start a filing).
    // No hover lift: the card is not clickable, and a lift would say it is.
    <div className="flex h-full flex-col rounded-[14px] border border-[#e4e4e1] bg-white p-5 shadow-[0_1px_2px_rgba(22,24,29,0.04)] sm:p-7">
      <div className="flex items-center justify-between">
        <span className="grid h-10 w-10 place-items-center rounded-[10px] border border-[#e4e4e1] text-neutral-900">
          <Icon className="h-5 w-5" />
        </span>
        <span className="font-['Geist_Mono',ui-monospace,monospace] text-[12px] font-medium tracking-[0.04em] text-[#5b606b]">
          {service.code}
        </span>
      </div>
      <h3 className="mt-4 text-[19px] sm:mt-6 font-semibold tracking-[-0.015em]">{service.title}</h3>
      <p className="mt-2 flex-1 text-[15px] leading-relaxed text-[#5b606b]">{service.description}</p>
      <Link
        to={service.to}
        className="group mt-5 inline-flex h-11 sm:mt-7 items-center gap-2 self-start rounded-[10px] bg-neutral-900 px-[18px] text-[15px] font-medium text-white transition-[background-color,transform] duration-150 hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 active:scale-[0.98]"
      >
        {service.cta}
        <ArrowRight
          aria-hidden="true"
          className="h-4 w-4 transition-transform duration-150 ease-out group-hover:translate-x-[3px]"
        />
      </Link>
    </div>
  );
}

type RecentRow =
  | { reference: string; state: "loading" }
  | { reference: string; state: "missing" }
  | { reference: string; state: "found"; result: TrackResult };

/** "Updated 2 hours ago", from the document's own last change. */
const updatedAgo = (iso: string) =>
  `Updated ${formatDistanceToNow(new Date(iso), { addSuffix: true })}`;

function StatusPill({ result }: { result: TrackResult }) {
  const standing = standingOf(result.timeline);
  // Icon and word together: the pill never relies on colour alone.
  if (standing === "stopped") {
    return (
      <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2 text-[12px] font-medium text-red-700">
        <X aria-hidden="true" className="h-3 w-3" strokeWidth={3} />
        {result.status}
      </span>
    );
  }
  if (standing === "finished") {
    return (
      <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-neutral-900 px-2 text-[12px] font-medium text-white">
        <Check aria-hidden="true" className="h-3 w-3" strokeWidth={3} />
        {result.status}
      </span>
    );
  }
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-[#d4d5d2] bg-white px-2 text-[12px] font-medium">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-neutral-900" />
      {result.status}
    </span>
  );
}

/**
 * Wow #2 (approved 14 Oct 2026): the requests filed from this computer, with
 * their live status. Hidden until something has been filed here.
 */
function FiledOnThisComputer({ filed }: { filed: FiledRequest[] }) {
  const [rows, setRows] = React.useState<RecentRow[]>([]);
  const key = filed.map((f) => f.reference).join(",");

  React.useEffect(() => {
    let alive = true;
    const refs = key ? key.split(",") : [];
    setRows(refs.map((reference) => ({ reference, state: "loading" })));
    const load = () =>
      Promise.all(
        refs.map(async (reference): Promise<RecentRow> => {
          try {
            const result = await trackReference(reference);
            return result
              ? { reference, state: "found", result }
              : { reference, state: "missing" };
          } catch {
            return { reference, state: "missing" };
          }
        }),
      ).then((next) => alive && setRows(next));
    void load();
    // Coming back to the tab is when a filer expects news: look again then.
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key]);

  return (
    <section
      aria-labelledby="filed-title"
      className="rounded-[14px] border border-[#e4e4e1] bg-white shadow-[0_1px_2px_rgba(22,24,29,0.04),0_8px_24px_-12px_rgba(22,24,29,0.10)]"
    >
      <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
        <div>
          <h2 id="filed-title" className="text-[15px] font-semibold">
            Filed on this computer
          </h2>
          <p className="mt-1 text-[13px] text-[#5b606b]">
            The status updates on its own. No need to look for the receipt.
          </p>
        </div>
        {filed.length > 0 && (
          <button
            type="button"
            onClick={() => {
              // Shared office PCs are why the list can be cleared; a slip of
              // the mouse should not cost anyone their numbers, so it can be undone.
              const cleared = clearFilings();
              toast("List cleared", {
                duration: 5000,
                action: { label: "Undo", onClick: () => restoreFilings(cleared) },
              });
            }}
            className="h-11 shrink-0 rounded-lg px-2.5 text-[13px] text-[#5b606b] transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
          >
            Clear list
          </button>
        )}
      </div>
      {filed.length === 0 && (
        // Desktop only (the parent hides it below lg): it fills the hero's
        // right half and tells a first-time filer the list exists.
        <div className="px-5 pb-5">
          <ul aria-hidden="true" className="list-none space-y-2">
            {[0, 1, 2].map((i) => (
              <li
                key={i}
                className="flex items-center gap-3.5 rounded-[10px] border border-dashed border-[#e4e4e1] px-3 py-3.5"
              >
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-28 rounded-full bg-[#ececea]" />
                  <div className="h-3 w-48 max-w-full rounded-full bg-[#f3f3f1]" />
                </div>
                <div className="h-6 w-20 rounded-full bg-[#f3f3f1]" />
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[14px] leading-relaxed text-[#5b606b]">
            Nothing filed from this computer yet. Requests you submit here appear in this list
            with their status.
          </p>
        </div>
      )}
      <ul className="list-none px-2 pb-2">
        {rows.map((row) => (
          <li key={row.reference}>
            <Link
              to={`/portal/track?ref=${encodeURIComponent(row.reference)}`}
              className="flex min-h-11 items-center gap-3.5 rounded-[10px] px-3 py-3.5 transition-colors hover:bg-[#f7f7f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-900"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-['Geist_Mono',ui-monospace,monospace] text-[13px] font-medium">
                    {row.reference}
                  </span>
                  {row.state === "found" && <StatusPill result={row.result} />}
                  {row.state === "loading" && <Skeleton className="h-6 w-24 rounded-full" />}
                </div>
                {row.state === "found" && (
                  <p className="mt-1 truncate text-[14px] text-[#5b606b]">{row.result.title}</p>
                )}
                {row.state === "missing" && (
                  <p className="mt-1 text-[14px] text-[#5b606b]">
                    Status not available. Open it to try again.
                  </p>
                )}
              </div>
              {row.state === "found" && (
                <span className="hidden whitespace-nowrap text-[12px] text-[#5b606b] sm:inline">
                  {updatedAgo(row.result.updatedAt)}
                </span>
              )}
              <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[#5b606b]" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PortalHome() {
  const filed = useFiledRequests();
  const hasFiled = filed.length > 0;
  return (
    <div className="flex flex-1 flex-col bg-white">
      <section className="mx-auto grid w-full max-w-[1120px] items-start gap-10 px-5 pb-16 pt-14 sm:px-6 sm:pb-[72px] sm:pt-[88px] lg:grid-cols-2 lg:gap-14">

        <Reveal index={0}>
          <h1 className="max-w-[720px] text-balance text-[36px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[52px]">
            What do you need from the&nbsp;GSO?
          </h1>
          <p className="mt-[18px] max-w-[560px] text-[17px] leading-relaxed text-[#5b606b] sm:text-[18px]">
            File a request, or follow one you already submitted. No account needed.
          </p>
          {TRACKING && <TrackForm service={TRACKING} />}
        </Reveal>
        {/* On a phone the empty panel would only push the services down. */}
        <Reveal index={1} className={cn(!hasFiled && "hidden lg:block")}>
          <FiledOnThisComputer filed={filed} />
        </Reveal>
      </section>

      <section className="border-y border-[#ececea] bg-[#f7f7f6]">
        <div className="mx-auto w-full max-w-[1120px] px-5 pb-16 pt-14 sm:px-6">
          <h2 className="mb-5 text-[15px] font-semibold">Start a new request</h2>
          <ul className="grid list-none gap-4 md:grid-cols-3">
            {FILING.map((s, i) => (
              <li key={s.to} className="min-w-0">
                <Reveal index={i + 1} className="h-full">
                  <FilingCard service={s} />
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1120px] px-5 pb-[72px] pt-14 sm:px-6">
        <h2 className="mb-6 text-[15px] font-semibold">How a request goes</h2>
        <ol className="grid list-none gap-8 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="border-t border-[#e4e4e1] pt-4">
              <span aria-hidden="true" className="font-['Geist_Mono',ui-monospace,monospace] text-[12px] font-medium text-neutral-900">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="mt-2 text-[15px] font-semibold">{step.title}</p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-[#5b606b]">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
