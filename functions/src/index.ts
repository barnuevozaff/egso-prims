// Must load first: refuses any project other than egso-b2c0a (or an offline
// demo-* emulator project), then sets the region for every function.
import "./setup.js";

export { nextDocumentNumber } from "./numbering.js";
export { recordEvents } from "./audit.js";
export { cascadeDeletes } from "./cascade.js";
export {
  createPurchaseOrder,
  createPurchaseRequest,
  createReservation,
  createRisRequest,
} from "./documents/create.js";
export { portalStockSuggestions } from "./documents/stock-suggestions.js";
export { addInventoryStock, createInventoryItems } from "./documents/inventory.js";
export { reservationAvailability } from "./documents/availability.js";
export { updateReservation } from "./documents/update-reservation.js";
export { createFuelTrip, createNumberedRecord, recordViolation } from "./documents/numbered-records.js";
export { correctUtilityRecord, voidUtilityRecord } from "./documents/utility-records.js";
export { deleteRecordHolders, setRecordHolderArchived } from "./documents/record-holders.js";
export { createUtilityEntry } from "./documents/utility-entries.js";
export { voidReleasedRis } from "./documents/void-ris.js";
export { approveRisRequest } from "./documents/approve-ris.js";
export { saveRecordsDocument, voidRecordsDocument } from "./records/documents.js";
export { createRecordShelf, deleteRecordShelf, moveRecordBox } from "./records/room.js";
export { approvePurchaseRequest } from "./documents/approve-pr.js";
export { voidPurchaseRequest } from "./documents/void-pr.js";
export { deleteDemoPurchaseRequests } from "./documents/demo-cleanup.js";
export { approvePurchaseOrder } from "./documents/approve-po.js";
export { ensurePurchaseOrderForPR } from "./documents/ensure-po.js";
export { updatePurchaseOrderDetails } from "./documents/po-details.js";
export { listOffices, manageOffice } from "./offices.js";
