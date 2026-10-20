# Moving the data: Supabase → Firestore

How the existing EGSO-PRIMS data moves into `egso-b2c0a`. The tooling is
built and tested on the emulators with synthetic data only (Phase 5A). The
real import is a separate, approved step; nothing here reads production
Supabase or writes to a real Firebase project.

| Piece | Where |
|---|---|
| Mapping, transforms, counters, reconciliation sums | `functions/migration/plan.ts` |
| Importer (checks, writes, reconciles) | `functions/migration/import.ts` |
| Command line | `functions/migration/cli.ts` |
| Synthetic export | `functions/migration/fixtures/synthetic.ts` |
| Tests | `functions/test/migration-plan.test.ts`, `functions/test-migration/import.emulator.test.ts` (`npm run test:migration`, Firestore emulator only) |

## 1. Export

One JSON file per table, named `<table>.json`, each an array of rows with
the Postgres column names — what `select *` through PostgREST, or the
Supabase table editor's export, gives. The export is taken read-only, after
the office stops entering data on the old system (see 8).

## 2. Mapping

Every table keeps its name as the collection, and its columns as fields
(docs/firebase/data-model.md). Values are converted as the app reads them:
`timestamptz` text → ISO 8601 UTC (`2026-09-30 08:15:00+08` →
`2026-09-30T00:15:00.000Z`); dates stay `yyyy-MM-dd`; numbers, booleans and
JSON stay as they are.

**Document IDs** keep the existing primary key, so every reference between
tables still holds, with these exceptions, each keeping the old ID as
`legacy_id`:

| Table | New ID | Why |
|---|---|---|
| `energy_bills`, `water_bills`, `energy_submeter_bills`, `water_submeter_bills` | `eb-{account}-{yyyy}-{mm}` (and `wb-`, `esb-`, `wsb-`) | new bills are keyed by period, which is what refuses a second bill for a month |
| `record_shelf_levels` | `{shelfId}-{A..E}` | five levels per shelf, as the Records functions write them |
| `record_boxes` | `{type}-{year}-{nn}` | one box per kind, year and number |
| `record_box_contents` | `{type}-{documentId}` | one place per document; gains the form's number, agency and date |

References to levels and boxes are rewritten to the new IDs
(`prepareRecords`). Nothing refers to a bill by its old ID.

**Not imported**: `doc_counters` (retired, 039), `record_files` and
`record_file_movements` (dropped, 046). `document_counters` is rebuilt (5).

## 3. Columns Postgres generated

Recomputed on import, not copied: water reading consumption, odometer
distance, a trip's distance and fuel, a fuel purchase's total, a violation's
outstanding balance, a violator's `name_key`, a series' retention total. If
the export disagrees with the recomputed value the row is still imported
with the recomputed value, and the report lists the difference for review.

## 4. Unique values

Before anything is written the importer checks the export for repeats
Postgres would have refused — the same item code, account, plate, submeter
on an account, violator name (normalised), bill period, control number,
Records number or line position — and for values the new system cannot hold
(an item code containing "/"). Any finding stops the import with the rows
named; nothing is written. Fix the source, export again.

Each claimed value gets its `unique_keys` document (data-model.md, "Unique
keys"), so the rules and the save functions treat imported records like new
ones.

## 5. Counters

`document_counters` is rebuilt from the Supabase counter rows and the
numbers actually in the data, whichever is higher — a counter behind its
data would issue a number twice. Each counter gets `last_year` (the January
fix in functions/src/numbering.ts). Also built: the monthly trip counters
(`TRIP-2026-09`, from the highest control number of each month), the audit
log counter (`AUD-2026`, from the highest entry), and the Records box
counters (`BOX-RDS-2026`).

## 6. Accounts (Authentication)

Not automated, and not done locally. Staff accounts move with the Firebase
CLI's `auth:import`, which accepts Supabase's bcrypt password hashes, so
people keep their passwords — or, simpler for a small office, the
Administrator creates each account and people set a password from the
reset email. Either way:

- every account needs its role set with `setStaffRole` (and `approver` where
  granted); an account without a role is refused by the app;
- `created_by_uid` on imported purchase requests still names Supabase user
  IDs. If accounts are imported with the same UIDs, ownership carries over;
  if not, ownership needs a mapping step, decided with the office.

## 7. Attachments

Files move from the Supabase `attachments` bucket to Cloud Storage under
the same path below `attachments/`. The importer already rewrites each
record's attachment `path` and `url` to the Cloud Storage location
(`rewriteAttachment`); copying the files themselves (download from
Supabase, upload to the bucket, compare counts and sizes) is a separate
script for the approved migration run, because it touches both live
systems.

## 8. Running it

1. Freeze: the office stops entering data on the old system.
2. Export (read-only) to a folder of `<table>.json` files.
3. Dry run: `node functions/migration/cli.ts --source <folder> --dry-run`.
4. Import into an **empty** database, **before the Cloud Functions are
   deployed** — otherwise every imported row fires the audit trigger and
   creates an audit entry and a notification.
5. Read the report: every table `ok`, counts equal, totals equal to the
   centavo, generated-column differences reviewed.
6. Copy attachments (7) and import accounts (6).
7. Deploy rules, indexes and functions; check a sample in the app.

The CLI today refuses any target but the local emulator under a `demo-*`
project. Pointing it at `egso-b2c0a` is a deliberate change made in the
approved migration step, with credentials that reach only that project.

## 9. If it goes wrong

- The importer stops **before writing** on any duplicate or invalid value,
  and refuses a database that already has data, so a failed check leaves
  nothing behind.
- A write that fails part-way leaves a partial import: clear the
  collections (or the whole database — it is new) and run again. The import
  is not resumable on purpose.
- Supabase stays untouched and remains the system of record until the
  imported data has reconciled and the office has checked it; going back is
  pointing the office at the old site again.
