import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";

import { PORTAL_SERVICES, type PortalService } from "@/features/portal/data";

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
          className="h-12 min-w-0 flex-[1_1_280px] rounded-[10px] border border-[#d4d5d2] bg-white px-4 text-[15px] uppercase text-neutral-900 transition-[border-color,box-shadow] duration-150 placeholder:normal-case placeholder:text-[#7a7f89] focus:border-neutral-900 focus:outline-none focus:ring-4 focus:ring-neutral-900/10 aria-invalid:border-red-600 aria-invalid:ring-red-600/15"
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
    <div className="flex h-full flex-col rounded-[14px] border border-[#e4e4e1] bg-white p-6 shadow-[0_1px_2px_rgba(22,24,29,0.04)] sm:p-7">
      <div className="flex items-center justify-between">
        <span className="grid h-10 w-10 place-items-center rounded-[10px] border border-[#e4e4e1] text-neutral-900">
          <Icon className="h-5 w-5" />
        </span>
        <span className="font-['Geist_Mono',ui-monospace,monospace] text-[12px] font-medium tracking-[0.04em] text-[#5b606b]">
          {service.code}
        </span>
      </div>
      <h3 className="mt-6 text-[19px] font-semibold tracking-[-0.015em]">{service.title}</h3>
      <p className="mt-2 flex-1 text-[15px] leading-relaxed text-[#5b606b]">{service.description}</p>
      <Link
        to={service.to}
        className="group mt-7 inline-flex h-11 items-center gap-2 self-start rounded-[10px] bg-neutral-900 px-[18px] text-[15px] font-medium text-white transition-[background-color,transform] duration-150 hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 active:scale-[0.98]"
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

export function PortalHome() {
  return (
    <div className="flex flex-1 flex-col bg-white">
      <section className="mx-auto w-full max-w-[1120px] px-5 pb-16 pt-14 sm:px-6 sm:pb-[72px] sm:pt-[88px]">
        <Reveal index={0}>
          <h1 className="max-w-[720px] text-balance text-[36px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[52px]">
            What do you need from the&nbsp;GSO?
          </h1>
          <p className="mt-[18px] max-w-[560px] text-[17px] leading-relaxed text-[#5b606b] sm:text-[18px]">
            File a request, or follow one you already submitted. No account needed.
          </p>
          {TRACKING && <TrackForm service={TRACKING} />}
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
