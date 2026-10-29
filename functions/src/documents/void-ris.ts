import { randomUUID } from "node:crypto";

import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { callerOf, requireRole } from "./caller.js";
import { record, requiredText, text } from "./validate.js";

/**
 * Voids an issued requisition and issue slip, putting its stock back: one
 * Approved since 22 Oct 2026 (approval issues the stock), or Released under
 * the earlier workflow.
 *
 * Releasing a slip took stock out (an "RIS Release" stock-card line per
 * item). Voiding it returns exactly what those lines took — not what the
 * slip's lines say now — as "Return" lines under the same document number,
 * and closes the slip as Cancelled with the reason, signed by the account
 * that voided it. All of it happens in one transaction: if an item has been
 * removed from the register since, nothing changes and the stock has to be
 * corrected by hand first.
 *
 * Administrators only. A slip voided before release took no stock and is
 * voided in the browser (firestore.rules); a Completed slip is final and is
 * never reversed automatically.
 */

type Row = Record<string, unknown>;

export const voidReleasedRis = onCall(async (request) => {
  const caller = await callerOf(request);
  requireRole(caller, ["Administrator"], "void a released slip");
  const uid = caller.kind === "staff" ? caller.uid : "";
  const input = record(request.data ?? {});
  const id = requiredText(input.id, "Slip", 100);
  const reason = requiredText(input.reason, "Reason", 500).trim();
  if (!reason) throw new HttpsError("invalid-argument", "Give a reason for voiding the slip.");
  const by = text(input.by, "Name", { max: 200, optional: true })?.trim() || "Administrator";
  const office = text(input.office, "Office", { max: 200, optional: true })?.trim() || null;
  const db = getFirestore();
  const risRef = db.collection("ris_requests").doc(id);

  return db.runTransaction(async (tx) => {
    const risSnap = await tx.get(risRef);
    if (!risSnap.exists) throw new HttpsError("not-found", "That slip no longer exists.");
    const ris: Row = { ...risSnap.data(), id };
    const number = String(ris.ris_number);
    const issued = ris.status === "Released" || (ris.status === "Approved" && !!ris.stock_issued_at);
    if (!issued) {
      throw new HttpsError("failed-precondition", `${number} is ${ris.status}; only an issued slip has stock to return.`);
    }
    if (ris.stock_reversed_at) {
      throw new HttpsError("failed-precondition", `${number}'s stock has already been returned.`);
    }

    // What the release took, less anything already returned, per item.
    const lines = await tx.get(db.collection("stock_card").where("document_number", "==", number));
    const owed = new Map<string, { name: string; quantity: number }>();
    for (const line of lines.docs) {
      const type = line.get("type");
      if (type !== "RIS Release" && type !== "Return") continue;
      const itemId = String(line.get("item_id"));
      const entry = owed.get(itemId) ?? { name: String(line.get("item_name") ?? itemId), quantity: 0 };
      entry.quantity += type === "RIS Release" ? Number(line.get("quantity_out") ?? 0) : -Number(line.get("quantity_in") ?? 0);
      owed.set(itemId, entry);
    }
    const returns = [...owed.entries()].filter(([, e]) => e.quantity > 0);

    const items = await Promise.all(returns.map(([itemId]) => tx.get(db.collection("inventory_items").doc(itemId))));
    const missing = items.flatMap((snap, i) => (snap.exists ? [] : [returns[i][1].name]));
    if (missing.length) {
      throw new HttpsError(
        "failed-precondition",
        `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} no longer in the inventory, so the stock cannot be returned automatically. Correct the stock by hand, then void the slip.`,
      );
    }

    const at = new Date().toISOString();
    const risHistory = [...((ris.history as unknown[]) ?? [])];
    returns.forEach(([itemId, entry], i) => {
      const item = items[i];
      const unit = String(item.get("unit") ?? "");
      const balance = Number(item.get("on_hand") ?? 0) + entry.quantity;
      const lineId = `stk-${randomUUID()}`;
      tx.create(db.collection("stock_card").doc(lineId), {
        id: lineId,
        date: at,
        document_number: number,
        type: "Return",
        item_id: itemId,
        item_name: String(item.get("name") ?? entry.name),
        quantity_in: entry.quantity,
        quantity_out: 0,
        balance,
        remarks: `${number} voided: ${reason}`,
        user_name: by,
        created_by_uid: uid,
      });
      tx.update(item.ref, {
        on_hand: balance,
        updated_at: at,
        updated_by_uid: uid,
        history: [
          ...((item.get("history") as unknown[]) ?? []),
          { id: randomUUID(), kind: "update", text: `${number} voided: +${entry.quantity} ${unit} returned (balance ${balance})`, at },
        ],
      });
      risHistory.push({
        id: randomUUID(),
        kind: "update",
        text: `Stock card: ${entry.name} +${entry.quantity} returned (balance ${balance})`,
        at,
      });
    });

    const patch: Row = {
      status: "Cancelled",
      approvals: [
        ...((ris.approvals as unknown[]) ?? []),
        { step: "Cancelled", by, office, at, remarks: reason, byUid: uid },
      ],
      history: [...risHistory, { id: randomUUID(), kind: "status", text: `Status → Cancelled: ${reason}`, at }],
      stock_reversed_at: at,
      stock_reversed_by_uid: uid,
      updated_at: at,
      updated_by_uid: uid,
    };
    tx.update(risRef, patch);
    return { ...ris, ...patch };
  });
});
