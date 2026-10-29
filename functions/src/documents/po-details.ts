import { randomUUID } from "node:crypto";

import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { callerOf, requireRole } from "./caller.js";
import { amount, list, record, requiredText, text } from "./validate.js";

/**
 * Completing and correcting a Purchase Order's details (21 Oct 2026).
 *
 * Every document field — supplier, address, TIN, contact, mode of
 * procurement, place and date of delivery, terms, BAC references, stock
 * numbers — is optional: an order may be printed with blanks and completed by
 * hand. Filling in a blank is a completion. Changing or clearing a value
 * already recorded, or changing the items' descriptions, quantities, units or
 * costs, is a correction: on an approved order it needs a reason, and every
 * change is recorded with its before and after values. The authorization (the
 * approval steps, the items as authorized, the signatory copy and the PO
 * date) is never changed here.
 *
 * Administrators only; not for a voided order, a Released or Completed order
 * from the earlier workflow, or one already issued to the supplier.
 */

type Row = Record<string, unknown>;

const FIELDS: { key: string; input: string; label: string; max: number }[] = [
  { key: "supplier_name", input: "supplierName", label: "Supplier", max: 300 },
  { key: "supplier_address", input: "supplierAddress", label: "Address", max: 500 },
  { key: "supplier_tin", input: "supplierTin", label: "TIN", max: 40 },
  { key: "supplier_contact", input: "supplierContact", label: "Contact number", max: 200 },
  { key: "mode_of_procurement", input: "modeOfProcurement", label: "Mode of procurement", max: 200 },
  { key: "delivery_address", input: "deliveryAddress", label: "Place of delivery", max: 500 },
  { key: "expected_delivery", input: "expectedDelivery", label: "Date of delivery", max: 100 },
  { key: "delivery_term", input: "deliveryTerm", label: "Delivery term", max: 200 },
  { key: "payment_term", input: "paymentTerm", label: "Payment term", max: 200 },
  { key: "bac_resolution_no", input: "bacResolutionNo", label: "BAC resolution no.", max: 60 },
  { key: "bac_resolution_series", input: "bacResolutionSeries", label: "BAC resolution series", max: 10 },
];

const EDITABLE = ["Draft", "Pending Approval", "Approved"];
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

interface Change {
  field: string;
  from: string;
  to: string;
  kind: "completed" | "corrected";
}

export const updatePurchaseOrderDetails = onCall(async (request) => {
  const caller = await callerOf(request);
  requireRole(caller, ["Administrator"], "change purchase orders");
  const uid = caller.kind === "staff" ? caller.uid : "";
  const input = record(request.data ?? {});
  const id = requiredText(input.id, "Purchase order", 40);
  const by =
    text(input.by, "Name", { max: 200, optional: true })?.trim() ||
    (caller.kind === "staff" ? caller.email || caller.uid : "Administrator");
  const reason = text(input.reason, "Reason", { max: 1000, optional: true })?.trim() ?? "";
  const details = record(input.details ?? {});
  const values = Object.fromEntries(
    FIELDS.map((f) => [f.key, text(details[f.input], f.label, { max: f.max, optional: true })?.trim() ?? ""]),
  );
  if (values.expected_delivery && !/^\d{4}-\d{2}-\d{2}$/.test(values.expected_delivery)) {
    throw new HttpsError("invalid-argument", "Date of delivery must be YYYY-MM-DD.");
  }
  // The items are the order's essential data: each keeps a description, quantity, unit and cost.
  const items =
    details.items === undefined
      ? undefined
      : list(
          details.items,
          "Items",
          (it, i) => ({
            id: text(it.id, `Item ${i + 1} id`, { max: 100, optional: true }) ?? "",
            description: requiredText(it.description, `Item ${i + 1} description`, 1000).trim(),
            quantity: amount(it.quantity, `Item ${i + 1} quantity`, { positive: true }),
            unit: requiredText(it.unit, `Item ${i + 1} unit`, 30).trim(),
            unitCost: amount(it.unitCost, `Item ${i + 1} unit cost`, { positive: true }),
            stockNo: text(it.stockNo, `Item ${i + 1} stock/property no.`, { max: 60, optional: true })?.trim() || null,
          }),
          { min: 1 },
        );
  const db = getFirestore();

  return db.runTransaction(async (tx) => {
    const ref = db.collection("purchase_orders").doc(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", `Purchase order ${id} was not found.`);
    const po: Row = { ...snap.data(), id };
    const number = String(po.po_number ?? id);
    if (!EDITABLE.includes(String(po.status)) || po.issued_at) {
      throw new HttpsError(
        "failed-precondition",
        `${number} is ${po.issued_at ? "issued to the supplier" : String(po.status)} and is not changed any more.`,
      );
    }

    const changes: Change[] = [];
    const patch: Row = {};
    for (const f of FIELDS) {
      const before = str(po[f.key]);
      const after = values[f.key];
      if (before === after) continue;
      changes.push({ field: f.label, from: before, to: after, kind: before ? "corrected" : "completed" });
      patch[f.key] = after || null;
    }
    // The supplier is stored as text, blank when not yet known.
    if ("supplier_name" in patch) patch.supplier_name = values.supplier_name;

    if (items) {
      const old = ((po.items as Row[]) ?? []).map((it) => ({
        id: str(it.id),
        description: str(it.description),
        quantity: Number(it.quantity),
        unit: str(it.unit),
        unitCost: Number(it.unitCost),
        stockNo: str(it.stockNo),
      }));
      const essential = (it: { description: string; quantity: number; unit: string; unitCost: number }) =>
        `${it.description}|${it.quantity}|${it.unit}|${it.unitCost}`;
      if (old.length !== items.length) {
        changes.push({ field: "Items", from: `${old.length} lines`, to: `${items.length} lines`, kind: "corrected" });
      }
      items.forEach((it, i) => {
        const was = old[i];
        if (!was) {
          changes.push({ field: `Item ${i + 1}`, from: "", to: `${it.quantity} ${it.unit} ${it.description} at ${it.unitCost}`, kind: "corrected" });
          return;
        }
        if (essential(was) !== essential(it)) {
          changes.push({
            field: `Item ${i + 1}`,
            from: `${was.quantity} ${was.unit} ${was.description} at ${was.unitCost}`,
            to: `${it.quantity} ${it.unit} ${it.description} at ${it.unitCost}`,
            kind: "corrected",
          });
        }
        if (was.stockNo !== str(it.stockNo)) {
          changes.push({
            field: `Item ${i + 1} stock/property no.`,
            from: was.stockNo,
            to: str(it.stockNo),
            kind: was.stockNo ? "corrected" : "completed",
          });
        }
      });
      for (let i = items.length; i < old.length; i++) {
        changes.push({ field: `Item ${i + 1}`, from: `${old[i].quantity} ${old[i].unit} ${old[i].description}`, to: "", kind: "corrected" });
      }
      if (changes.some((c) => c.field.startsWith("Item"))) {
        patch.items = items.map((it, i) => ({ ...it, id: it.id || old[i]?.id || randomUUID() }));
      }
    }

    if (changes.length === 0) return po;
    const corrections = changes.filter((c) => c.kind === "corrected");
    if (po.status === "Approved" && corrections.length > 0 && reason.length < 5) {
      throw new HttpsError(
        "failed-precondition",
        `Give the reason for correcting ${number} (${corrections.map((c) => c.field).join(", ")}). It is kept in the order's history.`,
      );
    }

    const at = new Date().toISOString();
    const summary = changes.map((c) => `${c.field}: ${c.from || "blank"} → ${c.to || "blank"}`).join("; ");
    patch.history = [
      ...((po.history as unknown[]) ?? []),
      {
        id: randomUUID(),
        kind: corrections.length ? "correction" : "update",
        text: (corrections.length
          ? `Corrected by ${by}${reason ? ` (${reason})` : ""}: ${summary}`
          : `Details completed by ${by}: ${summary}`
        ).slice(0, 2000),
        at,
        by,
        changes,
        ...(reason ? { reason } : {}),
      },
    ];
    patch.updated_at = at;
    patch.updated_by_uid = uid;
    tx.update(ref, patch);
    return { ...po, ...patch };
  });
});
