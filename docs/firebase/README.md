# Firebase migration

GSO PRIMS is moving from Vercel + Supabase to Firebase, in the project
**`egso-b2c0a`** ("egso", owned by the municipality's Google account), on the
`firebase-migration` branch. It is a new, additional municipal system.

Two other Firebase projects are off-limits:

| Project | What it is |
|---|---|
| `alaminos-municipality` | The municipality's existing live production system. GSO PRIMS never touches it: no shared database, users, hosting, domains or configuration. |
| `egso-2k26` | A retired GSO PRIMS development project, replaced by `egso-b2c0a`. Nothing is read from or deployed to it. |

The Vercel site and the Supabase project stay as they are until the Firebase
version has been tested and approved.

- Data model, unique keys, cascades and indexes: [data-model.md](data-model.md)

## Project isolation

The developer Google account can reach all three projects, so selecting
`egso-b2c0a` in `.firebaserc` is not enough on its own. Every layer refuses
any other project, and names the two off-limits ones explicitly:

| Layer | Guard |
|---|---|
| Browser app | `src/lib/firebase.ts` throws unless `VITE_FIREBASE_PROJECT_ID` is `egso-b2c0a` or an emulator-only `demo-*` ID; `alaminos-municipality` and `egso-2k26` are refused by name. |
| Cloud Functions | `functions/src/setup.ts` (via `project.ts`) stops every function at load unless the project is `egso-b2c0a` or `demo-*`; the two off-limits projects are refused by name. |
| npm scripts | `emulators` and `test:rules` pass `--project demo-egso-prims`, an offline ID that cannot reach any real project. |
| Firebase MCP | read-only allowlist of six tools that act only on the active project (`.mcp.json`). |
| Claude Code | deny rules for `firebase use`, `deploy` and `login` (`.claude/settings.local.json`, local only). |

These guards are extra safeguards, not account-level isolation. Before any
remote operation (Phase 4 onward): sign in with an account that is a member of
`egso-b2c0a` only, and confirm it cannot see `alaminos-municipality` or
`egso-2k26`. If that cannot be confirmed, stop.

## Local development

Everything in Phases 1–3 runs against the Firebase Emulator Suite on this PC,
with synthetic data only.

| Emulator | Port |
|---|---|
| Emulator UI | http://127.0.0.1:4000 |
| Auth | 9099 |
| Firestore | 8085 (8080 is left free for XAMPP's Tomcat) |
| Storage | 9199 |
| Functions | 5001 |
| Hub / logging / Eventarc | 4400 / 4500 / 9299 |

```
npm run emulators                 # build functions, start every emulator (demo-egso-prims)
npm run test:rules                # Firestore and Storage rules, on the emulators
npm run test:functions            # unit tests: numbering, audit, accounts, project guard
npm run test:functions:emulator   # numbering under load + every function end to end
npm run test:integration          # each migrated module's data layer and sign-in, on all four emulators
npm run test:e2e                  # the app in the installed Chrome, on the emulators
npm run test:unit                 # project guard, error messages, search
npm run typecheck:tests           # TypeScript over every test file
npm run emulators:stop            # stop emulators left running by a crashed CLI
npm run dev:emulators             # the app itself on the emulators (start `npm run emulators` first)
```

The browser tests drive the Chrome (or Edge) installed on the PC through
`playwright-core`, which downloads no browser. They sign in as emulator test
accounts and use synthetic records only; screenshots and the printed PDF go
to `E2E_SCREENSHOTS` (default: a temporary folder). They cannot cover
Chrome 109 itself, which is not installed here.

The first emulator start after the PC has been idle can fail with
"Cannot determine backend specification. Timeout after 10000" — the
Functions emulator's code discovery, not the code (which loads in about half
a second). Running the command again starts normally.

On this Windows PC the Firebase CLI crashes while shutting down (a libuv
assertion under Node 24) and leaves the Java emulators holding their ports.
Every emulator script runs `emulators:stop` first; it stops only Java
processes started from `~/.cache/firebase/emulators`.

The emulator tests that use the Admin SDK refuse to start unless
`FIRESTORE_EMULATOR_HOST` points at 127.0.0.1, and they switch off Google's
cloud metadata probe (`METADATA_SERVER_DETECTION=none`), so they make no
network requests beyond the local emulators.

`npm run dev:emulators` runs the app with `.env.emulators` (committed; demo
values only, no secrets): Firebase data layer and sign-in, demo project,
local emulators. Accounts are created in the Emulator UI (Authentication tab)
or by the test helpers; give one a role with custom claims such as
`{"role": "Administrator"}`.

Requirements: Node 22+ and Java 11+ (the Firestore emulator is a Java program).
The emulator programs are downloaded once from Google's
`storage.googleapis.com/firebase-preview-drop` bucket (Firestore 1.22.0,
Storage rules runtime 1.1.3, UI 1.15.0, about 190 MB), checked against the
size and checksums firebase-tools lists for them, and then run offline.

## Data layer (Phases 2–4)

Each migrated module has three files:

| File | What it is |
|---|---|
| `api.supabase.ts` | the original Supabase code, unchanged apart from exporting its row mapper — the fallback |
| `api.firebase.ts` | the Firestore version, same functions, same arguments, same return shapes |
| `api.ts` | picks one, from `VITE_DATA_BACKEND` (`lib/data-backend.ts`); TypeScript holds both to the same signatures |

Screens import `api.ts` as before. Migrated: Purchase Requests, Purchase
Orders, RIS, Reservations, Inventory (with its stock card), Notifications,
the Audit trail, Settings (Phases 2–3), and Energy, Water, Fuel and
Ordinance violations (Phase 4), and Records Management (Phase 5A).
`VITE_DATA_BACKEND=firebase` moves all of them, and Firebase sign-in with
them; nothing in Firebase mode still needs Supabase (see "Still on
Supabase").

The Firestore code is loaded on demand: `api.ts` imports it with `import()`
on first use, as do the live-update hook, the counts and the sign-in driver.
A Supabase build never downloads the Firebase SDK; a Firebase build loads it
when a screen first needs data.

Every staff write carries the writer's account — `updated_by_uid`, or
`created_by_uid` on a new record — which `firestore.rules` require to be the
signed-in account. The audit trail names that account.

What changed in how they work:

- **Creating a PR, PO, RIS or reservation** calls a Cloud Function that
  numbers and saves it in one transaction (see Cloud Functions).
- **Every read-modify-write is a transaction**: two people adding a comment
  or history entry at once no longer overwrite each other.
- **Releasing a RIS** deducts stock, writes the stock card and records the
  status in one transaction; a shortfall changes nothing.
- **Item codes are unique**, enforced by `unique_keys` claims and the rules;
  so is **one violator profile per name** (`name_key`).
- **Bills (EC, WC), fuel purchases (FC), violation tickets (VT) and trips'
  monthly control numbers** are numbered and saved by Cloud Functions in one
  transaction. Recording a violation against a new name opens the profile in
  that same transaction, so two clerks recording the same person get one
  profile and a refused ticket leaves no empty profile.
- **Postgres's generated columns** (a reading's consumption, a trip's
  distance and fuel, a purchase's total, a ticket's outstanding balance) are
  computed on every save, and `firestore.rules` check them. Lists of the
  utility modules filter by equality on the server and sort in the browser,
  so they need no composite index.
- **Unique account numbers, plate numbers and submeter numbers** are checked
  before saving (Administrators only). Two administrators saving the same
  value at the same instant could both pass; bills and submeter bills are
  keyed by their period, so those duplicates are refused outright.
- **Lists** still load every matching record (`fetchAllRows`, 500 a page),
  because the list screens' status tabs, counts and search work on the full
  list. Status, office and supplier filter on the server; dates and the search
  box filter in the browser (Firestore has no substring search). A paged
  reader (`fetchRowsPage`, `listPurchaseRequestsPage`) is ready for when the
  screens page.
- **Counts** for the sidebar and dashboard use `getCountFromServer`.
- **Live updates** listen to the single most recently changed document per
  collection (`features/shared/use-realtime.ts`), one read per change.
- **Public calendar**: the portal's reservation form gets taken slots from
  `reservationAvailability` — number, facility, date, times, status only.

## Hosting

`firebase.json` serves `dist/` (the `npm run build` output). Ready, checked
locally (Phase 5A), not deployed:

- **SPA routing**: every path falls back to `index.html` (checked on the
  Hosting emulator: `/purchase-requests`, `/records/inventory/<id>` → 200).
  `cleanUrls` on, no trailing slashes.
- **Caching**: hashed files under `/assets/**` are cached a year
  (`immutable`); the app page itself (`/`, `/index.html`, every route) is
  `no-cache`, so a new deploy reaches people on their next load instead of
  up to an hour later (Hosting's default). Each path matches exactly one
  Cache-Control rule (checked with Hosting's glob matcher).
- **Security headers** on every response: `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy` turning off camera, microphone, geolocation, payment,
  USB (the app uses none). Hosting adds HSTS itself.
  **Not checked:** the local Hosting emulator serves the files and rewrites
  but does not send configured headers (not even the earlier three), so the
  headers must be confirmed on a preview channel with `curl -I`.
- **Content-Security-Policy**: set in **report-only** mode (Phase 5B) —
  the browser reports what an enforced policy would block, and blocks
  nothing. The policy (in `firebase.json`) allows the app itself, Google
  Fonts, Firebase (Auth, Firestore, Storage, Functions), App Check's
  reCAPTCHA, and Smart Import's Tesseract worker and language data
  (`cdn.jsdelivr.net`, `tessdata.projectnaptha.com`, WebAssembly, blob
  workers). Checked locally in Chrome against a Firebase-mode build on the
  public pages and the sign-in page: the only report outside the local
  emulator traffic is Zod's `Function("")` speed check, which is inside a
  try/catch and falls back safely. Enforcing waits for a preview-channel
  check of every module (docs/firebase/fresh-start.md, section 5).
- **Build**: `npm run build` (Supabase mode) and a Firebase-mode build both
  pass; the Firebase SDK is not in the entry bundle in either mode (it loads
  on first use); built CSS has no `oklch(` (Chrome 109).
- **Functions deploy** uploads `lib/` only: `src`, the three test folders and
  `migration/` (with its synthetic fixtures) are excluded.

**Environment for a Firebase build** (`.env.example`):
`VITE_DATA_BACKEND=firebase`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
`VITE_FIREBASE_PROJECT_ID=egso-b2c0a`, `VITE_FIREBASE_STORAGE_BUCKET`,
`VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_USE_EMULATORS=false`, and later
`VITE_FIREBASE_APPCHECK_SITE_KEY`. These are public web-app identifiers, not
secrets; they come from the `egso-b2c0a` console (a remote read, not done).

**Before the first deploy** (each a separately approved, remote step):
Blaze plan for Functions and Storage; the web app registered in
`egso-b2c0a`; Authentication's authorized domains holding the Hosting
domains (`egso-b2c0a.web.app` and `.firebaseapp.com` are there by default; any
preview-channel or custom domain must be added, or sign-in fails there);
Firestore, Storage and the indexes deployed before the functions; the data
import (docs/firebase/migration.md) run before the functions are deployed;
App Check registered and watched before enforcing it.

The site will live at the default Firebase Hosting URL of `egso-b2c0a`
(normally `egso-b2c0a.web.app`; confirm in the console before sharing it) or
a separately approved custom domain. No municipal domain, DNS record or
certificate is involved.

## Authentication

| Today (Supabase) | Firebase |
|---|---|
| Email + password | Email + password provider |
| "Remember me" picks localStorage or sessionStorage | `setPersistence(sessionPersistence(remember))` from `lib/firebase.ts` |
| `resetPasswordForEmail`, redirect to /login | `sendPasswordResetEmail` with an action URL back to /login |
| Role read from `user_metadata` — editable by the user, defaults to Administrator | `role` **custom claim**, set only by the Admin SDK (`setStaffRole` callable or a local admin script). Rules trust nothing else. No role means no access. |
| `@alaminos.gov.ph` only (database trigger, migration 036) | `requireOfficeEmail` blocking function (needs the free Identity Platform upgrade) |

Built in Phase 3 (`features/auth/firebase-driver.ts`, used by the existing
login page and auth provider when `VITE_DATA_BACKEND=firebase`):

- The role, the `approver` flag and the office come from the ID token's
  claims. An account without a valid role is signed out with "This account
  has not been given access yet".
- Wrong password and unknown address get the same message, and a password
  reset gives the same answer either way, so the form does not reveal which
  addresses have accounts.
- "Keep me signed in" keeps the session in localStorage; otherwise it lives
  in sessionStorage and ends with the browser.
- When `setStaffRole` changes someone's role it revokes their session; the
  provider shows "Your session has expired" and they sign in again with the
  new role.
- Routes: every staff page needs a signed-in account (as before), and
  Settings, the Audit trail, Reports and each module's create and edit pages
  also need the matching permission (`PermissionRoute`), otherwise the person
  is sent to the dashboard. The sidebar still lists those pages for everyone.

Moving existing users (Phase 4, with approval): Supabase stores bcrypt
password hashes, and `firebase auth:import` accepts bcrypt, so staff keep
their passwords. Each user then gets a role claim. No real user is imported,
created or changed before then.

## Cloud Functions

All in `asia-southeast1`, capped at 5 instances each, in `functions/`.

| Function | Replaces | State |
|---|---|---|
| `createPurchaseRequest` (callable) | `next_document_number` + browser insert | numbers and saves in one transaction; public portal (no attachments, rate limited), Administrators and Department Users |
| `createPurchaseOrder` (callable) | same | Administrators only |
| `createRisRequest` (callable) | same | public slips are always submitted; staff may save drafts |
| `createReservation` (callable) | same + browser conflict check | double-booking check inside the transaction: of simultaneous requests for one slot, exactly one succeeds |
| `reservationAvailability` (callable) | anonymous read of `reservations` | taken slots for the portal calendar, nothing about who booked |
| `portalStockSuggestions` (callable) | `portal_stock_suggestions` RPC | name, unit, in stock; register cached 5 minutes per instance |
| `nextDocumentNumber` (callable) | `next_document_number` RPC | **staff only**, and refuses every type a function numbers on saving (PR, PO, RIS, FR, EC, WC, FC, VT, RDS, RIA, RAD); no Firestore module uses it |
| `updateReservation` (callable) | browser update + browser conflict check | moving a booking is checked for clashes in the same transaction; of two simultaneous moves into one slot, exactly one succeeds |
| `createNumberedRecord` (callable) | `next_document_number` (EC, WC, FC, VT) + browser insert | Administrators only; checks each field, refuses unknown ones, computes the generated columns, refuses a second bill for an account's month before spending a number |
| `recordViolation` (callable) | browser find-or-create + insert, with a clean-up delete on failure | profile and ticket in one transaction, claimed by name |
| `createFuelTrip` (callable) | browser "highest control number + 1" | monthly counter `document_counters/TRIP-YYYY-MM`, continuing after any control number already used that month |
| `voidReleasedRis` (callable) | — (new) | Administrators only; returns a released slip's stock and voids it in one transaction (see Voiding) |
| `recordEvents` (Firestore trigger) | `log_audit` on 31 tables and `notify_event` on 12 | one trigger per write: the audit entry and, for notify_event's events, the notification, with its wording |
| `cascadeDeletes` (Firestore trigger) | 19 `on delete cascade` keys | ported; tested end to end (account → bills, submeters → submeter bills). Since the final hardening a holder is deleted only while empty, so these cascades are a safety net |
| `requireOfficeEmail` (blocking) | `enforce_office_domain` | ported; tested against the Auth emulator |
| `setStaffRole` (callable) | — (roles were unprotected) | Administrator only; sets `role` and the `approver` grant |
| `saveRecordsDocument`, `voidRecordsDocument` (callable) | browser insert + `next_document_number` (RDS, RIA, RAD) + `record_file_on_approval` trigger; browser delete | form, lines, number and Records Room filing in one transaction; forms are voided with a reason, never deleted (fresh-start.md, section 7) |
| `correctUtilityRecord`, `voidUtilityRecord` (callable) | browser update / delete of bills, fuel purchases and trips | Administrators only; a correction keeps the previous values in `revisions`, a void keeps the record out of totals and frees a bill's month (fresh-start.md, section 7). Also corrects and voids submeter bills, water meter readings and odometer readings; a trip's date stays in its control number's month |
| `createUtilityEntry` (callable) | browser insert of submeter bills, water meter readings and odometer readings | Administrators only; refuses an archived account, an inactive or archived submeter and an inactive vehicle, and keeps one active submeter bill per month — in one transaction (fresh-start.md, section 7) |
| `deleteRecordHolders`, `setRecordHolderArchived` (callable) | browser delete of accounts, submeters, vehicles and violator profiles (with `on delete cascade`) | Administrators only; deletes only what holds no records, checked inside the delete, and releases its unique claim; the rest are kept and named. Accounts and profiles are archived and restored with who and when (fresh-start.md, section 7) |
| `createRecordShelf`, `deleteRecordShelf`, `moveRecordBox` (callable) | `record_shelf_add_levels`, `record_level_keep`, the box position constraint | five levels per shelf; a shelf with boxes cannot go; one box per position |

Public calls (signed out) are limited per network address per hour —
60 submissions, 1,200 suggestion or calendar lookups — counted under a hashed
address in `rate_limits`, which browsers cannot read. The municipal hall may
reach the portal through one shared address, which is why the limits are set
for a busy office.

**App Check (prepared, off).** The five public functions take
`enforceAppCheck` from `ENFORCE_APP_CHECK` (`functions/src/documents/caller.ts`),
and the browser starts App Check with reCAPTCHA Enterprise when
`VITE_FIREBASE_APPCHECK_SITE_KEY` is set (`lib/firebase.ts`, never on the
emulators). To switch it on with the production setup: register the web app
for App Check in the `egso-b2c0a` console (reCAPTCHA Enterprise), put the
site key in the hosting build's environment, watch the App Check metrics
until real traffic carries tokens, then set `ENFORCE_APP_CHECK=true` for the
functions and enforce App Check for Firestore and Storage in the console.
Until then, the rate limits are the public functions' only protection
against scripted use.

## Purchase requests: decisions, ownership, voiding

Deciding on a purchase request — approving, rejecting, **returning it to the
requester**, **marking it completed** — belongs to Administrators and to
Department Users given the `approver` claim (`setStaffRole` with
`approver: true`). A Department User edits, submits and voids only the
requests they raised (`created_by_uid`, stamped by the create function);
portal requests have no owner, so only deciders act on them. Viewers change
nothing. `firestore.rules` enforce all of it, and allow only the workflow's
own steps — Draft → Submitted → Approved → Completed, Submitted → Rejected,
Submitted or Approved → Draft (returned), and voiding — for Administrators
too. Each status change must append one approval step signed with the
account taking it (`byUid`).

The drawer shows Approve, Return and Mark Completed only to deciders, Submit
only to the owner or a decider, and Edit only while the request is open.

**A numbered request is never deleted.** The list's Delete action is now
**Void**: it asks for a reason, sets the status to Cancelled, and keeps the
number, the record and its history; the reason, the person and the time go
into the approval timeline and the history. The owner may void their own
request while it is a Draft or Submitted; a decider may void any open
request. The rules refuse deletion of a purchase request by anyone.

## Voiding purchase orders, slips and bookings (Phase 4)

Purchase orders, RIS and reservations follow the same policy: **never
deleted, only voided**. Their lists offer Void instead of Delete; it asks for
a reason, sets Cancelled, keeps the number, record and history, and puts the
reason, the person (`byUid`) and the time in the approval timeline. The
rules refuse deleting any of them, by anyone; every status change must be a
signed step; a void needs its reason; a voided document stays voided (only
its comments can grow) and its drawer no longer offers Edit.

| Document | Can be voided | By |
|---|---|---|
| Purchase order | Draft, Pending Approval, Approved — and **not yet issued** to the supplier | Administrators |
| RIS | Draft, Pending Approval, Approved (no stock has moved) | Administrators, Department Users |
| RIS | **Released** — its stock is returned (below) | Administrators only |
| Reservation | Draft, Pending, Approved (the slot is freed) | Administrators, Department Users |

Issued, Released or Completed orders, Completed slips, and Rejected or
Completed bookings are final: nothing is reversed automatically.

**Voiding a released slip** goes through `voidReleasedRis`. In one
transaction it reads the slip's "RIS Release" stock-card lines — what the
release actually took, not what the slip's lines say now — less any
"Return" lines already written, adds that stock back, writes a "Return" line
per item under the same document number with the reason, and closes the slip
with `stock_reversed_at` / `stock_reversed_by_uid`. It refuses a slip that is
not Released, a second reversal, and — changing nothing — a slip whose item
has since left the register (correct the stock by hand first). Browsers
cannot void a Released slip or set the reversal fields. On the Supabase
fallback a released slip cannot be voided (no atomic reversal there).

The energy, water, fuel and violation records keep their existing actions:
a violation is cancelled with a reason (already so on Supabase), the others
are corrections to utility logs and can still be deleted.

## Audit trail

Append-only from the app. Entries are written only by `recordEvents` with the
Admin SDK. `firestore.rules` lets no one — Administrators included — create,
edit or delete an entry. The single exception is the Audit trail screen's
comment thread: an Administrator may add exactly one comment at a time, at
the end, with `author_uid` equal to their own account; earlier comments
cannot be changed or removed. (`deleteAuditEntries` is not used by any
screen; on Firestore it refuses.) Comments on every module record the
signed-in person's name and office, not the fixed word "Administrator".

Who an entry names comes from the write's own stamp (`created_by_uid` /
`updated_by_uid`, see Data layer): a staff member's email, "Public Portal"
for a portal submission (`created_by_uid: null`), or "System" for a server
write nobody stamped. The trigger's own view of who wrote is used only when
there is no stamp, such as a deletion: production supplies it, the emulator
does not, so in local tests deletions read "System". Entries are dated by the
document's commit time, to the microsecond.

The rules cannot stop someone with owner access to the Google Cloud project
from deleting entries in the console or through the Admin SDK. Protecting the
trail from project owners as well (exports to locked storage, retention) is
not in place and needs a separate decision.

## Billing

The billing plan of `egso-b2c0a` has not been checked yet (that needs a
remote read). Hosting, Firestore and Auth work on the free Spark plan;
**Cloud Functions and Cloud Storage need the Blaze (pay-as-you-go) plan**. Upgrading is a decision for the project owner, made in the Firebase
console with a budget alert — never from this repository. At GSO's volume the
expected cost is low; the main driver is Firestore reads, which is why list
screens page and count on the server (see data-model.md). Service by service,
and the go-live order: docs/firebase/fresh-start.md.

## Still on Supabase

`VITE_DATA_BACKEND=firebase` signs staff in with Firebase. These still read
and write Supabase, which a Firebase sign-in does not open, so in Firebase
mode they do not load until they are migrated:

Nothing, as of Phase 5A: every module has a Firestore version behind its
`api.ts`, and Reports, the dashboard, counts and live updates follow the
switch. The Supabase code stays as the fallback (`api.supabase.ts` beside each
module, `lib/db.ts`, `lib/storage.ts`, `lib/supabase.ts`) until Firebase is
validated with real use; removing it is a later, separate step.

## Records Management (Phase 5A)

What the module does today is what moved; nothing was added. Migration 049
is not in the repository and nothing in the code needs it: every column the
Records screens use is created by 040–048.

- **Forms** — Records Disposition Schedule (RDS), Records Inventory and
  Appraisal (RIA), Request for Authority to Dispose of Records (RAD) — are
  saved by `saveRecordsDocument`: header, lines (renumbered 1, 2, 3 …;
  a schedule's record series keep their IDs), number, and filing, in one
  transaction. A number is spent only on a saved form and is never reused
  (claimed in `unique_keys`, kept when a form is deleted).
- **Filing** (migration 047's trigger): a form becoming Approved is put in
  the current box for its kind and year; a box that does not exist is made
  in the first free position (shelves in order, levels A–E, positions 1–3),
  and a full room gets a new shelf. Leaving Approved takes it out; the box
  stays. Simultaneous approvals cannot start two Box 01s or take one
  position twice (document IDs `record_boxes/RDS-2026-01`,
  `record_box_positions/{level}~{slot}`).
- **Custody**: there is no check-out and return. Migration 046 removed
  `record_files`, `file_record`, `retrieve_record` and `return_record`;
  the room tracks where each box stands and what is in it. Moving a box and
  correcting its label are what the office does.
- **Attachments**: none. No Records screen uploads a file.
- **Who**: every staff role reads; only Administrators change anything
  (`manage:records`), as approved on 2026-10-20 (Supabase had let any
  signed-in account write). Forms are voided, never deleted.
- **History**: the audit trail names Records changes as `log_audit` did —
  Schedule Submitted / Approved, Disposal Requested / Authorised, Box
  Created / Moved, Record Filed / Unfiled.

The migration is not complete while any of these remains.

## Phases

1. Foundation and emulators — done
2. Data access and business logic: PR, PO, RIS, Reservations, Inventory — done
3. Auth, notifications, audit trail, settings, rules hardening, browser testing — done for those modules
4. Energy, Water, Fuel, Violations; voiding PO, RIS (with stock return) and reservations; role-aware sidebar — done locally.
   5A. Records Management; unique account, plate and submeter numbers; data-migration tooling; Hosting readiness — done locally.
   5B. Fresh start (no data migrated): first-run setup tooling, account security, Content-Security-Policy in report-only mode, setup and preview checklist (docs/firebase/fresh-start.md) — prepared locally; remote steps await approval.
5. Hosting preview channel and first-run setup on egso-b2c0a (needs verified isolation)
6. Final validation, production deploy, cutover
7. UI/UX polish

Each phase needs separate approval.
