import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

import { StatusBadge, type DocumentStatus } from "@/components";

/**
 * The top of a record's own page (30 Oct 2026), as the purchase order has
 * it: the way back to the list, the document number and its status, one line
 * on what it is, and the record's actions on the right. A record opens here,
 * ready to edit while it can still be edited.
 */
export function RecordPageHeader({
  back,
  number,
  status,
  description,
  actions,
  note,
}: {
  back: { to: string; label: string };
  number: string;
  status: DocumentStatus;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** A line under the header, e.g. why the actions wait. */
  note?: React.ReactNode;
}) {
  return (
    <div>
      <Link
        to={back.to}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md text-[13px] text-[#5b606b] hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a6323b]"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        {back.label}
      </Link>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-['Geist_Mono',ui-monospace,monospace] text-[24px] font-semibold tracking-[-0.02em] text-neutral-900">
              {number}
            </h1>
            <StatusBadge status={status} />
          </div>
          {description && <p className="mt-1 text-[13.5px] text-[#5b606b]">{description}</p>}
        </div>
        {actions}
      </div>
      {note && (
        <p role="status" className="mt-2 text-[12.5px] text-[#5b606b]">
          {note}
        </p>
      )}
    </div>
  );
}
