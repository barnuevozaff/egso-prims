import * as React from "react";
import { Link } from "react-router-dom";
import { Check, ChevronRight, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { Skeleton, toast } from "@/components";
import { clearFilings, restoreFilings, type FiledRequest } from "@/features/portal/recent";
import { standingOf, trackReference, type TrackResult } from "@/features/portal/track";

/*
 * Shared by the portal home and the Track page (polish pass approved
 * 15 Oct 2026), so a filer sees the same list in both places.
 */

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
                  <span className="whitespace-nowrap font-['Geist_Mono',ui-monospace,monospace] text-[13px] font-medium">
                    {row.reference}
                  </span>
                  {row.state === "found" && <StatusPill result={row.result} />}
                  {row.state === "loading" && <Skeleton className="h-6 w-24 rounded-full" />}
                </div>
                {row.state === "found" && (
                  <>
                    <p className="mt-1 truncate text-[14px] text-[#5b606b]">{row.result.title}</p>
                    {/* Under the title, not beside it: beside it, the narrow
                        panel on the Track page split the number and cut the title. */}
                    <p className="mt-0.5 text-[12px] text-[#6b707a]">
                      {updatedAgo(row.result.updatedAt)}
                    </p>
                  </>
                )}
                {row.state === "missing" && (
                  <p className="mt-1 text-[14px] text-[#5b606b]">
                    Status not available. Open it to try again.
                  </p>
                )}
              </div>
              <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[#5b606b]" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
