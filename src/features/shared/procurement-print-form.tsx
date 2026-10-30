import * as React from "react";
import { createPortal } from "react-dom";

import { BRAND_LOGO } from "@/lib/brand";
import { PROCUREMENT_SIGNATORIES, type Official } from "@/lib/officials";

/**
 * The official Municipality of Alaminos procurement form.
 *
 * One sheet shared by Purchase Requests, Purchase Orders and the Requisition
 * and Issue Slip, so every printed procurement document carries the same
 * letterhead, ruled table and signatory block. Only the title, the meta lines
 * and the column set change between documents.
 *
 * Rendered print-only, and portalled to <body>: the application frame is a
 * fixed-height, overflow-hidden shell, so a sheet left inside it is clipped to
 * one viewport and paginates to blank pages. As a direct child of <body> the
 * form sits in normal flow and can run onto as many pages as it needs.
 */

export interface PrintMetaLine {
  label: string;
  /** Omit to print a ruled blank the office fills in by hand. */
  value?: string;
}

export interface PrintColumn {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  /** CSS width, e.g. "12%". Leave unset to let the column flex. */
  width?: string;
}

/** An official who signs a document: kept in @/lib/officials, so every sheet
 *  this system prints names the same people. */
export type PrintSignatory = Official;
export { PROCUREMENT_SIGNATORIES };

/** Two-decimal peso figure, unadorned — the form's columns are already labelled. */
export const printAmount = (n: number) =>
  n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * dd/mm/yyyy, the format the paper form is filled in with.
 *
 * A missing or unreadable date prints as a blank for the office to write in.
 * The records forms already do this; here an empty column value reached
 * `new Date`, and "NaN/NaN/NaN" went out on an official document.
 */
export const printDate = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

/**
 * The print shell: a sheet portalled to <body>, hidden on screen. Bespoke
 * documents compose their own body inside it and inherit the portrait page
 * setup and the escape from the app's fixed-height frame.
 */
export function PrintSheet({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <>
      {/*
       * The page setup travels with the sheet. Declaring it here rather than
       * as a named @page avoids a page-context switch mid-document: assigning
       * a differently-named page inside the landscape default makes Chrome
       * emit blank pages around the form.
       */}
      <style>{"@page { size: A4 portrait; margin: 14mm; }"}</style>
      <div data-print-form="" className="bg-white text-black">
        {children}
      </div>
    </>,
    document.body,
  );
}

/**
 * The municipal seal and name above the Purchase Request, Purchase Order and
 * Requisition and Issue Slip (30 Oct 2026): one treatment, the Purchase
 * Request's, so the three read as one office's papers. Each form's own title
 * and fields follow it unchanged.
 */
export function MunicipalLetterhead() {
  return (
    <div className="text-center font-['Tahoma','Arial',sans-serif] leading-[1.35] text-black">
      <img src={BRAND_LOGO} alt="Municipality of Alaminos seal" className="mx-auto h-[56px] w-[56px] object-contain" />
      <div className="mt-0.5 text-[11.5px]">Republic of the Philippines</div>
      <div className="text-[13px] font-bold">MUNICIPALITY OF ALAMINOS</div>
      <div className="text-[11.5px]">Province of Laguna</div>
    </div>
  );
}

/** Peso amount spelled out, e.g. "One Thousand Pesos Only". */
export function amountInWords(amount: number): string {
  const ones = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
    "Eighteen", "Nineteen",
  ];
  const tens = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
  ];

  const under1000 = (n: number): string => {
    if (n === 0) return "";
    if (n < 20) return ones[n];
    if (n < 100) {
      const t = tens[Math.floor(n / 10)];
      const r = n % 10;
      return r ? `${t}-${ones[r]}` : t;
    }
    const h = `${ones[Math.floor(n / 100)]} Hundred`;
    const r = n % 100;
    return r ? `${h} ${under1000(r)}` : h;
  };

  const scales: [number, string][] = [
    [1_000_000_000, "Billion"],
    [1_000_000, "Million"],
    [1_000, "Thousand"],
  ];

  const spell = (n: number): string => {
    if (n === 0) return "Zero";
    const parts: string[] = [];
    let rest = n;
    for (const [value, name] of scales) {
      if (rest >= value) {
        parts.push(`${under1000(Math.floor(rest / value))} ${name}`);
        rest %= value;
      }
    }
    if (rest > 0) parts.push(under1000(rest));
    return parts.join(" ");
  };

  const whole = Math.floor(Math.abs(amount));
  const centavos = Math.round((Math.abs(amount) - whole) * 100);
  const pesos = `${spell(whole)} Peso${whole === 1 ? "" : "s"}`;
  return centavos > 0
    ? `${pesos} and ${spell(centavos)} Centavo${centavos === 1 ? "" : "s"} Only`
    : `${pesos} Only`;
}

const alignClass = (align: PrintColumn["align"]) =>
  align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

function MetaBlock({ lines }: { lines: PrintMetaLine[] }) {
  return (
    <div className="space-y-1">
      {lines.map((m) => (
        <div key={m.label} className="text-[12px] leading-[1.5] text-black">
          <span className="font-bold">{m.label}:</span>{" "}
          {m.value ? (
            <span>{m.value}</span>
          ) : (
            // A ruled blank, filled in by hand after printing.
            <span className="inline-block h-[13px] w-[150px] border-b border-black align-bottom" />
          )}
        </div>
      ))}
    </div>
  );
}

export function ProcurementPrintForm({
  title,
  left,
  right,
  columns,
  rows,
  minRows = 10,
  total,
  signatories = PROCUREMENT_SIGNATORIES,
  officeName = "GENERAL SERVICES OFFICE (GSO)",
}: {
  /** Document name, e.g. "PURCHASE REQUEST". Printed in caps. */
  title: string;
  left: PrintMetaLine[];
  right: PrintMetaLine[];
  columns: PrintColumn[];
  /** One record per line, keyed by column. */
  rows: Record<string, React.ReactNode>[];
  /** Blank rows are padded to this count so the form always fills the page. */
  minRows?: number;
  total?: { label: string; value: string };
  signatories?: PrintSignatory[];
  officeName?: string;
}) {
  const blanks = Math.max(0, minRows - rows.length);
  // The total sits under the last two columns, mirroring the paper form.
  const totalSpan = Math.max(1, columns.length - 1);

  return (
    <PrintSheet>
      {/* Letterhead */}
      <div className="text-center">
        <img
          src={BRAND_LOGO}
          alt="Municipality of Alaminos seal"
          className="mx-auto h-[70px] w-[70px] object-contain"
        />
        <div className="mt-1 text-[13px] leading-[1.45]">Republic of the Philippines</div>
        <div className="text-[16px] font-bold leading-[1.45]">MUNICIPALITY OF ALAMINOS</div>
        <div className="text-[13px] leading-[1.45]">Province of Laguna</div>
        <div className="text-[13px] font-bold leading-[1.45]">{officeName}</div>
        <div className="mt-1 text-[19px] font-bold leading-[1.35]">{title}</div>
      </div>

      {/* Meta block — two columns, as on the paper form */}
      <div className="mt-4 grid grid-cols-2 gap-x-8">
        <MetaBlock lines={left} />
        <MetaBlock lines={right} />
      </div>

      {/* Ruled item table */}
      <table className="mt-4 w-full table-fixed border-collapse text-[12px]">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={c.width ? { width: c.width } : undefined}
                className="border border-black px-1.5 py-1.5 text-center font-bold"
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`border border-black px-1.5 py-1 align-top ${alignClass(c.align)}`}
                >
                  {r[c.key] ?? ""}
                </td>
              ))}
            </tr>
          ))}
          {/* Blank lines keep the ruled grid intact on a short document. */}
          {Array.from({ length: blanks }).map((_, i) => (
            <tr key={`blank-${i}`}>
              {columns.map((c) => (
                <td key={c.key} className="border border-black px-1.5 py-1">
                  &nbsp;
                </td>
              ))}
            </tr>
          ))}
          {total && (
            <tr>
              <td
                colSpan={totalSpan}
                className="border border-black px-1.5 py-1.5 text-right font-bold"
              >
                {total.label}
              </td>
              <td className="border border-black px-1.5 py-1.5 text-right font-bold">
                {total.value}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Signatories */}
      <div className="mt-16 grid grid-cols-3 gap-x-6">
        {signatories.map((s) => (
          <div key={s.name} className="text-center">
            <div className="border-t border-black pt-1 text-[12px] font-medium">{s.name}</div>
            <div className="text-[11.5px] text-neutral-600">{s.title}</div>
          </div>
        ))}
      </div>
    </PrintSheet>
  );
}
