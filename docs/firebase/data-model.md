# Firestore data model

How the 38 Supabase (Postgres) tables become Cloud Firestore collections in
`egso-b2c0a`. Phase 1 defines the model; no records are migrated yet.

## Principles

1. **One top-level collection per table, same name.** `purchase_requests`
   stays `purchase_requests`. Child tables stay top-level with their parent's
   ID as a field (`energy_bills.account_id`), not subcollections. Reports and
   dashboards query across parents ("all bills for October"), which
   top-level collections answer with one query.
2. **Field names stay snake_case, exactly as the Postgres columns.** Each
   module's `rowTo…` mapper in `src/features/*/api.ts` keeps working
   unchanged; only the query code is rewritten in Phase 2.
3. **Document ID = the existing primary key.** Purchase requests, purchase
   orders, RIS and reservations already use their document number as `id`
   (`PR-2026-000243`), so Firestore itself guarantees each number is used
   once, and the portal's Track page is a single `get`. Every other table
   keeps its existing UUID; new records get a Firestore auto-ID.
4. **Line items stay embedded.** `items`, `attachments`, `comments`,
   `history` and `approvals` are already JSON arrays on the row; they stay
   arrays on the document. The 1 MiB document limit is far above any GSO form.
5. **Types**

   | Postgres | Firestore | Note |
   |---|---|---|
   | `text`, `uuid` | string | |
   | `integer`, `numeric` | number | PostgREST already returned `numeric` as a JS number; amounts behave as today. |
   | `boolean` | boolean | |
   | `date` | string `yyyy-MM-dd` | Sorts and range-filters correctly as text; matches `dateOnly()` in `lib/db.ts`. |
   | `timestamptz` | string, ISO 8601 UTC | Matches what the mappers read today. Converting to Firestore `Timestamp` can come later in one converter. |
   | `jsonb` | map / array | |

## Collections

| Collection | ID | Parent field | Unique keys | Server-written |
|---|---|---|---|---|
| `purchase_requests` | `pr_number` | — | number = ID | audit, notifications |
| `purchase_orders` | `po_number` | — | number = ID | audit, notifications |
| `ris_requests` | `ris_number` | — | number = ID | audit, notifications |
| `reservations` | `res_number` | — | number = ID | audit, notifications |
| `suppliers` | uuid | — | — | |
| `inventory_items` | uuid | — | `item_code` | audit, notifications |
| `stock_card` | uuid | `item_id` | — | |
| `energy_accounts` | uuid | — | `account_number` | audit |
| `energy_bills` | uuid | `account_id` → cascade | (`account_id`, `billing_year`, `billing_month`); `doc_number` when set | audit, notifications |
| `energy_submeters` | uuid | `account_id` → cascade | (`account_id`, `submeter_number`) | audit, notifications |
| `energy_submeter_bills` | uuid | `submeter_id` → cascade | (`submeter_id`, `billing_year`, `billing_month`) | audit |
| `water_accounts` | uuid | — | `account_number` | audit |
| `water_bills` | uuid | `account_id` → cascade | (`account_id`, `billing_year`, `billing_month`); `doc_number` when set | audit, notifications |
| `water_submeters` | uuid | `account_id` → cascade | (`account_id`, `submeter_number`) | audit, notifications |
| `water_submeter_bills` | uuid | `submeter_id` → cascade | (`submeter_id`, `billing_year`, `billing_month`) | audit |
| `water_meter_readings` | uuid | `submeter_id` → cascade | — | audit, notifications |
| `fuel_vehicles` | uuid | — | `plate_number` | audit |
| `fuel_transactions` | uuid | `vehicle_id` → cascade | `doc_number` when set | audit, notifications |
| `fuel_odometer_readings` | uuid | `vehicle_id` → cascade | — | audit, notifications |
| `fuel_trips` | uuid | `vehicle_id` → cascade | `control_no` | audit |
| `violators` | uuid | — | `name_key` | audit |
| `violations` | uuid | `violator_id` → cascade | `violation_no`; citation number | audit |
| `notifications` | uuid | — | — | **functions only** create |
| `audit_logs` | `AUD-yyyy-nnnn` | — | ID | **functions only** |
| `document_counters` | `{TYPE}-{year}` | — | ID | **functions only** |
| `system_configuration` | existing `id` | — | (`category`, `key`) | |
| `unique_keys` | `{collection}.{field}:{value}` | the record it names | ID | written with its record |
| `rate_limits` | `{hashed address}-{hour}` | — | ID | **functions only**; no browser access |

Not migrated: `doc_counters` (retired in migration 039), `record_files` and
`record_file_movements` (dropped in migration 046).

### Records Management (Phase 5A)

| Collection | ID | Parent field | Unique keys | Written by |
|---|---|---|---|---|
| `disposition_schedules` | uuid | — | `schedule_no` (claim) | `saveRecordsDocument` |
| `record_series` | uuid, kept across saves | `schedule_id` | (`schedule_id`, `item_number`) — positional | `saveRecordsDocument` |
| `inventory_appraisals` | uuid | — | `inventory_no` (claim) | `saveRecordsDocument` |
| `inventory_records` | uuid, replaced on save | `appraisal_id` | positional | `saveRecordsDocument` |
| `disposal_requests` | uuid | — | `request_no` (claim) | `saveRecordsDocument` |
| `disposal_items` | uuid, replaced on save | `request_id` | positional | `saveRecordsDocument` |
| `record_shelves` | uuid | — | — | `createRecordShelf`; name and location by Administrators |
| `record_shelf_levels` | `{shelfId}-{A..E}` | `shelf_id` | ID | with their shelf |
| `record_boxes` | `{type}-{year}-{nn}` | `shelf_level_id` | ID; position by `record_box_positions` | filing; label by Administrators |
| `record_box_positions` | `{levelId}~{slot}` | — | ID | functions only; no client access |
| `record_box_contents` | `{type}-{documentId}` | `box_id` | ID | filing; carries the form's number, agency and date |

`retention_total` (generated in 040/041) is computed on every save. The
current box of each kind and year is `document_counters/BOX-{type}-{year}`.

## Unique keys

Firestore has no unique constraints. Two mechanisms replace the 43 in Postgres:

- **The key is the document ID** wherever the app already does that: the four
  numbered documents, `audit_logs`, `document_counters`. A second create
  with the same ID fails.
- **`unique_keys/{scope}:{value}` claim documents** for every other key, e.g.
  `unique_keys/inventory_items.item_code:OS-0001` →
  `{ collection, doc_id }`. The record and its claim are written in one
  transaction; a second claim on the same key fails, and `firestore.rules`
  refuse a record write without its claim (`existsAfter` / `getAfter`).
  **Done for inventory item codes** (Phase 2) and **violator names**
  (`unique_keys/violators.name_key:{key}`, Phase 4). A violator claim left
  by a deleted or renamed profile is stale and is taken over by the next
  profile with that name; a live one never moves. The data migration must
  create claims for existing records (profiles without one get it the next
  time they are saved or recorded against).
- **Period IDs** for bills: `eb-{account}-{yyyy}-{mm}`, `wb-…`, `esb-…`,
  `wsb-…` — a second bill for the same month is refused.
- **Account, plate and submeter numbers** (Phase 5A) are claimed too:
  `energy_accounts.account_number:{n}`, `water_accounts.account_number:{n}`,
  `fuel_vehicles.plate_number:{n}`, and per account
  `energy_submeters.submeter_number:{accountId}~{n}` (water the same).
  "/" in a value is written `%2F`. Of five simultaneous saves of one value,
  exactly one succeeds (integration tests). Stale claims are taken over as
  for violators; deleting or renumbering releases the old claim.
- **Records numbers** (`schedule_no`, `inventory_no`, `request_no`) are
  claimed by the function that saves the form.
  Composite keys join their parts: `energy_bills.period:{account_id}:2026:10`.
  Codes may not contain "/", which a document ID cannot hold.

## Relationships and cascading deletes

Nineteen foreign keys cascade on delete in Postgres. `functions/src/cascade.ts`
carries the same map: deleting a parent deletes the documents that name it, in
batches, and grandchildren follow because each deletion fires the trigger
again.

| Deleting | Also deletes |
|---|---|
| `energy_accounts` | `energy_bills`, `energy_submeters` (→ `energy_submeter_bills`) |
| `water_accounts` | `water_bills`, `water_submeters` (→ `water_submeter_bills`, `water_meter_readings`) |
| `fuel_vehicles` | `fuel_transactions`, `fuel_odometer_readings`, `fuel_trips` |
| `violators` | `violations` |

The cascade is eventually consistent: for a moment after the parent goes, a
list can still show its children. Screens that show a parent's children
already reload after a delete.

## Queries and indexes

`firestore.indexes.json` holds 58 composite indexes. For the five migrated
modules they come from the queries actually written in `api.firebase.ts` and
the functions: every combination of a list's equality filters with its sort
(for example status and/or office, newest first), plus the reservation date
ranges and the stock card by item. The other modules' entries are still the
planned ones and will be redone the same way when those modules move. The
emulator does not enforce indexes; production does, and a missing one fails
with a link that creates it.

Two things change to avoid whole-collection reads, which Firestore bills per
document:

- **Search.** `searchOr()` substring search (14 call sites) has no Firestore
  equivalent. Lists filter by status, department and date on the server and
  apply the typed search to the loaded page in the browser.
- **Counts.** `countRows()` becomes `getCountFromServer()`: one read per
  1,000 matching documents instead of every row.
- **Live updates.** `useRealtimeRefresh()` reloads the whole list on any
  change. It becomes an `onSnapshot` listener on the screen's own query, which
  is billed only for documents that change.

`fetchAll()` (load every row, 1,000 at a time) is kept only where a screen
truly needs everything, such as a report export; list screens page with
`limit()` + `startAfter()`.

## Document numbers

`functions/src/numbering.ts` ports `next_document_number`. Kept from the
SQL: the format (PR-2026-000243), padding, separator and yearly reset from
`system_configuration`, the continuous sequence when the reset is off, and
the public portal being limited to PR, RIS and FR. Browsers have no access to
`document_counters`.

Changed, with tests in `functions/test/numbering.test.ts` (logic) and
`functions/test-emulator/numbering.emulator.test.ts` (against Firestore):

1. **The year is the calendar year in Asia/Manila.** Postgres used UTC, so a
   document filed between 00:00 and 08:00 on 1 January got the previous
   year's number.
2. **The January bug is fixed.** In the SQL, `greatest(current + 1,
   max_all + 1)` took `max_all` across every year, so the second number of
   2027 would have jumped to one past 2026's highest. Now, with the yearly
   reset on, the next number continues after the highest number already
   printed with this year: this year's counter, and the continuous (year 0)
   counter only if it issued numbers this same year. Each counter records the
   year it last printed in `last_year`. This is the rule migration 032
   describes, and switching the reset off and on mid-year still cannot
   produce a duplicate.
3. **Numbers that are document IDs never collide with saved records.** For
   PR, PO, RIS and FR the allocator skips any number a document already
   uses (up to 25, then it stops with an error naming the counter), so a
   counter left behind by imported data cannot issue a duplicate.

**Concurrency.** Each allocation locks only the two counter documents it
needs; settings are read beforehand. Twenty simultaneous requests get twenty
consecutive, distinct numbers in the emulator. An earlier version that locked
a query over all counters failed under the same load with “Transaction lock
timeout”.

**Gap-free numbering (Phase 2).** Purchase requests, purchase orders, RIS and
reservations are now numbered and saved in one transaction by the create
functions (`functions/src/documents/create.ts`): a number is spent only on a
document that exists, invalid input is rejected before a number is taken,
and a refused double booking spends nothing (all tested). What can still
leave a gap:

- **Deleting a document.** Purchase requests (Phase 3), purchase orders,
  RIS and reservations (Phase 4) can no longer be deleted: they are voided,
  keeping the number. Energy and water bills and fuel purchases can still be
  deleted as log corrections; the audit trail records each deletion as
  Critical with the number.
- **Records Management** forms are numbered on saving
  (`saveRecordsDocument`); deleting one keeps its number claimed, so the
  number is never issued again.

EC, WC, FC and VT are numbered on creation by `createNumberedRecord` /
`recordViolation` (`functions/src/documents/numbered-records.ts`). Trips'
control numbers (2026-10-0001) restart monthly and come from
`document_counters/TRIP-YYYY-MM`; a month's first trip starts after the
highest control number already saved that month.

**For the data migration (Phase 4):** set `last_year` on every imported
counter from the year of its last issued number. A continuous counter without
`last_year` is treated as possibly having issued this year's numbers:
safe (no duplicates) but it can skip numbers.
