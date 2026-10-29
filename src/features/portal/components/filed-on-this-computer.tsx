import * as React from "react";
import { Link } from "react-router-dom";
import { Check, ChevronRight, History, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { Skeleton, toast } from "@/components";
import { clearFilings, restoreFilings, type FiledRequest } from "@/features/portal/recent";
import { portalPath } from "@/features/portal/paths";
import { standingOf, trackReference, type TrackResult } from "@/features/portal/track";

/*
 * Shared by the portal home and the Track page, so a filer sees the same list
 * in both places. Redesigned 20 Oct 2026 (second pass): compact rows, a
 * status badge with an icon and a word, and a composed empty state.
 */

type RecentRow =
  | { reference: string; state: "loading" }
  | { reference: string; state: "missing" }
  | { reference: string; state: "found"; result: TrackResult };

/** "Updated 2 hours ago", from the document's own last change. */
const updatedAgo = (iso: string) =>
  `Updated ${formatDistanceToNow(new Date(iso), { addSuffix: true })}`;

function StatusBadge({ result }: { result: TrackResult }) {
  const standing = standingOf(result.timeline);
  const base = "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2 text-[12px] font-medium";
  // Icon and word together: the badge never relies on colour alone.
  if (standing === "stopped") {
    return (
      <span className={`${base} bg-[#fbeaea] text-[#9b1c22]`}>
        <X aria-hidden="true" className="h-3 w-3" strokeWidth={3} />
        {result.status}
      </span>
    );
  }
  if (standing === "finished") {
    return (
      <span className={`${base} bg-[#e8f3ec] text-[#1d6a40]`}>
        <Check aria-hidden="true" className="h-3 w-3" strokeWidth={3} />
        {result.status}
      </span>
    );
  }
  return (
    <span className={`${base} bg-[#fff3df] text-[#7a4500]`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#c27400]" />
      {result.status}
    </span>
  );
}

/**
 * The requests filed from this browser, with their live status. Only the
 * reference numbers are kept on the device (recent.ts); the status is looked
 * up each time, and again when the tab comes back into view.
 */
export function FiledOnThisComputer({ filed }: { filed: FiledRequest[] }) {
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
    <section aria-labelledby="filed-title" className="rounded-[14px] border border-[#ebe6e1] bg-white">
      <div className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-[#f8edef] text-[#a6323b]">
            <History className="h-[17px] w-[17px]" />
          </span>
          <div className="min-w-0">
            <h2 id="filed-title" className="text-[16px] font-semibold text-[#202124]">
              Recent Requests
            </h2>
            <p className="text-[13px] text-[#5c5752]">Submitted from this device. The status updates on its own.</p>
          </div>
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
            className="h-11 shrink-0 rounded-[10px] border border-[#e5dfd9] px-3 text-[13px] font-medium text-[#5c5752] transition-colors hover:bg-[#f4f1ee] hover:text-[#202124] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-ring)"
          >
            Clear list
          </button>
        )}
      </div>

      {filed.length === 0 ? (
        <div className="mx-5 mb-5 rounded-[12px] border border-dashed border-[#e0d9d2] bg-[#faf9f7] px-5 py-6 text-center sm:mx-6">
          <p className="text-[14px] font-medium text-[#202124]">No requests have been submitted from this device.</p>
          <p className="mx-auto mt-1 max-w-[400px] text-[13px] leading-relaxed text-[#5c5752]">
            Requests submitted on this computer are listed here with their current status.
          </p>
        </div>
      ) : (
        <>
          <ul className="list-none border-t border-[#f0ebe6]">
            {rows.map((row) => (
              <li key={row.reference} className="border-b border-[#f0ebe6] last:border-b-0">
                <Link
                  to={`${portalPath("/track")}?ref=${encodeURIComponent(row.reference)}`}
                  className="flex min-h-14 items-center gap-3 px-5 py-3 transition-colors hover:bg-[#faf9f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--accent-ring) sm:px-6"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="whitespace-nowrap font-['Geist_Mono',ui-monospace,monospace] text-[13px] font-semibold text-[#202124]">
                        {row.reference}
                      </span>
                      {row.state === "found" && <StatusBadge result={row.result} />}
                      {row.state === "loading" && <Skeleton className="h-6 w-20 rounded-full" />}
                    </div>
                    {row.state === "found" && (
                      <>
                        <p className="mt-1 truncate text-[13px] text-[#5c5752]">{row.result.title}</p>
                        <p className="mt-0.5 text-[12px] text-[#6e6862]">{updatedAgo(row.result.updatedAt)}</p>
                      </>
                    )}
                    {row.state === "missing" && (
                      <p className="mt-1 text-[13px] text-[#5c5752]">Status not available. Open it to try again.</p>
                    )}
                  </div>
                  <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[#8c857e]" />
                </Link>
              </li>
            ))}
          </ul>
          <p className="border-t border-[#f0ebe6] px-5 py-3 text-[12px] leading-relaxed text-[#5c5752] sm:px-6">
            Only the reference numbers are kept on this device. On a shared computer, clear the list
            when you are done.
          </p>
        </>
      )}
    </section>
  );
}
