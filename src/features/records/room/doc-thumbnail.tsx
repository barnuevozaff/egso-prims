import * as React from "react";

import { Skeleton } from "@/components";
import { getSchedule } from "@/features/records/api";
import { getAppraisal } from "@/features/records/inventory-api";
import { getRequest } from "@/features/records/disposal-api";
import { RecordsScheduleSheet } from "@/features/records/components/records-print-form";
import { AppraisalSheet } from "@/features/records/components/appraisal-print-form";
import { DisposalRequestSheet } from "@/features/records/components/disposal-print-form";
import type { DispositionScheduleWithSeries } from "@/features/records/types";
import type { InventoryAppraisalWithRecords } from "@/features/records/inventory-types";
import type { DisposalRequestWithItems } from "@/features/records/disposal-types";
import type { DocType } from "@/features/records/shelf-types";

/**
 * A document's first page, small: the same form its page shows and prints,
 * rendered from the saved document and scaled down — never a picture made up
 * for the room. Loaded on first look and kept, so moving back and forth
 * between files does not flicker.
 */

type FullDoc =
  | { type: "RDS"; doc: DispositionScheduleWithSeries }
  | { type: "RIA"; doc: InventoryAppraisalWithRecords }
  | { type: "RAD"; doc: DisposalRequestWithItems };

const loaded = new Map<string, FullDoc | null>();
const loading = new Map<string, Promise<FullDoc | null>>();

function load(type: DocType, id: string): Promise<FullDoc | null> {
  const key = `${type}-${id}`;
  let p = loading.get(key);
  if (!p) {
    p = (
      type === "RDS"
        ? getSchedule(id).then((doc) => (doc ? ({ type, doc } as FullDoc) : null))
        : type === "RIA"
          ? getAppraisal(id).then((doc) => (doc ? ({ type, doc } as FullDoc) : null))
          : getRequest(id).then((doc) => (doc ? ({ type, doc } as FullDoc) : null))
    ).then(
      (full) => {
        loaded.set(key, full);
        return full;
      },
      () => {
        // A failed read is not remembered: the next look tries again.
        loading.delete(key);
        return null;
      },
    );
    loading.set(key, p);
  }
  return p;
}

/** A4 at CSS pixels: 210mm and 297mm. The inventory is landscape (twenty columns). */
const MM = 96 / 25.4;
const PAGE = {
  portrait: { w: 210 * MM, h: 297 * MM, pad: "14mm" },
  landscape: { w: 297 * MM, h: 210 * MM, pad: "10mm" },
};

export function DocThumbnail({ type, id, width }: { type: DocType; id: string; width: number }) {
  const key = `${type}-${id}`;
  const [full, setFull] = React.useState<FullDoc | null | undefined>(() => loaded.get(key));

  React.useEffect(() => {
    if (loaded.has(key)) {
      setFull(loaded.get(key));
      return;
    }
    let live = true;
    setFull(undefined);
    void load(type, id).then((f) => live && setFull(f));
    return () => {
      live = false;
    };
  }, [key, type, id]);

  const page = type === "RIA" ? PAGE.landscape : PAGE.portrait;
  const scale = width / page.w;
  const height = Math.round(page.h * scale);

  if (full === undefined) return <Skeleton className="rounded-[6px]" style={{ width, height }} />;
  if (full === null) {
    return (
      <div
        className="grid place-items-center rounded-[6px] border border-dashed border-[#d4d0c7] bg-[#f7f5f0] px-3 text-center text-[12px] text-[#5b606b]"
        style={{ width, height }}
      >
        The first page could not be read.
      </div>
    );
  }
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-[6px] border border-[#e0dcd3] bg-white shadow-[0_1px_2px_rgba(22,24,29,0.06)]"
      style={{ width, height }}
    >
      <div className="origin-top-left bg-white text-black" style={{ width: page.w, transform: `scale(${scale})`, padding: page.pad }}>
        {full.type === "RDS" ? (
          <RecordsScheduleSheet schedule={full.doc} />
        ) : full.type === "RIA" ? (
          <AppraisalSheet appraisal={full.doc} />
        ) : (
          <DisposalRequestSheet request={full.doc} />
        )}
      </div>
    </div>
  );
}
