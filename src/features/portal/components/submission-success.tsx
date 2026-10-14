import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft } from "lucide-react";

import { Button, PageTransition, SuccessState } from "@/components";
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
  const measure =
    width === "narrow" ? "max-w-2xl" : width === "form" ? "max-w-[52rem]" : "max-w-[1200px]";
  return (
    <div className="flex flex-1 flex-col">
      {/* White like the home page since 14 Oct 2026; the band was crimson, and
          an ink band once the accent turned ink would have been the heaviest
          thing on every form. */}
      <section className="border-b border-[#ececea] bg-white text-neutral-900">
        <div className={cn("mx-auto w-full px-5 pb-8 pt-6 md:px-8", measure)}>
          <Link
            to="/portal"
            className="-ml-1 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[13px] text-[#5b606b] transition-colors hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ring)"
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
      <PageTransition className={cn("mx-auto w-full px-5 py-8 md:px-8", measure)}>
        {children}
      </PageTransition>
    </div>
  );
}

/** Post-submission confirmation with the tracking reference number. */
export function SubmissionSuccess({
  reference,
  message,
}: {
  reference: string;
  message: string;
}) {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, transform: "translateY(8px)" }}
      animate={{ opacity: 1, transform: "translateY(0px)" }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
    >
      <div className="mx-auto w-full max-w-xl rounded-md border border-neutral-200 bg-white p-2">
        <SuccessState title="Request submitted" description={message} />
        <div className="px-6 pb-6 text-center">
          <p className="mb-1.5 text-[12.5px] text-neutral-500">Your reference number</p>
          <div className="mx-auto w-fit rounded-md border border-neutral-300 bg-neutral-50 px-5 py-2.5 text-[18px] font-semibold tabular-nums tracking-wide text-neutral-900">
            {reference}
          </div>
          <p className="mt-2 text-[12.5px] text-neutral-500">
            Keep this number. You will need it to track your request.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Button onClick={() => navigate(`/portal/track?ref=${encodeURIComponent(reference)}`)}>
              Track this request
            </Button>
            <Button variant="secondary" onClick={() => navigate("/portal")}>
              Back to Portal
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
