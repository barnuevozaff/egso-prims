import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { callerOf, requireRole } from "./caller.js";
import { record, requiredText, text } from "./validate.js";

/**
 * Approving a requisition and issue slip (22 Oct 2026). Approval is the
 * issuance: there is no separate Release step. In one transaction:
 *
 *   - the slip must be Pending Approval; every line that issues stock must be
 *     linked to an inventory item, and the register must hold enough of each
 *     (lines drawing on one item are added up);
 *   - each issued quantity is deducted from its item, with an "RIS Release"
 *     stock-card line under the slip's number (the type voidReleasedRis reads
 *     to give the stock back if the slip is voided);
 *   - the slip becomes Approved, stamped with who approved it and when, and
 *     with stock_issued_at, which firestore.rules keep from then on.
 *
 * Any shortfall or missing item aborts everything: no balance moves and the
 * slip stays pending. Approving a slip that is already approved, or that was
 * released under the earlier workflow, returns it unchanged — a double click,
 * a retry or a second Administrator at the same moment never deducts twice
 * (concurrent approvals serialize on the slip document).
 *
 * Administrators only, as for every other change to the register.
 */

type Row = Record<string, unknown>;

interface Line {
  id: string;
  name: string;
  unit: string;
  inventoryItemId?: string;
  issuedQty: number;
}

export const approveRisRequest = onCall(async (request) => {
  const caller = await callerOf(request);
  requireRole(caller, ["Administrator"], "approve requisition slips");
  const uid = caller.kind === "staff" ? caller.uid : "";
  const input = record(request.data ?? {});
  const id = requiredText(input.id, "Slip", 100);
  const by = text(input.by, "Name", { max: 200, optional: true })?.trim() || (caller.kind === "staff" ? caller.email : "") || "Administrator";
  const office = text(input.office, "Office", { max: 200, optional: true })?.trim() || "General Services Office";
  const db = getFirestore();
  const risRef = db.collection("ris_requests").doc(id);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(risRef);
    if (!snap.exists) throw new HttpsError("not-found", "That slip no longer exists.");
    const ris: Row = { ...snap.data(), id };
    const number = String(ris.ris_number ?? id);

    // Already issued — now, by an earlier attempt, or under the old Release step.
    if ((ris.status === "Approved" && ris.stock_issued_at) || ris.status === "Released" || ris.status === "Completed") {
      return ris;
    }
    if (ris.status !== "Pending Approval") {
      throw new HttpsError("failed-precondition", `${number} is ${String(ris.status)}; only a pending slip can be approved.`);
    }

    const lines = ((ris.items as Line[]) ?? []).map((it) => ({ ...it, issuedQty: Number(it.issuedQty ?? 0) }));
    const issuing = lines.filter((it) => it.issuedQty > 0);
    if (issuing.length === 0) {
      throw new HttpsError("failed-precondition", `${number} has nothing to issue. Set the quantities to issue first.`);
    }
    const unlinked = issuing.filter((it) => !it.inventoryItemId);
    if (unlinked.length) {
      throw new HttpsError(
        "failed-precondition",
        `Choose the inventory item for ${unlinked.map((it) => it.name).join(", ")} before approving ${number}.`,
      );
    }

    // What the slip takes from each item, in total.
    const wanted = new Map<string, number>();
    for (const it of issuing) wanted.set(it.inventoryItemId!, (wanted.get(it.inventoryItemId!) ?? 0) + it.issuedQty);
    const ids = [...wanted.keys()];
    const items = await Promise.all(ids.map((itemId) => tx.get(db.collection("inventory_items").doc(itemId))));
    const missing = items.flatMap((s, i) => (s.exists ? [] : [issuing.find((it) => it.inventoryItemId === ids[i])?.name ?? ids[i]]));
    if (missing.length) {
      throw new HttpsError("failed-precondition", `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} no longer in the inventory.`);
    }
    const short = items.flatMap((s, i) => {
      const onHand = Number(s.get("on_hand") ?? 0);
      const need = wanted.get(ids[i]) ?? 0;
      return need > onHand ? [`${String(s.get("name") ?? ids[i])}: ${need} needed, ${onHand} on hand`] : [];
    });
    if (short.length) {
      throw new HttpsError("failed-precondition", `Not enough stock to approve ${number} — ${short.join("; ")}. Nothing was deducted.`);
    }

    // Writes: one stock-card line per slip line, then each item's new balance, then the slip.
    const at = new Date().toISOString();
    const balances = new Map(items.map((s, i) => [ids[i], Number(s.get("on_hand") ?? 0)]));
    const itemHistory = new Map(items.map((s, i) => [ids[i], [...((s.get("history") as unknown[]) ?? [])]]));
    const risHistory = [...((ris.history as unknown[]) ?? [])];
    for (const it of issuing) {
      const itemId = it.inventoryItemId!;
      const balance = balances.get(itemId)! - it.issuedQty;
      balances.set(itemId, balance);
      const itemSnap = items[ids.indexOf(itemId)];
      const itemName = String(itemSnap.get("name") ?? it.name);
      const unit = String(itemSnap.get("unit") ?? it.unit);
      const lineId = `stk-${id}-${it.id}`;
      tx.create(db.collection("stock_card").doc(lineId), {
        id: lineId,
        date: at,
        document_number: number,
        type: "RIS Release",
        // The requesting office: the Stock Card's "Issue - Office" column.
        office: String(ris.department_code ?? "") || null,
        item_id: itemId,
        item_name: itemName,
        quantity_in: 0,
        quantity_out: it.issuedQty,
        balance,
        remarks: `Issued on approval of ${number}`,
        user_name: by,
        created_by_uid: uid,
      });
      itemHistory.get(itemId)!.push({ id: lineId, kind: "update", text: `${number}: −${it.issuedQty} ${unit} issued (balance ${balance})`, at });
      risHistory.push({ id: `${lineId}-h`, kind: "update", text: `Stock card: ${itemName} −${it.issuedQty} (balance ${balance})`, at });
    }
    for (const [itemId, balance] of balances) {
      tx.update(db.collection("inventory_items").doc(itemId), {
        on_hand: balance,
        history: itemHistory.get(itemId),
        updated_at: at,
        updated_by_uid: uid,
      });
    }
    const patch: Row = {
      status: "Approved",
      approvals: [...((ris.approvals as unknown[]) ?? []), { step: "Approved", by, office, at, byUid: uid }],
      history: [...risHistory, { id: `${id}-approved-${at}`, kind: "status", text: "Status → Approved (stock issued)", at }],
      issued_by: by,
      issue_date: at.slice(0, 10),
      approved_at: at,
      approved_by: by,
      approved_by_uid: uid,
      stock_issued_at: at,
      stock_issued_by_uid: uid,
      updated_at: at,
      updated_by_uid: uid,
    };
    tx.update(risRef, patch);
    return { ...ris, ...patch };
  });
});
