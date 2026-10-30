import { describe, expect, it } from "vitest";

import { standingOf } from "@/features/portal/track";
import { buildPOTimeline } from "@/features/purchase-orders/lib";
import type { PurchaseOrder } from "@/features/purchase-orders/types";
import { buildApprovalTimeline } from "@/features/purchase-requests/lib";
import type { PurchaseRequest } from "@/features/purchase-requests/types";
import { buildReservationTimeline } from "@/features/reservations/lib";
import type { Reservation } from "@/features/reservations/types";
import { buildRISTimeline } from "@/features/ris/lib";
import type { RequestForIssuance } from "@/features/ris/types";

const at = (hour: number) => `2026-10-20T${String(hour).padStart(2, "0")}:00:00.000Z`;
const gso = { office: "General Services Office" };
const shape = (steps: { label: string; status: string }[]) => steps.map((s) => `${s.label}:${s.status}`);

const pr = (over: Partial<PurchaseRequest>) => ({ status: "Submitted", approvals: [], ...over }) as unknown as PurchaseRequest;
const ris = (over: Partial<RequestForIssuance>) => ({ status: "Pending Approval", approvals: [], ...over }) as unknown as RequestForIssuance;
const po = (over: Partial<PurchaseOrder>) => ({ status: "Approved", approvals: [], ...over }) as unknown as PurchaseOrder;
const res = (over: Partial<Reservation>) => ({ status: "Pending", approvals: [], ...over }) as unknown as Reservation;

describe("approval steps show what was recorded, then what is still ahead (30 Oct 2026)", () => {
  it("a request filed on the portal: created and submitted, awaiting approval", () => {
    const steps = buildApprovalTimeline(
      pr({ approvals: [{ step: "Created", by: "Liza Cruz", at: at(1) }, { step: "Submitted", by: "Liza Cruz", at: at(1) }] }),
    );
    expect(shape(steps)).toEqual(["Created:approved", "Submitted:approved", "Approved:current", "Completed:pending"]);
    expect(steps[0]).toMatchObject({ person: { name: "Liza Cruz" } });
    expect(steps[0].time).toBeTruthy();
    expect(steps[2].time).toBeUndefined();
  });

  it("a slip returned, resubmitted and approved shows every event in order, with the return's remarks", () => {
    const steps = buildRISTimeline(
      ris({
        status: "Approved",
        stockIssuedAt: at(5),
        approvals: [
          { step: "Created", by: "Clerk", at: at(1) },
          { step: "Pending Approval", by: "Clerk", at: at(1) },
          { step: "Draft", by: "Ana Reyes", ...gso, at: at(2), remarks: "Returned to requester for revision" },
          { step: "Pending Approval", by: "Clerk", at: at(3) },
          { step: "Approved", by: "Ana Reyes", ...gso, at: at(5) },
        ],
      }),
    );
    expect(shape(steps)).toEqual([
      "Created:approved",
      "Submitted:approved",
      "Returned:returned",
      "Submitted:approved",
      "Approved · stock issued:approved",
    ]);
    expect(steps[2]).toMatchObject({ remarks: "Returned to requester for revision", person: { name: "Ana Reyes" } });
    expect(standingOf(steps)).toBe("finished");
  });

  it("a slip returned to draft waits to be submitted again", () => {
    const steps = buildRISTimeline(
      ris({
        status: "Draft",
        approvals: [
          { step: "Created", at: at(1) },
          { step: "Pending Approval", at: at(1) },
          { step: "Draft", at: at(2), remarks: "Returned to requester for revision" },
        ],
      }),
    );
    expect(shape(steps)).toEqual([
      "Created:approved",
      "Submitted:approved",
      "Returned:returned",
      "Submitted:current",
      "Approved:pending",
    ]);
    expect(standingOf(steps)).toBe("moving");
  });

  it("a rejected slip ends at the rejection; nothing is shown as still ahead", () => {
    const steps = buildRISTimeline(
      ris({
        status: "Rejected",
        approvals: [
          { step: "Created", at: at(1) },
          { step: "Pending Approval", at: at(1) },
          { step: "Rejected", by: "Ana Reyes", at: at(2), remarks: "Item not available this quarter" },
        ],
      }),
    );
    expect(shape(steps)).toEqual(["Created:approved", "Submitted:approved", "Rejected:rejected"]);
    expect(standingOf(steps)).toBe("stopped");
  });

  it("an order authorized with its request has no submission of its own", () => {
    const steps = buildPOTimeline(
      po({
        authorization: "pr-approval",
        approvals: [
          { step: "Created", by: "Ana Reyes", at: at(4) },
          { step: "Approved", by: "Ana Reyes", at: at(4), remarks: "Authorized by the approval of PR-2026-000243" },
        ],
      }),
    );
    expect(shape(steps)).toEqual(["Created:approved", "Approved:approved"]);
    expect(steps[1].remarks).toBe("Authorized by the approval of PR-2026-000243");
  });

  it("a reservation does not show the review that filing stores under a fixed name", () => {
    const steps = buildReservationTimeline(
      res({
        approvals: [
          { step: "Created", by: "Borrower", at: at(1) },
          { step: "Reviewed", by: "Marites Villanueva", ...gso, at: at(1) },
        ],
      }),
    );
    expect(shape(steps)).toEqual(["Created:approved", "Approved:current", "Completed:pending"]);
    expect(steps.some((s) => s.person?.name === "Marites Villanueva")).toBe(false);
  });

  it("an older record with no recorded steps shows what its status supports, undated and unnamed", () => {
    const steps = buildApprovalTimeline(pr({ status: "Approved", approvals: [] }));
    expect(shape(steps)).toEqual(["Created:approved", "Submitted:approved", "Approved:approved", "Completed:current"]);
    expect(steps.slice(0, 3).every((s) => !s.time && !s.person)).toBe(true);
  });

  it("an implied step goes in its place in the chain, before later recorded ones", () => {
    const steps = buildApprovalTimeline(
      pr({ status: "Approved", approvals: [{ step: "Created", at: at(1) }, { step: "Approved", at: at(3) }] }),
    );
    expect(shape(steps)).toEqual(["Created:approved", "Submitted:approved", "Approved:approved", "Completed:current"]);
    expect(steps[1].time).toBeUndefined();
    expect(steps[2].time).toBeTruthy();
  });
});
