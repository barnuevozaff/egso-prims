# Fresh start on `egso-b2c0a`

Plan for bringing EGSO-PRIMS up on Firebase with an empty database
(Phase 5B). Prepared and rehearsed on the emulators only; **every step in
sections 4–6 is a remote action that waits for approval.**

Decisions this follows (approved 2026-10-20): the Supabase data is test data
and is not migrated; Firestore starts empty; a new Administrator account is
created; numbering starts fresh; Supabase and Vercel stay untouched until
Firebase is validated. Only `egso-b2c0a` is ever a target —
`alaminos-municipality` (the municipality's live system) and `egso-2k26`
(abandoned) are never touched; the setup tooling refuses both by name.

## 1. What a fresh start means for the code

| Area | Fresh-start behaviour | Action |
|---|---|---|
| Numbers | No counters are seeded. Each type's counter is created by its first document, so the first PR is `PR-<year>-000001`, the first audit entry `AUD-<year>-0001`, the first trip of a month `<yyyy>-<mm>-0001` (tested). Old test sequences are not continued. | none |
| Settings | Every setting has a built-in default (`src/features/config/types.ts`). The office's particulars are printed on official documents and their defaults are placeholders (`(049) 543-1234`, `gso@alaminos.gov.ph`). | confirm real values; write them at first run (4.4) |
| Records Room | Empty. The first approved RDS/RIA/RAD adds "Shelf 1" with levels A–E by itself. | none |
| Accounts | Made in the Firebase console (Authentication → Users → Add user). Every account is an Administrator; there are no other roles and no Users screen in the app (29 Oct 2026; README, "Authentication"). | 4.4 |
| Migration tooling | `functions/migration` is not used for go-live (no data to move). It stays as tested tooling; it is not deployed. | none |
| Unique values | Claims (`unique_keys`) are created as records are saved; nothing to seed. | none |
| Supabase / Vercel | Untouched; the live site keeps running on them. The Firebase build is a separate build (`VITE_DATA_BACKEND=firebase`). | none |

## 2. Nobody can make themselves an Administrator

Every account in Firebase Authentication is an Administrator (29 Oct 2026),
so who has an account is who has access. Accounts therefore come only from
the Firebase console:

- **Sign-up is off** (4.2): no browser, SDK or API call can create an
  account. This is the setting that keeps the system closed; never turn it
  on.
- Only an **email-and-password** sign-in counts. An anonymous or
  custom-token session is never staff, whatever its claims; custom claims
  are ignored everywhere.
- A disabled or deleted account is refused by every Cloud Function at once;
  direct database access from a browser already signed in lasts until its
  token expires, at most an hour (README, "What an open session can still
  do").
- Tested on the emulators: `tests/rules/accounts.test.ts` (rules) and
  `functions/test-emulator/accounts.emulator.test.ts` (functions: a
  console-style account with no claims is an Administrator; disabled,
  deleted, revoked and anonymous sessions are refused).

Console settings that close the remaining doors (4.2): **sign-up off**,
**email enumeration protection** on, a **password policy**.

## 3. Blaze plan

| Service | Spark (free) | Needs Blaze |
|---|---|---|
| Hosting | yes | — |
| Firestore | yes (free quota) | — |
| Authentication (email/password) | yes | — |
| **Cloud Functions** (all create/void/numbering/audit functions) | no | **yes** — the app cannot save numbered documents without them |
| **Cloud Storage** (attachments) | new default buckets require Blaze | **yes** |
| App Check (reCAPTCHA Enterprise) | — | free tier, but a billing-enabled project |

So the deploy needs **Blaze**, with a **budget alert** (suggested ₱1,000/month
alert; expected cost at GSO's volume is far below it — the main drivers are
Firestore reads and function invocations). Upgrading is the project owner's
decision in the console, never from this repository.

## 4. Setup procedure (remote — waits for approval)

### 4.1 Before anything remote

1. Use a Google account or service account that can reach **only
   `egso-b2c0a`**. Check: `firebase projects:list` lists `egso-b2c0a` and
   nothing else. If it lists `alaminos-municipality` or `egso-2k26`, stop.
2. `.firebaserc` already names `egso-b2c0a`; `functions/src/setup.ts`
   refuses any other project at load.
3. Decide the **Firestore location** — permanent once chosen. Recommended:
   `asia-southeast1` (Singapore), the same region as the functions.

### 4.2 Firebase Console checklist (project owner, in this order)

Sign in at console.firebase.google.com with the account of 4.1 and open
**egso-b2c0a**. Check the project ID in the top bar on every page — never
`alaminos-municipality` or `egso-2k26`.

- [ ] **Usage and billing** → Details & settings → **Modify plan** →
      **Blaze**, linked to the municipality's billing account. Then Google
      Cloud console → Billing → **Budgets & alerts** → a monthly budget with
      alerts at 50 %, 90 % and 100 %.
- [ ] **Authentication** → Get started → **Sign-in method** → enable
      **Email/Password** (not "Email link"); leave every other provider off.
- [ ] **Authentication** → **Settings** → **User actions** → untick
      **Enable create (sign-up)** — accounts then come only from
      Authentication → Users → **Add user**. Every account is an
      Administrator, so this must stay off. Leave **Enable deletion**
      unticked. (Set on egso-b2c0a; checked 29 Oct 2026.)
- [ ] **Authentication** → **Settings** → **User account linking**: one
      account per email.
- [ ] **Authentication** → **Settings** → **Email enumeration protection**:
      on.
- [ ] **Authentication** → **Settings** → **Password policy**: require
      enforcement, minimum length 10.
- [ ] **Authentication** → **Settings** → **Authorized domains**: keep
      `egso-b2c0a.web.app` and `egso-b2c0a.firebaseapp.com`; remove
      `localhost` before going live. Add a preview channel's domain only
      while testing on it.
- [ ] **Authentication** → **Templates** → Password reset: sender name
      "GSO PRIMS — Municipality of Alaminos"; leave the action URL as the
      default.
- [ ] **Firestore Database** → Create database → **Native mode** →
      location **asia-southeast1** *(only after the location / data-residency
      approval — permanent)* → **Start in production mode**.
- [ ] **Storage** → Get started → **production mode** → the same location.
- [ ] **Project settings** → General → **Add app** → Web, nickname
      "GSO PRIMS web", **without** Firebase Hosting setup (Hosting is
      configured from `firebase.json`). Copy the config into
      `.env.production` (never committed): `VITE_DATA_BACKEND=firebase`,
      `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
      `VITE_FIREBASE_PROJECT_ID=egso-b2c0a`, `VITE_FIREBASE_STORAGE_BUCKET`,
      `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_USE_EMULATORS=false`.
- [ ] **App Check** → Apps → the web app → **reCAPTCHA Enterprise** →
      create a key for the Hosting domains; put the site key in
      `VITE_FIREBASE_APPCHECK_SITE_KEY`. **Do not enforce** (APIs tab stays
      "Unenforced").
- [ ] **Project settings** → **Users and permissions**: only the people who
      need it; nobody added "just in case".
- [ ] Google Cloud console → **APIs & Services**: confirm Cloud Functions,
      Cloud Build, Artifact Registry, Eventarc and Cloud Run are enabled
      (the first functions deploy offers to enable them).

### 4.3 Deploy, in this order

```
firebase deploy --only firestore:rules,firestore:indexes,storage --project egso-b2c0a
firebase deploy --only functions --project egso-b2c0a
```

Rules first, so nothing is ever open. Functions (Node 22, `asia-southeast1`,
5 instances max each) build from `functions/` and upload `lib/` only.

### 4.4 First run

From a machine with the credentials of 4.1 (application default
credentials), with no emulator variables set:

```
node functions/setup/cli.ts check    --remote --confirm-remote egso-b2c0a
node functions/setup/cli.ts settings --remote --confirm-remote egso-b2c0a --file settings.json
```

- `check` must report **Fresh** before anything else.
- **Accounts** are added in the console: Authentication → **Users** →
  **Add user** → email and password → **Add user**. The person signs in at
  /login as an Administrator at once; nothing else is set up. Give the
  password to that person only; they can change it with **Forgot
  password?**.
- Before the first Purchase Request can be approved, an Administrator sets
  **Settings → Signatories** (the Requested-by signatory of each office, Cash
  Availability and Approved by — the verified officeholders; nothing is built
  in) and confirms the provisional **Official PR Number Prefix** (100) in
  Settings → Procurement. Until then approval is refused and says what is missing.
- `settings.json` starts from `functions/setup/settings.example.json`; the
  `CONFIRM WITH THE OFFICE` values must be replaced (address, contact
  number, official email). Existing values are never overwritten.
- Rehearsed end to end on the emulators (2026-10-20).

### 4.5 Hosting preview

```
npm run build        # with .env.production from 4.2
firebase hosting:channel:deploy preview --expires 7d --project egso-b2c0a
```

Add the channel's domain to Authentication's authorized domains (4.2)
before signing in on it.

## 5. Testing checklist (preview channel)

Run in Chrome on an office PC (Chrome 109) and a current Chrome:

- [ ] `curl -I` the preview URL, a route (`/purchase-requests`) and a hashed
      asset: `no-cache` on the page and route, `immutable` on the asset, the
      security headers, and the CSP report-only header. (The local Hosting
      emulator does not send configured headers, so this is the first real
      check.)
- [ ] Open DevTools on every module. Expected CSP report-only messages:
      **one** from Zod's speed check (`Function("")` inside a try/catch —
      harmless, it falls back). Anything else is a gap in the policy to
      fix before enforcing.
- [ ] An account added in the console signs in as an Administrator; a
      second browser shows sign-up is impossible.
- [ ] Public portal: file a PR, RIS and reservation; track each by number.
- [ ] Staff: approve the PR; raise a PO; approve the RIS (stock moves); void
      one of each (reason kept); void an approved RIS (stock returns).
- [ ] Inventory, energy, water, fuel, violations: create, edit, check
      numbers start at 000001.
- [ ] Records: create and approve an RDS — it files into Shelf 1, Level A,
      Box 1; move the box; correct its label.
- [ ] Reports, dashboard counts, notifications bell, audit trail entries
      name the right person.
- [ ] Print each official form; compare with the paper form.
- [ ] Disable an account in the console: its next action that goes through
      a Cloud Function (approve, void, number) is refused at once.
- [ ] Phone width: each list page.
- [ ] App Check metrics show verified requests; only then plan enforcing.
- [ ] Record policies: correct a bill (reason required; history shows the
      previous amount); void it (it stays listed as Voided and leaves the
      totals); record the month again. Void a fuel trip (the vehicle's fuel
      balance follows the remaining trips). Void an approved RDS (it stays
      filed, leaves the room's filed documents, cannot be edited).
- [ ] Holders: delete an account that has a bill (it is kept, and the
      message says to archive it); archive and restore it. Cancel a
      violation ticket (reason, name and date shown on the row). Correct a
      water reading (history shows before and after), then void it (it
      stays, marked Voided, out of the totals). Try to move a fuel trip to
      another month (refused).
- [ ] Archived and inactive: an archived account shows no Record Bill or
      Add Submeter and appears only under the Accounts filter's "Archived
      accounts"; an archived profile shows no Add Violation, and recording a
      ticket under its name is refused; an Inactive vehicle shows no Add
      Trip, Record Transaction or Add Reading. Restore each and record again.

## 6. Going live (later, separately approved)

Production deploy of Hosting; enforce App Check (functions:
`ENFORCE_APP_CHECK=true`, then Firestore and Storage in the console); switch
the CSP from report-only to enforced once the preview showed nothing
unexpected; tell the office the new address. Supabase and Vercel are retired
only after the office has used Firebase for an agreed period.

### Deployment order, from nothing to live

1. Console checklist (4.2).
2. `firebase deploy --only firestore:rules,firestore:indexes,storage`.
3. `firebase deploy --only functions`.
4. First run (4.4): `check` → `settings`; accounts added in the console.
5. Preview channel (4.5); the testing checklist (section 5).
6. Approval to go live → `firebase deploy --only hosting`.
7. A week of office use; then App Check and CSP enforcement, one at a time.

### Rollback

- **Nothing is replaced.** The Vercel site and Supabase keep running,
  untouched, until Firebase has been validated and the office has moved.
  Going back is telling people the old address again.
- **Hosting**: every deploy is a release; Console → Hosting → Release
  history → **Rollback** returns the previous one in seconds. A preview
  channel never touches the live site.
- **Rules / indexes**: redeploy the previous `firestore.rules` /
  `storage.rules` from git (each deploy is also kept in Console → Firestore →
  Rules → history).
- **Functions**: redeploy the previous commit's `functions/`; a single bad
  function can be removed with `firebase functions:delete <name>`.
  Document numbers are never handed out again whatever is redeployed
  (counters only move forward).
- **Data**: the database starts empty, so before go-live a bad first run is
  undone by deleting the test documents (or the database) and repeating
  4.4. After go-live there is no data rollback — records are corrected or
  voided, never deleted (section 8); enable **Firestore point-in-time
  recovery** and a scheduled export to a Cloud Storage bucket before go-live
  (both need Blaze).
- **Accounts**: disable or delete the account in Authentication → Users.
  Cloud Functions refuse it at once; direct database access from an open
  session ends when its token expires, within the hour.

## 7. Record policies (approved 2026-10-20, built locally)

| Records | Instead of deleting | Kept | Who |
|---|---|---|---|
| Records Management forms (RDS, RIA, RAD) | **Void** with a reason → status Cancelled | number, lines, status before the void, box and filing history (the form stays in its box, marked voided; it leaves the room's active records and no longer takes box capacity); no box is moved | Administrators |
| Energy bills (EC), water bills (WC), fuel purchases (FC), fuel trips | **Correct** with a reason, or **Void** with a reason | number; every correction's previous and new values, reason, account and time; voided records stay listed in their history, out of active totals and comparisons; a voided bill frees its month for the corrected bill (one active bill per account and month) | Administrators |
| Fuel trips (control number `YYYY-MM-NNNN`) | A correction may change the day, **not the month** | the control number belongs to its month; a trip recorded in the wrong month is voided and recorded again | Administrators |
| Submeter bills, water meter readings, odometer readings (no number) | **Correct** with a reason, or **Void** with a reason | the same correction history and void record as a bill; consumption and distance are recomputed; a reading cannot go backwards; a voided submeter bill frees its month (one active bill per submeter and month) | Administrators |
| Violation tickets (OV) | **Cancel** with a reason → status Cancelled | number, amount, the reason, who cancelled and when; a cancelled ticket takes no payment and leaves the totals; a paid ticket cannot be cancelled | Administrators |
| Energy and water accounts, violator profiles that hold records | **Archive** (and restore) | the account or profile and everything it holds, with who archived it and when; listed under the Archived filter | Administrators |
| Submeters and vehicles that hold records | Kept; set **Inactive** (energy submeters, vehicles) or **Archived** (water submeters) | everything they hold; vehicles are listed under the Status filter | Administrators |

An account, submeter, vehicle or profile is deleted only while it holds
nothing (`deleteRecordHolders` checks inside the delete, so a bill saved at
the same moment cannot be orphaned). A delete of several keeps the ones
with records, deletes the rest, and names the kept ones.

Archived or inactive holders take no new records (approved 2026-10-21):
no bill, submeter or submeter bill for an archived account; no bill or
reading for an inactive or archived submeter; no trip, purchase or
odometer reading for an inactive vehicle; no ticket for an archived
profile, whether recorded by name or from the profile — and recording one
never restores it. The check runs on the server inside the same
transaction as the save (`createNumberedRecord`, `createFuelTrip`,
`recordViolation`, `createUtilityEntry`) and, for new submeters, in
`firestore.rules`; the screens hide the add buttons and say how to restore.
An Administrator restores an account or profile from its drawer, and a
vehicle or submeter by setting it Active.

What an archive does not stop (approved 2026-10-21): an Administrator
correcting or voiding the records already on file, and recording the
payment of a ticket issued before the profile was archived. Neither is a
new transaction, and both keep the audit history.

Not built yet (deferred to the UI polishing phase, approved 2026-10-21):
a submeter's per-month bill history. The screens show only each submeter's
latest bill, so there is no Void (or Correct) button for a submeter bill
yet, although `voidEnergySubmeterBill` / `voidWaterSubmeterBill` and the
server already support it. The screen is drawn as a mockup first.

The register lists active accounts and profiles; the Accounts (or Profiles)
filter shows the archived ones. Archived accounts leave the account count
and the month's comparison, but their bills still count in the year's
expense, which is money already spent.

Corrections and reversals stay distinct: a correction is a revision of a
record that still counts; a void is the reversal, kept but no longer
counted. Both go only through Cloud Functions (`correctUtilityRecord`,
`voidUtilityRecord`, `voidRecordsDocument`, `deleteRecordHolders`,
`setRecordHolderArchived`); `firestore.rules` refuse editing or deleting
these records from the browser, and cancelling a ticket requires the
reason, the signed-in account and the time. The Supabase fallback cannot
void or archive (no columns for it) and corrects in place without history;
it says so instead of pretending. It does not check archived or inactive
holders either: the new rules are enforced on Firebase only.

Unchanged: issued purchase orders are not voidable (a separate procedure
waits for approval). Accounts are added in the Firebase console (no Users
screen).

## 8. Blockers before a preview deployment

1. Approval to run sections 4.2–4.5.
2. Credentials that reach only `egso-b2c0a` (4.1).
3. Blaze plan and budget alert.
4. Location and data-residency approval for `asia-southeast1` (permanent).
5. The office's real particulars for `settings.json`.
6. The open policy questions in the latest report.
