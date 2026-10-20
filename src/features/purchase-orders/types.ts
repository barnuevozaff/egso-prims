import type { AttachmentRecord } from "@/features/shared/attachment-list";
import type { ThreadComment } from "@/features/shared/comment-thread";
import type { HistoryEntry } from "@/features/shared/history-feed";

/** Purchase Order domain types. Shapes mirror the future Supabase schema. */

export type POStatus =
  | "Draft"
  | "Pending Approval"
  | "Approved"
  | "Released"
  | "Completed"
  | "Cancelled";

export const PO_STATUSES: POStatus[] = [
  "Draft",
  "Pending Approval",
  "Approved",
  "Released",
  "Completed",
  "Cancelled",
];

/**
 * Stages an order can still be voided from — and only while it has not been
 * issued to the supplier. A Released or Completed order is final.
 */
export const VOIDABLE_PO_STATUSES: POStatus[] = ["Draft", "Pending Approval", "Approved"];

export const canVoidPO = (po: Pick<PurchaseOrder, "status" | "issuedAt">) =>
  VOIDABLE_PO_STATUSES.includes(po.status) && !po.issuedAt;

export interface Supplier {
  id: string;
  name: string;
  address: string;
  contact: string;
  /** Contact person for the account. */
  contactPerson?: string;
  email?: string;
}

export const SUPPLIERS: Supplier[] = [
  { id: "sup-1", name: "Alaminos Trading & Supply", address: "142 Rizal St., Poblacion, Alaminos, Laguna", contact: "(049) 521-3344", contactPerson: "Mr. Roberto Alcantara", email: "sales@alaminostrading.ph" },
  { id: "sup-2", name: "Laguna Builders Depot", address: "KM 78 Maharlika Hwy., San Pablo City, Laguna", contact: "(049) 562-8890", contactPerson: "Ms. Edna Marasigan", email: "orders@lagunabuilders.ph" },
  { id: "sup-3", name: "MedSouth Pharma Distributors", address: "8 J.P. Laurel Ave., Calamba, Laguna", contact: "(049) 545-1272", contactPerson: "Mr. Hector Lim", email: "accounts@medsouth.ph" },
  { id: "sup-4", name: "Southern Agri Supply Co.", address: "Brgy. San Gregorio, Alaminos, Laguna", contact: "0917 884 2210", contactPerson: "Mr. Isagani Roque", email: "southernagri@gmail.com" },
  { id: "sup-5", name: "Prime Office Systems Inc.", address: "33 Gomez St., San Pablo City, Laguna", contact: "(049) 503-6611", contactPerson: "Ms. Katrina Velasco", email: "quotes@primeoffice.ph" },
  { id: "sup-6", name: "GreenLeaf School & Office Supplies", address: "19 Mabini St., Poblacion, Alaminos, Laguna", contact: "0918 445 7789", contactPerson: "Mrs. Lourdes Pineda", email: "greenleaf.alaminos@gmail.com" },
  { id: "sup-7", name: "Lakeshore IT Solutions", address: "2F Lakeview Bldg., Los Baños, Laguna", contact: "(049) 536-2450", contactPerson: "Engr. Marvin Dizon", email: "support@lakeshoreit.ph" },
  { id: "sup-8", name: "Cavinti Industrial Hardware", address: "77 National Rd., Sta. Cruz, Laguna", contact: "(049) 501-9932", contactPerson: "Mr. Danilo Ocampo", email: "cavintihardware@yahoo.com" },
];

export function supplierById(id?: string): Supplier | undefined {
  return id ? SUPPLIERS.find((s) => s.id === id) : undefined;
}

/**
 * Supplier as it should be displayed. Orders raised since the picker was
 * removed carry the name directly; older ones resolve it from the register.
 */
export function poSupplierName(
  po: Pick<PurchaseOrder, "supplierName" | "supplierId">,
): string {
  return po.supplierName || supplierById(po.supplierId)?.name || "—";
}

export interface POItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  /** Agreed unit cost in PHP. */
  unitCost: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  /** Source purchase request this PO was raised from. */
  prNumber: string;
  departmentCode: string;
  requester: string;
  purpose: string;
  /** Legacy link to the fixed supplier register; suppliers are now typed. */
  supplierId?: string;
  supplierName: string;
  supplierAddress?: string;
  supplierTin?: string;
  supplierContact?: string;
  modeOfProcurement?: string;
  paymentTerm?: string;
  deliveryTerm?: string;
  /** Officials who sign the printed order. */
  municipalMayor?: string;
  bacSecretary?: string;
  deliveryAddress: string;
  /** Expected delivery date (ISO date). */
  expectedDelivery: string;
  /** Date the PO was issued (ISO date). */
  issuedDate: string;
  status: POStatus;
  /**
   * Post-approval handover to the supplier. These are not workflow statuses —
   * the approval timeline records internal approval only — so they are kept as
   * their own stamps and drive the Issue / Acknowledge actions.
   */
  issuedAt?: string;
  issuedBy?: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  items: POItem[];
  attachments: AttachmentRecord[];
  comments: ThreadComment[];
  history: HistoryEntry[];
  approvals: { step: string; by?: string; office?: string; at?: string; remarks?: string }[];
  createdAt: string;
  updatedAt: string;
}

export function poTotal(po: Pick<PurchaseOrder, "items">): number {
  return po.items.reduce((sum, it) => sum + it.quantity * it.unitCost, 0);
}

/** Filters accepted by the list endpoint (maps 1:1 to future Supabase query). */
export interface POListFilters {
  search?: string;
  departmentCode?: string;
  supplierName?: string;
  status?: POStatus;
  dateFrom?: Date;
  dateTo?: Date;
}
