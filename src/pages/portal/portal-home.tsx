import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, SearchCheck } from "lucide-react";

import hall1600 from "@/assets/portal/alaminos-municipal-hall-1600.webp";
import hall960 from "@/assets/portal/alaminos-municipal-hall-960.webp";
import { PORTAL_SERVICES, type PortalService } from "@/features/portal/data";
import { useFiledRequests } from "@/features/portal/recent";
import { FiledOnThisComputer } from "@/features/portal/components/filed-on-this-computer";

/**
 * The public portal's home (second pass, 20 Oct 2026): an official municipal
 * services page. A compact banner pairs the office's identity with the
 * Municipal Hall; tracking sits on its lower edge as the page's one tool;
 * the three filings follow as cards; this device's requests and a short
 * process guide close it.
 *
 * The photo is the Commons image of Alaminos Municipal Hall by Ralff Nestor
 * Nacor, CC BY-SA 4.0 (src/assets/portal/ATTRIBUTION.md); its credit sits
 * under the banner and must stay wherever the photo is shown.
 */

/** Strong ease-out: things arrive quickly and settle. */
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const FILING = PORTAL_SERVICES.filter((s) => s.kind === "filing");
const TRACKING = PORTAL_SERVICES.find((s) => s.kind === "lookup");

/** The procedure, start to finish (wording approved 21 Oct 2026: plain office language). */
const STEPS = [
  { title: "Select a service", body: "Choose the form that applies to your office's request." },
  { title: "Complete and submit the form", body: "A reference number is issued upon submission." },
  { title: "Track the request", body: "Use the reference number to check its status." },
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
      initial={reduce ? false : { opacity: 0, transform: "translateY(6px)" }}
      animate={{ opacity: 1, transform: "translateY(0px)" }}
      transition={{ duration: 0.32, delay: index * 0.04, ease: EASE_OUT }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function Banner() {
  return (
    <section
      aria-labelledby="portal-title"
      className="grid grid-cols-1 overflow-hidden rounded-[16px] bg-[#84272e] text-white lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]"
    >
      {/* The photo first in the source, so a phone shows the Hall above the words. */}
      <div className="relative h-[156px] sm:h-[200px] lg:order-2 lg:h-auto lg:min-h-[248px]">
        <img
          src={hall1600}
          srcSet={`${hall960} 960w, ${hall1600} 1600w`}
          sizes="(min-width: 1024px) 540px, 100vw"
          width={1600}
          height={900}
          alt="Alaminos Municipal Hall, with its sign reading Pamahalaang Bayan ng Alaminos"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-[50%_30%]"
        />
        {/* Joins the photo to the red panel: downward on a phone, leftward beside it. */}
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(180deg,rgba(132,39,46,0)_55%,#84272e_100%)] lg:bg-[linear-gradient(90deg,#84272e_0%,rgba(132,39,46,0.55)_18%,rgba(132,39,46,0)_48%)]"
        />
        {/* CC BY-SA 4.0 credit, required wherever the photo is shown. */}
        <p className="absolute right-2 top-2 max-w-[calc(100%-1rem)] rounded-md bg-black/60 px-2 py-1 text-[11px] leading-snug text-white">
          Photo:{" "}
          <a
            href="https://commons.wikimedia.org/wiki/File:Alaminos_Municipal_Hall,_Laguna,_July_2023.jpg"
            className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Ralff Nestor Nacor
          </a>
          ,{" "}
          <a
            href="https://creativecommons.org/licenses/by-sa/4.0/"
            className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            CC BY-SA 4.0
          </a>{" "}
          · adapted
        </p>
      </div>
      {/* lg:pb leaves room for the tracking card, which overlaps the lower edge. */}
      <div className="relative px-6 pb-7 pt-4 sm:px-8 lg:order-1 lg:flex lg:flex-col lg:justify-center lg:px-10 lg:pb-[72px] lg:pt-9">
        <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-white/85">
          General Services Office
        </p>
        <h1 id="portal-title" className="mt-1.5 text-[26px] font-semibold leading-tight tracking-[-0.02em] sm:text-[30px]">
          Online Requests and Services
        </h1>
        <p className="mt-2.5 max-w-[480px] text-[15px] leading-relaxed text-white/90">
          Submit purchase requests, requisitions, and facility reservations through the General
          Services Office of the Municipality of Alaminos, Laguna.
        </p>
      </div>
    </section>
  );
}

function TrackBar({ service }: { service: PortalService }) {
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
    <section
      aria-labelledby="track-title"
      className="relative mx-auto rounded-[14px] border border-[#ebe6e1] bg-white p-5 shadow-[0_1px_2px_rgba(32,33,36,0.05),0_12px_32px_-16px_rgba(84,22,28,0.28)] sm:p-6 lg:mx-8 lg:-mt-11 lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:items-center lg:gap-8"
    >
      <div>
        <h2 id="track-title" className="flex items-center gap-2.5 text-[17px] font-semibold text-[#202124]">
          <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-[9px] bg-[#f8edef] text-[#a6323b]">
            <SearchCheck className="h-[18px] w-[18px]" />
          </span>
          Track a Request
        </h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-[#5c5752]">
          Enter the reference number printed on your receipt to view its status.
        </p>
      </div>
      <form onSubmit={submit} noValidate className="mt-4 lg:mt-0">
        <label htmlFor="portal-track-ref" className="block text-[13px] font-medium text-[#202124]">
          Reference number
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            ref={inputRef}
            id="portal-track-ref"
            value={reference}
            onChange={(e) => {
              setReference(e.target.value);
              if (error) setError(null);
            }}
            placeholder="e.g. PR-2026-000214"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "portal-track-error" : "portal-track-hint"}
            className="h-12 min-w-0 flex-1 rounded-[10px] border border-[#cfc8c1] bg-white px-4 font-['Geist_Mono',ui-monospace,monospace] text-[15px] uppercase text-[#202124] transition-[border-color,box-shadow] duration-150 placeholder:font-['Geist',ui-sans-serif,system-ui,sans-serif] placeholder:normal-case placeholder:text-[#6e6862] focus:border-[#a6323b] focus:outline-none focus:ring-4 focus:ring-[#a6323b]/15 aria-invalid:border-red-700 aria-invalid:ring-red-700/15"
          />
          <button
            type="submit"
            className="ui-accent ui-accent-hover group inline-flex h-12 shrink-0 items-center gap-2 rounded-[10px] px-5 text-[15px] font-medium transition-[background-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ring) focus-visible:ring-offset-2 active:scale-[0.98]"
          >
            Track
            <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-[2px] motion-reduce:transition-none" />
          </button>
        </div>
        {error ? (
          <p id="portal-track-error" role="alert" className="mt-1.5 text-[13px] text-red-700">
            {error}
          </p>
        ) : (
          <p id="portal-track-hint" className="mt-1.5 text-[13px] text-[#5c5752]">
            Purchase request (PR), requisition (RIS) and facility reservation (FR) numbers are accepted.
          </p>
        )}
      </form>
    </section>
  );
}

function ServiceCard({ service }: { service: PortalService }) {
  const Icon = service.icon;
  const code = service.code ?? "";
  const titleId = `service-${code.toLowerCase()}`;
  return (
    // Only the button opens the form (owner's call: a stray click on the card
    // should not start a filing), so the card itself has no hover state.
    <article
      aria-labelledby={titleId}
      className="flex h-full flex-col rounded-[14px] border border-[#ebe6e1] bg-white shadow-[0_1px_2px_rgba(32,33,36,0.04)]"
    >
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-[12px] bg-[#84272e] text-white">
            <Icon className="h-[22px] w-[22px]" />
          </span>
          <span className="rounded-md bg-[#f8edef] px-2 py-1 font-['Geist_Mono',ui-monospace,monospace] text-[12px] font-semibold tracking-[0.04em] text-[#84272e]">
            {code}
          </span>
        </div>
        <h3 id={titleId} className="mt-5 text-[17px] font-semibold tracking-[-0.01em] text-[#202124]">
          {service.title}
        </h3>
        <p className="mt-1.5 flex-1 text-[14px] leading-relaxed text-[#5c5752]">{service.description}</p>
      </div>
      <div className="border-t border-[#f0ebe6] p-4 sm:px-6">
        <Link
          to={service.to}
          aria-describedby={titleId}
          className="ui-accent ui-accent-hover group inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] px-4 text-[14px] font-medium transition-[background-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ring) focus-visible:ring-offset-2 active:scale-[0.98]"
        >
          {service.cta}
          <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-[2px] motion-reduce:transition-none" />
        </Link>
      </div>
    </article>
  );
}

/** A section heading with the portal's red marker. */
function SectionHeading({ id, title, note }: { id: string; title: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 id={id} className="flex items-center gap-2.5 text-[18px] font-semibold tracking-[-0.01em] text-[#202124]">
        <span aria-hidden="true" className="h-[18px] w-[3px] rounded-full bg-[#a6323b]" />
        {title}
      </h2>
      {note && <p className="text-[14px] text-[#5c5752]">{note}</p>}
    </div>
  );
}

function ProcessGuide() {
  return (
    <section aria-labelledby="how-title" className="rounded-[14px] border border-[#ebe6e1] bg-white p-5 sm:p-6">
      <h2 id="how-title" className="text-[16px] font-semibold text-[#202124]">
        Request Procedure
      </h2>
      <ol className="mt-4 list-none">
        {STEPS.map((step, i) => (
          <li key={step.title} className="relative flex gap-3.5 pb-5 last:pb-0">
            {/* The line joining the steps; the last one has none. */}
            {i < STEPS.length - 1 && (
              <span aria-hidden="true" className="absolute left-[13px] top-8 bottom-1 w-px bg-[#e5dfd9]" />
            )}
            <span
              aria-hidden="true"
              className="relative grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#84272e] text-[13px] font-semibold tabular-nums text-white"
            >
              {i + 1}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-[14px] font-medium text-[#202124]">
                <span className="sr-only">Step {i + 1}: </span>
                {step.title}
              </p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-[#5c5752]">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      {/* An instruction, not a selling point: it answers "do I need to log in?". */}
      <p className="mt-5 border-t border-[#f0ebe6] pt-4 text-[13px] leading-relaxed text-[#5c5752]">
        No sign-in is required to submit or track a request.
      </p>
    </section>
  );
}

export function PortalHome() {
  const filed = useFiledRequests();
  return (
    <div className="mx-auto w-full max-w-[1120px] px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
      <Reveal index={0}>
        <Banner />
      </Reveal>

      {TRACKING && (
        <Reveal index={1} className="mt-4 lg:mt-0">
          <TrackBar service={TRACKING} />
        </Reveal>
      )}

      <Reveal index={2} className="mt-10">
        <section aria-labelledby="services-title">
          <SectionHeading id="services-title" title="Available Services" note="Select the form for your office's request." />
          <ul className="mt-4 grid list-none grid-cols-1 gap-4 md:grid-cols-3">
            {FILING.map((s) => (
              <li key={s.to} className="min-w-0">
                <ServiceCard service={s} />
              </li>
            ))}
          </ul>
        </section>
      </Reveal>

      <Reveal index={3} className="mt-10 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <FiledOnThisComputer filed={filed} />
        <ProcessGuide />
      </Reveal>
    </div>
  );
}
