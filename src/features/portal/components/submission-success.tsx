import * as React from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Copy } from "lucide-react";

import { PageTransition, toast } from "@/components";
import { rememberFiling } from "@/features/portal/recent";
import { cn } from "@/lib/utils";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/**
 * The frame every inner portal page shares: the crimson band from the home
 * page, carrying the page's title and a way back to all services, then the
 * page's own content on the canvas below.
 *
 * The band is full width and its text shares the content's measure, so the
 * title and the form beneath it start on the same left edge.
 */
export function PortalPage({
  title,
  description,
  width = "wide",
  children,
}: {
  title: string;
  description?: string;
  /**
   * `form` matches the filing wizards, which cap themselves at 48rem: the
   * extra 4rem is the container's own side padding, so the title starts on
   * the wizard's left edge. `narrow` is for a single-column task such as
   * tracking; `wide` for a page with full-width content, like the calendar.
   */
  width?: "wide" | "form" | "narrow";
  children: React.ReactNode;
}) {
  // `wide` matches the masthead's 1120px measure, so the page title and the
  // seal start on the same left edge.
  const measure =
    width === "narrow" ? "max-w-2xl" : width === "form" ? "max-w-[52rem]" : "max-w-[1120px]";
  const gutter = width === "wide" ? "px-5 sm:px-6" : "px-5 md:px-8";
  return (
    <div className="flex flex-1 flex-col">
      {/* White like the home page since 14 Oct 2026; the band was crimson, and
          an ink band once the accent turned ink would have been the heaviest
          thing on every form. */}
      <section className="border-b border-[#ececea] bg-white text-neutral-900 print:hidden">
        <div className={cn("mx-auto w-full pb-8 pt-6", gutter, measure)}>
          <Link
            to="/portal"
            // 40px to hit; the negative margins keep it where the 22px link sat.
            className="-mx-2 -my-2 inline-flex h-10 items-center gap-1.5 rounded-md px-2 text-[13px] text-[#5b606b] transition-colors hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ring)"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All services
          </Link>
          <h1 className="mt-3 text-[28px] font-semibold tracking-[-0.025em] text-balance md:text-[32px]">
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-pretty text-[#5b606b]">
              {description}
            </p>
          )}
        </div>
      </section>
      <PageTransition className={cn("mx-auto w-full py-8", gutter, measure)}>
        {children}
      </PageTransition>
    </div>
  );
}

/** The receipt's heading, from the reference number's prefix. */
function receiptTitle(reference: string): string {
  if (reference.startsWith("PR-")) return "Purchase request submitted";
  if (reference.startsWith("RIS-")) return "Requisition submitted";
  if (reference.startsWith("FR-")) return "Reservation request submitted";
  return "Request submitted";
}

/**
 * The receipt, approved 14 Oct 2026 (canvas "Portal Home Redesign", Wow #1).
 *
 * The reference number is the thing to keep, so it is the largest text and has
 * its own Copy button. The number is also remembered on this computer for the
 * home page's "Filed on this computer" list. The QR code and Print receipt
 * were removed on 18 Oct 2026 at the owner's request.
 */
export function SubmissionSuccess({
  reference,
  message,
}: {
  reference: string;
  message: string;
}) {
  const reduce = useReducedMotion();
  const [copied, setCopied] = React.useState(false);
  const trackPath = `/portal/track?ref=${encodeURIComponent(reference)}`;

  React.useEffect(() => {
    rememberFiling(reference);
  }, [reference]);

  React.useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);
    } catch {
      toast.error("Could not copy. Select the number and copy it instead.");
    }
  };

  return (
    <motion.article
      aria-labelledby="receipt-title"
      initial={reduce ? false : { opacity: 0, transform: "translateY(8px)" }}
      animate={{ opacity: 1, transform: "translateY(0px)" }}
      transition={{ duration: 0.36, ease: EASE_OUT }}
      className="mx-auto w-full max-w-[720px] overflow-hidden rounded-2xl border border-[#e4e4e1] bg-white shadow-[0_1px_2px_rgba(22,24,29,0.04),0_16px_40px_-20px_rgba(22,24,29,0.16)] print:shadow-none"
    >
      <div className="flex flex-wrap items-center gap-8 p-6 sm:p-10">
        <div className="min-w-0 flex-[1_1_320px]">
          <motion.span
            initial={reduce ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.1, ease: EASE_OUT }}
            className="grid h-11 w-11 place-items-center rounded-full bg-neutral-900 text-white"
          >
            <Check aria-hidden="true" className="h-[22px] w-[22px]" strokeWidth={2.5} />
          </motion.span>
          <h2
            id="receipt-title"
            className="mt-5 text-[28px] font-semibold leading-[1.15] tracking-[-0.025em]"
          >
            {receiptTitle(reference)}
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-[#5b606b]">{message}</p>

          <p className="mb-2 mt-7 text-[13px] text-[#5b606b]">Reference number</p>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-['Geist_Mono',ui-monospace,monospace] text-[26px] font-semibold tracking-[0.01em] select-all">
              {reference}
            </span>
            <button
              type="button"
              onClick={copy}
              className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-[#d4d5d2] bg-white px-3 text-[13px] font-medium text-neutral-900 transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 print:hidden"
            >
              {copied ? (
                <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.5} />
              ) : (
                <Copy aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
            {/* Screen readers hear the change; the button label alone swaps silently. */}
            <span role="status" className="sr-only">
              {copied ? "Reference number copied" : ""}
            </span>
          </div>
          <p className="mt-2 text-[13px] text-[#5b606b]">
            Keep this number. It is also saved on this computer.
          </p>
        </div>

      </div>

      <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-[#ececea] bg-[#fbfbfa] px-6 py-5 sm:px-10 print:hidden">
        <div className="flex flex-wrap gap-2.5">
          <Link
            to={trackPath}
            className="group inline-flex h-11 items-center gap-2 rounded-[10px] bg-neutral-900 px-[18px] text-[15px] font-medium text-white transition-[background-color,transform] duration-150 hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 active:scale-[0.98]"
          >
            Track this request
            <ArrowRight
              aria-hidden="true"
              className="h-4 w-4 transition-transform duration-150 ease-out group-hover:translate-x-[3px]"
            />
          </Link>
        </div>
        <Link
          to="/portal"
          className="rounded-md px-1 py-2.5 text-[14px] text-[#5b606b] transition-colors hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
        >
          Back to all services
        </Link>
      </div>
    </motion.article>
  );
}
