import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import { ApprovalTimeline, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components";
import { buildApprovalTimeline, formatDate } from "@/features/purchase-requests/lib";
import {
  departmentByCode,
  prTotal,
  type PRSignatory,
  type PurchaseRequest,
} from "@/features/purchase-requests/types";
import { useCurrentSignatories } from "@/features/purchase-requests/components/use-current-signatories";
import { HistoryFeed } from "@/features/shared/history-feed";
import { formatPHP } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A purchase request at a glance (21 Oct 2026), for the drawer and the
 * details page: the purpose, the facts in one grid, whether it can be
 * approved, the items with their total, and — folded away — its history.
 * Attachments and comments are not part of the request's workflow and are
 * not shown; whatever a request already holds stays stored.
 */

const MONO = "font-['Geist_Mono',ui-monospace,monospace]";
const peso = (n: number) => formatPHP(n, { decimals: 2 });

function Fact({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[12px] text-[#6b707a]">{label}</dt>
      <dd className="mt-0.5 break-words text-[13.5px] text-neutral-900">{children}</dd>
    </div>
  );
}

const Missing = ({ children }: { children: React.ReactNode }) => (
  <span className="font-medium text-[#9a3412]">{children}</span>
);

/** What still stands in the way of approval, as far as the screen can tell. */
function useApprovalBlockers(pr: PurchaseRequest): { blockers: string[]; checking: boolean } {
  const current = useCurrentSignatories();
  if (pr.status !== "Submitted") return { blockers: [], checking: false };
  const blockers = [
    // The fund, section and FPP are optional (22 Oct 2026): blanks print as lines.
    !pr.purpose.trim() && "the purpose",
    !current.loading && !current.requestedBy && "the General Services Officer's name (Settings)",
    !current.loading && !current.cash && "the Municipal Treasurer's name (Settings)",
    !current.loading && !current.approved && "the Municipal Mayor's name (Settings)",
  ].filter(Boolean) as string[];
  return { blockers, checking: current.loading };
}

function Signatory({ role, who }: { role: string; who: PRSignatory | null }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] text-[#6b707a]">{role}</div>
      {who ? (
        <div className="text-[13px] text-neutral-900">
          {who.name}
          <span className="text-[#5b606b]"> · {who.designation}</span>
        </div>
      ) : (
        <div className="text-[13px] text-[#5b606b]">Not set</div>
      )}
    </div>
  );
}

export function PRDetailPanels({ pr }: { pr: PurchaseRequest }) {
  const dept = departmentByCode(pr.departmentCode);
  const total = prTotal(pr);
  const { blockers, checking } = useApprovalBlockers(pr);
  const long = pr.items.length > 12;

  return (
    <div className="space-y-5">
      {/* What it is for, first. */}
      <div>
        <div className="text-[12px] text-[#6b707a]">Purpose</div>
        <p className={cn("mt-0.5 text-[15px] leading-snug", pr.purpose.trim() ? "text-neutral-900" : "")}>
          {pr.purpose.trim() || <Missing>Not entered — add it before approving.</Missing>}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-[12px] border border-[#ececea] px-4 py-3.5 sm:grid-cols-4">
        <Fact label="Requested by">{pr.requester}</Fact>
        <Fact label="Office">
          {dept.name} <span className="text-[#5b606b]">({dept.code})</span>
        </Fact>
        <Fact label="Date requested">{formatDate(pr.requestDate)}</Fact>
        <Fact label="Fund">{pr.fundingSource ?? <Missing>Not set</Missing>}</Fact>
        <Fact label="Tracking reference">
          <span className={MONO}>{pr.prNumber}</span>
        </Fact>
        <Fact label="Official PR No.">
          {pr.officialPrNumber ? <span className={MONO}>{pr.officialPrNumber}</span> : <span className="text-[#5b606b]">On approval</span>}
        </Fact>
        {(pr.poNumber || pr.status === "Approved" || pr.status === "Completed") && (
          <Fact label="Purchase order">
            {pr.poNumber ? (
              <Link
                to={`/purchase-orders/${encodeURIComponent(pr.poNumber)}`}
                className={cn(MONO, "text-[#a6323b] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a6323b]")}
              >
                {pr.poNumber}
              </Link>
            ) : (
              <span className="text-[#5b606b]">Not created yet</span>
            )}
          </Fact>
        )}
        {/* Section and FPP only when they carry something. */}
        {pr.section && <Fact label="Section">{pr.section}</Fact>}
        {pr.fpp && <Fact label="FPP">{pr.fpp}</Fact>}
      </dl>

      {/* A closed request says why, without opening the history. */}
      {(pr.status === "Cancelled" || pr.status === "Rejected") && (() => {
        const step = [...pr.approvals].reverse().find((a) => a.step === pr.status);
        return (
          <p role="status" className="rounded-[12px] border border-[#ececea] bg-[#fafaf9] px-4 py-3 text-[13.5px] text-neutral-900">
            {pr.status === "Cancelled" ? "Voided" : "Rejected"}
            {step?.at ? ` on ${formatDate(step.at)}` : ""}
            {step?.by ? ` by ${step.by}` : ""}
            {step?.remarks ? <>: <span className="text-[#4a4f59]">{step.remarks}</span></> : "."}
          </p>
        );
      })()}

      {pr.status === "Submitted" && !checking && (
        <div
          role="status"
          className={cn(
            "flex items-start gap-2 rounded-[12px] px-4 py-3 text-[13.5px]",
            blockers.length ? "border border-[#f2d6c2] bg-[#fdf6f0] text-[#7c2d12]" : "border border-[#cfe6d8] bg-[#f3faf6] text-[#14532d]",
          )}
        >
          {blockers.length ? (
            <AlertTriangle aria-hidden="true" className="mt-px h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 aria-hidden="true" className="mt-px h-4 w-4 shrink-0" />
          )}
          <span>
            {blockers.length ? <>Before approval, add {blockers.join(", ")}.</> : "Ready for approval: the purpose and the signatories are in."}
          </span>
        </div>
      )}

      {/* Items: the table scrolls inside itself when long; the total stays in view. */}
      <section aria-labelledby={`items-${pr.id}`}>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h3 id={`items-${pr.id}`} className="text-[14px] font-semibold text-neutral-900">
            Items
          </h3>
          <span className="text-[12.5px] text-[#5b606b]">
            {pr.items.length} {pr.items.length === 1 ? "item" : "items"}
          </span>
        </div>
        <div className="overflow-hidden rounded-[12px] border border-[#ececea]">
          <div className={cn("relative overflow-x-auto", long && "max-h-[440px] overflow-y-auto")}>
            <table className="w-full min-w-[560px] text-[13px]">
              <thead className="sticky top-0 z-10 bg-[#fafaf9]">
                <tr className="text-left text-[12px] text-[#6b707a]">
                  <th className="w-10 px-3 py-2 text-right font-normal">#</th>
                  <th className="py-2 pr-3 font-normal">Description</th>
                  <th className="w-16 py-2 pr-3 text-right font-normal">Qty</th>
                  <th className="w-20 py-2 pr-3 font-normal">Unit</th>
                  <th className="w-28 py-2 pr-3 text-right font-normal">Unit cost</th>
                  <th className="w-32 py-2 pr-4 text-right font-normal">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {pr.items.map((it, i) => (
                  <tr key={it.id ?? i} className="border-t border-[#f0f0ee] align-top">
                    <td className="px-3 py-2 text-right tabular-nums text-[#6b707a]">{i + 1}</td>
                    <td className="py-2 pr-3 text-neutral-900">{it.description}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{it.quantity.toLocaleString("en-PH")}</td>
                    <td className="py-2 pr-3 text-[#5b606b]">{it.unit}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-[#4a4f59]">{peso(it.estimatedCost)}</td>
                    <td className="py-2 pr-4 text-right font-medium tabular-nums text-neutral-900">
                      {peso(it.quantity * it.estimatedCost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-t border-[#ececea] bg-[#fafaf9] px-4 py-2.5">
            <span className="text-[13px] text-[#5b606b]">Total estimated amount</span>
            <span className="text-[16px] font-semibold tabular-nums text-neutral-900">{peso(total)}</span>
          </div>
        </div>
      </section>

      {pr.signatories && (
        <section aria-label="Signatories" className="grid grid-cols-1 gap-3 rounded-[12px] border border-[#ececea] px-4 py-3 sm:grid-cols-3">
          <Signatory role="Requested by" who={pr.signatories.requestedBy} />
          <Signatory role="Cash Availability" who={pr.signatories.cashAvailability} />
          <Signatory role="Approved by" who={pr.signatories.approvedBy} />
        </section>
      )}

      {/* Kept for accountability, folded away from the review. */}
      <details className="group rounded-[12px] border border-[#ececea]">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-[13.5px] font-medium text-neutral-900 marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#a6323b]">
          <ChevronRight aria-hidden="true" className="h-4 w-4 text-[#7c818b] transition-transform group-open:rotate-90" />
          History
          <span className="font-normal text-[#5b606b]">
            · {pr.history.length} {pr.history.length === 1 ? "entry" : "entries"}
            {pr.updatedAt ? ` · last ${formatDate(pr.updatedAt)}` : ""}
          </span>
        </summary>
        <div className="border-t border-[#f0f0ee] px-4 pb-4 pt-3">
          <Tabs defaultValue="changes">
            <TabsList className="bg-neutral-100">
              <TabsTrigger value="changes" className="text-[12.5px]">
                Changes
              </TabsTrigger>
              <TabsTrigger value="steps" className="text-[12.5px]">
                Approval steps
              </TabsTrigger>
            </TabsList>
            <TabsContent value="changes" className="pt-3">
              <HistoryFeed entries={pr.history} />
            </TabsContent>
            <TabsContent value="steps" className="pt-3">
              <ApprovalTimeline steps={buildApprovalTimeline(pr)} />
            </TabsContent>
          </Tabs>
        </div>
      </details>
    </div>
  );
}
