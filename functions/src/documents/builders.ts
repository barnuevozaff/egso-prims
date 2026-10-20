import { randomUUID } from "node:crypto";

import { HttpsError } from "firebase-functions/v2/https";

import { amount, attachments, clockTime, isoDate, list, record, requiredText, text } from "./validate.js";

/**
 * The documents the create functions write. Each one is the row the browser
 * inserted into Supabase before — same fields, same history and approval
 * entries, same wording — built from validated input. Kept free of Firestore
 * so the shapes can be unit-tested.
 */

export type Row = Record<string, unknown>;

const uid = () => randomUUID();

const opt = (value: unknown, label: string, max = 500) => text(value, label, { max, optional: true });
/** Supabase stored a blank optional field as null; so do these documents. */
const trimmedOrNull = (value: string | undefined) => value?.trim() || null;

function withAttachments(input: Row, at: string) {
  return attachments(input.attachments).map((a) => ({ ...a, id: uid(), uploadedAt: at }));
}

/* ---------------- Purchase request (PR) ---------------- */

export function parsePurchaseRequest(raw: unknown) {
  const input = record(raw);
  return {
    departmentCode: requiredText(input.departmentCode, "Office", 20),
    requester: requiredText(input.requester, "Requested by", 200),
    purpose: requiredText(input.purpose, "Purpose", 2000),
    fundingSource: requiredText(input.fundingSource, "Fund", 100),
    requestDate: isoDate(input.requestDate, "Date"),
    items: list(
      input.items,
      "Items",
      (it, i) => ({
        description: requiredText(it.description, `Item ${i + 1} description`, 1000),
        quantity: amount(it.quantity, `Item ${i + 1} quantity`, { positive: true }),
        unit: requiredText(it.unit, `Item ${i + 1} unit`, 30),
        estimatedCost: amount(it.estimatedCost, `Item ${i + 1} unit cost`),
      }),
      { min: 1 },
    ),
    raw: input,
  };
}

export function buildPurchaseRequest(raw: unknown, prNumber: string, at: string): Row {
  const input = parsePurchaseRequest(raw);
  return {
    id: prNumber,
    pr_number: prNumber,
    department_code: input.departmentCode,
    requester: input.requester,
    purpose: input.purpose,
    funding_source: input.fundingSource,
    request_date: input.requestDate,
    status: "Submitted",
    items: input.items.map((it) => ({ ...it, id: uid() })),
    attachments: withAttachments(input.raw, at),
    comments: [],
    history: [
      { id: uid(), kind: "create", text: `${prNumber} created by ${input.requester}`, at },
      { id: uid(), kind: "status", text: "Submitted for review", at },
    ],
    approvals: [
      { step: "Created", by: input.requester, at },
      { step: "Submitted", by: input.requester, at },
    ],
    created_at: at,
    updated_at: at,
  };
}

/* ---------------- Purchase order (PO) ---------------- */

export function buildPurchaseOrder(raw: unknown, poNumber: string, at: string, asDraft: boolean): Row {
  const input = record(raw);
  const prNumber = requiredText(input.prNumber, "Purchase request", 40);
  const items = list(
    input.items,
    "Items",
    (it, i) => ({
      description: requiredText(it.description, `Item ${i + 1} description`, 1000),
      quantity: amount(it.quantity, `Item ${i + 1} quantity`, { positive: true }),
      unit: requiredText(it.unit, `Item ${i + 1} unit`, 30),
      unitCost: amount(it.unitCost, `Item ${i + 1} unit cost`),
    }),
    { min: 1 },
  );
  const by = { by: "Administrator", office: "General Services Office", at };
  return {
    id: poNumber,
    po_number: poNumber,
    pr_number: prNumber,
    department_code: requiredText(input.departmentCode, "Office", 20),
    requester: requiredText(input.requester, "Requested by", 200),
    purpose: requiredText(input.purpose, "Purpose", 2000),
    supplier_name: requiredText(input.supplierName, "Supplier", 300),
    supplier_address: trimmedOrNull(opt(input.supplierAddress, "Supplier address")),
    supplier_tin: trimmedOrNull(opt(input.supplierTin, "Supplier TIN", 40)),
    supplier_contact: trimmedOrNull(opt(input.supplierContact, "Supplier contact", 200)),
    mode_of_procurement: trimmedOrNull(opt(input.modeOfProcurement, "Mode of procurement", 200)),
    payment_term: trimmedOrNull(opt(input.paymentTerm, "Payment term", 200)),
    delivery_term: trimmedOrNull(opt(input.deliveryTerm, "Delivery term", 200)),
    municipal_mayor: trimmedOrNull(opt(input.municipalMayor, "Municipal Mayor", 200)),
    bac_secretary: trimmedOrNull(opt(input.bacSecretary, "BAC Secretary", 200)),
    delivery_address: requiredText(input.deliveryAddress, "Place of delivery", 500),
    expected_delivery: requiredText(input.expectedDelivery, "Date of delivery", 100),
    issued_date: at.slice(0, 10),
    status: asDraft ? "Draft" : "Pending Approval",
    items: items.map((it) => ({ ...it, id: uid() })),
    attachments: withAttachments(input, at),
    comments: [],
    history: [
      { id: uid(), kind: "create", text: `${poNumber} created from ${prNumber}`, at },
      ...(asDraft ? [] : [{ id: uid(), kind: "status", text: "Status → Pending Approval", at }]),
    ],
    approvals: [{ step: "Created", ...by }, ...(asDraft ? [] : [{ step: "Pending Approval", ...by }])],
    created_at: at,
    updated_at: at,
  };
}

/* ---------------- Requisition and issue slip (RIS) ---------------- */

export function buildRisRequest(raw: unknown, risNumber: string, at: string, asDraft: boolean): Row {
  const input = record(raw);
  const prNumber = opt(input.prNumber, "Purchase request", 40);
  const items = list(
    input.items,
    "Items",
    (it, i) => ({
      ...(it.inventoryItemId !== undefined
        ? { inventoryItemId: requiredText(it.inventoryItemId, `Item ${i + 1} stock item`, 100) }
        : {}),
      ...(it.stockNo !== undefined ? { stockNo: opt(it.stockNo, `Item ${i + 1} stock no.`, 40) } : {}),
      name: requiredText(it.name, `Item ${i + 1} description`, 500),
      unit: requiredText(it.unit, `Item ${i + 1} unit`, 30),
      requestedQty: amount(it.requestedQty, `Item ${i + 1} quantity requested`, { positive: true }),
      issuedQty: amount(it.issuedQty, `Item ${i + 1} quantity issued`),
    }),
    { min: 1 },
  );
  const by = { by: "Administrator", office: "General Services Office", at };
  return {
    id: risNumber,
    ris_number: risNumber,
    pr_number: trimmedOrNull(prNumber),
    fund: trimmedOrNull(opt(input.fund, "Fund", 100)),
    division: trimmedOrNull(opt(input.division, "Division", 200)),
    fpp_code: trimmedOrNull(opt(input.fppCode, "FPP code", 100)),
    po_number: opt(input.poNumber, "Purchase order", 40) ?? null,
    department_code: requiredText(input.departmentCode, "Office", 20),
    requester: requiredText(input.requester, "Requested by", 200),
    purpose: requiredText(input.purpose, "Purpose", 2000),
    issued_by: "Administrator",
    received_by: requiredText(input.receivedBy, "Received by", 200),
    issue_date: at.slice(0, 10),
    status: asDraft ? "Draft" : "Pending Approval",
    items: items.map((it) => ({ ...it, id: uid() })),
    attachments: withAttachments(input, at),
    comments: [],
    history: [
      // The browser version wrote "created from undefined" for portal slips,
      // which have no purchase request.
      { id: uid(), kind: "create", text: prNumber ? `${risNumber} created from ${prNumber}` : `${risNumber} created`, at },
      ...(asDraft ? [] : [{ id: uid(), kind: "status", text: "Status → Pending Approval", at }]),
    ],
    approvals: [{ step: "Created", ...by }, ...(asDraft ? [] : [{ step: "Pending Approval", ...by }])],
    created_at: at,
    updated_at: at,
  };
}

/* ---------------- Facility reservation (FR) ---------------- */

/** "8:30" or "08:30" → 510. clockTime() has already checked the format. */
export const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export function parseReservation(raw: unknown) {
  const input = record(raw);
  const startTime = clockTime(input.startTime, "Start time");
  const endTime = clockTime(input.endTime, "End time");
  if (minutesOf(endTime) <= minutesOf(startTime)) {
    throw new HttpsError("invalid-argument", "End time must be after the start time.");
  }
  return {
    facilityId: requiredText(input.facilityId, "Facility", 200),
    departmentCode: requiredText(input.departmentCode, "Office", 20),
    borrower: requiredText(input.borrower, "Requested by", 200),
    contactNumber: requiredText(input.contactNumber, "Contact number", 50),
    purpose: requiredText(input.purpose, "Purpose", 2000),
    date: isoDate(input.date, "Date"),
    startTime,
    endTime,
    equipment: list(
      input.equipment,
      "Equipment",
      (e, i) => ({
        equipmentId: requiredText(e.equipmentId, `Equipment ${i + 1}`, 100),
        name: requiredText(e.name, `Equipment ${i + 1} name`, 200),
        quantity: amount(e.quantity, `Equipment ${i + 1} quantity`, { positive: true }),
        ...(e.remarks !== undefined ? { remarks: opt(e.remarks, `Equipment ${i + 1} remarks`) } : {}),
      }),
      { max: 50 },
    ),
    raw: input,
  };
}

export function buildReservation(raw: unknown, resNumber: string, at: string): Row {
  const input = parseReservation(raw);
  return {
    id: resNumber,
    res_number: resNumber,
    facility_id: input.facilityId,
    department_code: input.departmentCode,
    borrower: input.borrower,
    contact_number: input.contactNumber,
    purpose: input.purpose,
    date: input.date,
    start_time: input.startTime,
    end_time: input.endTime,
    equipment: input.equipment.map((e) => ({ ...e, id: uid() })),
    status: "Pending",
    attachments: withAttachments(input.raw, at),
    comments: [],
    history: [
      { id: uid(), kind: "create", text: `${resNumber} created by ${input.borrower}`, at },
      { id: uid(), kind: "status", text: "Status → Pending", at },
    ],
    approvals: [
      { step: "Created", by: input.borrower, at },
      { step: "Reviewed", by: "Marites Villanueva", office: "General Services Office", at },
    ],
    created_at: at,
    updated_at: at,
  };
}
