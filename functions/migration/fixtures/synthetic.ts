import type { Row } from "../plan.ts";

/**
 * A small, entirely made-up Supabase export in the shape PostgREST returns
 * (Postgres column names, timestamptz as text). No real municipal records.
 * Used by the migration tests; never imported anywhere else.
 */

const TS = "2026-09-30 08:15:00+08";

export const SYNTHETIC: Record<string, Row[]> = {
  suppliers: [{ id: "sup-t1", name: "Test Supplies Co.", address: "Test address", contact: "0917 000 0000", contact_person: null, email: null }],
  system_configuration: [{ id: "cfg-1", category: "Numbering", key: "padding", value: 6 }],
  purchase_requests: [
    {
      id: "PR-2026-000041", pr_number: "PR-2026-000041", department_code: "GSO", requester: "Test Requester",
      purpose: "Bond paper (test data)", status: "Approved", created_at: TS, updated_at: TS, created_by_uid: null,
      items: [{ description: "Bond paper", quantity: 10, unit: "ream", estimatedCost: 250 }],
      attachments: [{ id: "a1", name: "q.pdf", url: "https://x.supabase.co/storage/v1/object/public/attachments/u1/q.pdf" }],
      approvals: [], history: [], comments: [],
    },
    {
      id: "PR-2025-000977", pr_number: "PR-2025-000977", department_code: "MHO", requester: "Test Requester",
      purpose: "Alcohol (test data)", status: "Completed", created_at: TS, updated_at: TS,
      items: [], attachments: [], approvals: [], history: [], comments: [],
    },
  ],
  purchase_orders: [{ id: "PO-2026-000012", po_number: "PO-2026-000012", status: "Approved", items: [], attachments: [], created_at: TS }],
  ris_requests: [{ id: "RIS-2026-000003", ris_number: "RIS-2026-000003", status: "Released", items: [], attachments: [], created_at: TS }],
  reservations: [{ id: "FR-2026-000005", res_number: "FR-2026-000005", status: "Approved", facility_id: "Session Hall", date: "2026-11-05", start_time: "08:00", end_time: "12:00", created_at: TS }],
  inventory_items: [
    { id: "inv-t1", item_code: "OS-0001", name: "Bond paper, A4 (test)", on_hand: 40, created_at: TS },
    { id: "inv-t2", item_code: "OS-0002", name: "Toner (test)", on_hand: 3, created_at: TS },
  ],
  stock_card: [
    { id: "stk-t1", item_id: "inv-t1", document_number: "RIS-2026-000003", type: "RIS Release", quantity_in: 0, quantity_out: 10, balance: 40, date: TS },
    { id: "stk-t2", item_id: "inv-t1", document_number: "FY26-OPEN", type: "Beginning Balance", quantity_in: 50, quantity_out: 0, balance: 50, date: TS },
  ],
  energy_accounts: [{ id: "ea-t1", account_number: "ACC-T-001", location: "Municipal Hall", meter_number: "M1", created_at: TS }],
  energy_bills: [
    { id: "6f1c-uuid-1", account_id: "ea-t1", billing_month: 8, billing_year: 2026, amount: 12000.55, kwh: 800, doc_number: "EC-2026-000007", created_at: TS },
    { id: "6f1c-uuid-2", account_id: "ea-t1", billing_month: 9, billing_year: 2026, amount: 13000.45, kwh: 850, doc_number: "EC-2026-000008", created_at: TS },
  ],
  energy_submeters: [{ id: "es-t1", account_id: "ea-t1", submeter_number: "S-1", submeter_name: "GSO wing", office_code: "GSO", status: "Active" }],
  energy_submeter_bills: [{ id: "esb-uuid-1", submeter_id: "es-t1", billing_month: 9, billing_year: 2026, amount: 1800, consumption: 120 }],
  water_accounts: [{ id: "wa-t1", account_number: "WAC/T/001", location: "Public Market", meter_number: "W1" }],
  water_bills: [{ id: "wb-uuid-1", account_id: "wa-t1", billing_month: 9, billing_year: 2026, amount: 2400, consumption: 60, doc_number: "WC-2026-000002" }],
  water_submeters: [{ id: "ws-t1", account_id: "wa-t1", submeter_number: "W-1", submeter_name: "Comfort room", assigned_office: "GSO", status: "Active" }],
  water_submeter_bills: [{ id: "wsb-uuid-1", submeter_id: "ws-t1", billing_month: 9, billing_year: 2026, amount: 300, consumption: 8 }],
  water_meter_readings: [{ id: "wmr-t1", submeter_id: "ws-t1", reading_date: "2026-09-30", previous_reading: 100, current_reading: 135.5, consumption: 35.5, amount: 700 }],
  fuel_vehicles: [{ id: "fv-t1", plate_number: "TST 1234", vehicle_name: "Test pickup", km_per_liter: 10, current_fuel_balance: 17 }],
  fuel_transactions: [{ id: "ft-t1", vehicle_id: "fv-t1", txn_date: "2026-09-12", liters: 40, price_per_liter: 62.5, total_amount: 2500, doc_number: "FC-2026-000004" }],
  fuel_odometer_readings: [{ id: "fod-t1", vehicle_id: "fv-t1", reading_date: "2026-09-30", previous_odometer: 1000, current_odometer: 1250, distance: 250, fuel_cost: 0, fuel_liters: 0 }],
  fuel_trips: [
    {
      id: "trp-t1", vehicle_id: "fv-t1", control_no: "2026-09-0014", trip_date: "2026-09-20", beginning_odometer: 1000, ending_odometer: 1080,
      km_per_liter: 10, beginning_fuel: 20, fuel_added: 5, distance_travelled: 80, fuel_total: 25, fuel_used: 8, ending_fuel: 17,
    },
  ],
  violators: [
    { id: "vlt-t1", full_name: "Tester, Juan", name_key: "tester juan" },
    { id: "vlt-t2", full_name: "Sample, Ana", name_key: "sample ana" },
  ],
  violations: [
    { id: "VT-2026-000010", violation_no: "VT-2026-000010", violator_id: "vlt-t1", amount: 500, amount_paid: 500, outstanding_balance: 0, payment_status: "Paid" },
    { id: "VT-2026-000011", violation_no: "VT-2026-000011", violator_id: "vlt-t2", amount: 1000, amount_paid: 0, outstanding_balance: 1000, payment_status: "Pending" },
  ],
  notifications: [{ id: "ntf-t1", title: "New Purchase Request Submitted", is_read: false, created_at: TS }],
  audit_logs: [
    { id: "AUD-2026-0154", timestamp: TS, action: "Record Created", module: "Purchase Requests", document_number: "PR-2026-000041" },
  ],
  document_counters: [
    { document_type: "PR", year: 2026, current_sequence: 41 },
    // Behind its data: PO-2026-000012 exists. The importer must raise it.
    { document_type: "PO", year: 2026, current_sequence: 9 },
    // The continuous counter (yearly reset off for a while).
    { document_type: "RIS", year: 0, current_sequence: 3 },
  ],
  // Records Management, in Supabase's shape: UUID levels and boxes.
  disposition_schedules: [
    { id: "rds-t1", schedule_no: "RDS-2026-000001", agency_name: "Test Agency", agency_address: "Test address", date_prepared: "2026-08-01", status: "Approved", created_at: TS },
  ],
  record_series: [
    { id: "ser-t1", schedule_id: "rds-t1", item_number: 1, title_and_description: "Vouchers (test)", retention_active: 5, retention_storage: 5, retention_total: 10, shelf_level_id: "lvl-uuid-a" },
  ],
  inventory_appraisals: [
    { id: "ria-t1", inventory_no: "RIA-2026-000002", office_name: "Test Office", office_address: "Test address", date_prepared: "2026-08-02", status: "Draft" },
  ],
  inventory_records: [
    { id: "irec-t1", appraisal_id: "ria-t1", item_number: 1, title_and_description: "Ledgers (test)", retention_active: 2, retention_storage: 3, retention_total: 5 },
  ],
  disposal_requests: [
    { id: "rad-t1", request_no: "RAD-2026-000001", agency_name: "Test Agency", agency_address: "Test address", request_date: "2026-08-03", status: "Submitted" },
  ],
  disposal_items: [{ id: "ditem-t1", request_id: "rad-t1", item_number: 1, title_and_description: "Old canvasses (test)" }],
  record_shelves: [{ id: "shelf-t1", name: "Shelf 1", location: null, position: 0, created_at: TS }],
  record_shelf_levels: ["A", "B", "C", "D", "E"].map((label, i) => ({
    id: `lvl-uuid-${label.toLowerCase()}`, shelf_id: "shelf-t1", label, position: i,
  })),
  record_boxes: [
    { id: "box-uuid-1", document_type: "RDS", year: 2026, sequence: 1, shelf_level_id: "lvl-uuid-a", slot: 1, label_override: null, capacity: null },
  ],
  record_box_contents: [
    { id: "cnt-uuid-1", box_id: "box-uuid-1", schedule_id: "rds-t1", appraisal_id: null, disposal_id: null, filed_at: TS },
  ],
};
