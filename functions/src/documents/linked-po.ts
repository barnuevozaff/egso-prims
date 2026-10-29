import { randomUUID } from "node:crypto";

import { getFirestore, type DocumentReference, type Transaction } from "firebase-admin/firestore";

import { NUMBERING_TIME_ZONE } from "../numbering.js";
import { PO_DESIGNATIONS, PO_SIGNATORY_KEYS, settingId } from "./signatories.js";

export { settingId };

/**
 * The Purchase Order created with its Purchase Request's approval (21 Oct
 * 2026, proposed local workflow — single-approval authorization is pending
 * the municipality's confirmation).
 *
 * Approving a request authorizes its order: the order is created in the same
 * transaction, already Approved, with the request's office, requester,
 * purpose and items, the request's official PR number, and the Purchase
 * Order signatories copied from Settings. Supplier, delivery and payment
 * details start blank (or from values an Administrator saved in Settings) and
 * may be completed later or by hand on the printed form. Approval is not
 * delivery, inspection, acceptance or payment.
 *
 * One order per request: the request records its order (`po_number`) and a
 * claim document (`unique_keys/purchase_orders.source_pr:{PR}`) is created
 * with it, so retries, double clicks and concurrent approvals all find the
 * same order instead of creating a second.
 *
 * Everything here that reads runs before anything writes, as Firestore
 * transactions require.
 */

type Row = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const PO_SETTING_KEYS = {
  approvedName: PO_SIGNATORY_KEYS.approvedBy,
  bacName: PO_SIGNATORY_KEYS.bacSecretary,
  place: settingId("Procurement", "po_place_of_delivery"),
  deliveryTerm: settingId("Procurement", "po_delivery_term"),
  paymentTerm: settingId("Procurement", "po_payment_term"),
};

export const manilaDate = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: NUMBERING_TIME_ZONE }).format(d);

export const sourceClaim = (prNumber: string): DocumentReference =>
  getFirestore().doc(`unique_keys/purchase_orders.source_pr:${prNumber.replaceAll("/", "%2F")}`);

export interface POSettings {
  signatories: { approved_by: Row | null; bac_secretary: Row | null };
  /** Only values an Administrator saved; nothing is filled in from elsewhere. */
  terms: { delivery_address: string | null; delivery_term: string | null; payment_term: string | null };
}

/** Settings → Purchase Order signatories and the saved PO terms. A read. */
export async function readPOSettings(tx: Transaction): Promise<POSettings> {
  const db = getFirestore();
  const v = Object.fromEntries(
    await Promise.all(
      Object.entries(PO_SETTING_KEYS).map(async ([k, id]) => {
        const s = await tx.get(db.collection("system_configuration").doc(id));
        return [k, s.exists ? s.get("value") : undefined] as const;
      }),
    ),
  );
  return {
    signatories: {
      // Not set: left blank on the printed order rather than invented.
      approved_by: str(v.approvedName)
        ? { name: str(v.approvedName), designation: PO_DESIGNATIONS.approvedBy }
        : null,
      bac_secretary: str(v.bacName)
        ? { name: str(v.bacName), designation: PO_DESIGNATIONS.bacSecretary }
        : null,
    },
    terms: {
      delivery_address: str(v.place) || null,
      delivery_term: str(v.deliveryTerm) || null,
      payment_term: str(v.paymentTerm) || null,
    },
  };
}

/**
 * The order already linked to a request, if any: the request's own link, the
 * claim, or — for requests ordered by hand before 21 Oct 2026 — the oldest
 * order raised from it that is not voided. A read.
 */
export async function findLinkedPO(tx: Transaction, pr: Row): Promise<string | null> {
  const db = getFirestore();
  const prNumber = str(pr.pr_number) || str(pr.id);
  if (str(pr.po_number)) return str(pr.po_number);
  const claim = await tx.get(sourceClaim(prNumber));
  if (claim.exists && str(claim.get("doc_id"))) return str(claim.get("doc_id"));
  const orders = await tx.get(db.collection("purchase_orders").where("pr_number", "==", prNumber));
  const open = orders.docs
    .filter((d) => d.get("status") !== "Cancelled")
    .sort((a, b) => String(a.get("created_at")).localeCompare(String(b.get("created_at"))));
  return open[0]?.id ?? null;
}

/** The order created with the request's approval. Pure: no reads or writes. */
export function buildLinkedPO(
  pr: Row,
  poNumber: string,
  now: Date,
  who: { by: string; uid: string },
  settings: POSettings,
  note?: string,
): Row {
  const at = now.toISOString();
  const prNumber = str(pr.pr_number) || str(pr.id);
  const official = str(pr.official_pr_number) || null;
  const items = ((pr.items as Row[]) ?? []).map((it) => ({
    id: randomUUID(),
    description: str(it.description),
    quantity: Number(it.quantity),
    unit: str(it.unit),
    unitCost: Number(it.estimatedCost ?? it.unitCost ?? 0),
    stockNo: null,
  }));
  const source = official ? `${official} (${prNumber})` : prNumber;
  return {
    id: poNumber,
    po_number: poNumber,
    pr_number: prNumber,
    pr_official_number: official,
    department_code: str(pr.department_code),
    requester: str(pr.requester),
    purpose: str(pr.purpose),
    // Document details: blank until completed here or by hand on paper.
    supplier_name: "",
    supplier_address: null,
    supplier_tin: null,
    supplier_contact: null,
    mode_of_procurement: null,
    delivery_address: settings.terms.delivery_address,
    expected_delivery: null,
    delivery_term: settings.terms.delivery_term,
    payment_term: settings.terms.payment_term,
    bac_resolution_no: null,
    bac_resolution_series: null,
    issued_date: at.slice(0, 10),
    po_date: manilaDate(now),
    status: "Approved",
    // How the order was authorized, kept apart from delivery or receipt.
    authorization: "pr-approval",
    approved_at: at,
    approved_by: who.by,
    approved_by_uid: who.uid,
    signatories: settings.signatories,
    items,
    // The lines as authorized; later corrections never change these.
    authorized_items: items,
    attachments: [],
    comments: [],
    history: [
      {
        id: randomUUID(),
        kind: "create",
        text: `${poNumber} created with the approval of ${source}${note ? ` — ${note}` : ""}`,
        at,
        by: who.by,
      },
    ],
    approvals: [
      { step: "Created", by: who.by, office: "General Services Office", at },
      {
        step: "Approved",
        by: who.by,
        office: "General Services Office",
        at,
        remarks: `Authorized by the approval of ${source}`,
        byUid: who.uid,
      },
    ],
    created_at: at,
    updated_at: at,
    created_by_uid: who.uid,
    updated_by_uid: who.uid,
  };
}

/**
 * Writes the new order and its claim. Writes only; the caller records the
 * link on the request (`po_number`) in its own update of that document.
 * `create`, not `set`: a second order for the same number or request fails
 * the whole transaction rather than overwriting.
 */
export function writeLinkedPO(tx: Transaction, po: Row) {
  const db = getFirestore();
  tx.create(db.collection("purchase_orders").doc(String(po.po_number)), po);
  tx.create(sourceClaim(String(po.pr_number)), {
    collection: "purchase_orders",
    doc_id: po.po_number,
    created_at: po.created_at,
  });
}

/** Claims an order linked earlier by hand, so later lookups find it at once. Write only. */
export function claimExistingPO(tx: Transaction, prNumber: string, poNumber: string, at: string) {
  tx.set(sourceClaim(prNumber), { collection: "purchase_orders", doc_id: poNumber, created_at: at });
}
