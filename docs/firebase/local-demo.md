# Local demo: EGSO-PRIMS on this computer

Runs the whole system on the Firebase Emulator Suite for hand testing and UI
polishing. Nothing leaves this computer: the offline `demo-egso-prims`
project only, every emulator and the app listen on this PC alone
(`127.0.0.1` / `localhost`), synthetic data only. It never touches
`egso-b2c0a`, and the app refuses `alaminos-municipality` and `egso-2k26` by
name. No Blaze plan is needed.

## Start (two terminals, in `C:\Alaminos-PRIMS\egso-prims`)

Terminal 1 — the emulators (Auth, Firestore, Functions, Storage):

```
npm run demo:emulators
```

Wait for **"All emulators ready!"**. It loads the saved demo data from
`emulator-data\` when that folder exists.

Terminal 2 — the app, in emulator mode:

```
npm run dev:emulators
```

Open **http://localhost:5173/** in Chrome.

**First time only** (or after a reset), with the emulators running, in a
third terminal:

```
npm run demo:setup
npm run demo:save
```

## Demo account

Sign in as **`demo.admin@alaminos.gov.ph`** with the demo password
**`demo-only-2026`**. It exists only in the local emulator; it is not a real
account, and the password must never be used anywhere real.

Like every account, it is an Administrator and sees everything (29 Oct 2026:
EGSO-PRIMS has one role). Demo data saved before then may still hold the old
demo.approver, demo.staff and demo.viewer accounts; they are Administrators
too. More accounts can be added in the Emulator UI's Authentication tab,
as on egso-b2c0a they are added in the Firebase console.

The public portal needs no sign-in: http://localhost:5173/portal

The Emulator UI (data and accounts, read and edit by hand):
http://127.0.0.1:4000

## Save, stop, restart

- **Save** while it runs — do this before stopping, after any testing worth
  keeping:
  ```
  npm run demo:save
  ```
- **Stop**: press **Ctrl+C** in each terminal. The emulators also try to save
  on Ctrl+C, but on Windows the Firebase CLI sometimes crashes while shutting
  down, so `demo:save` first is the safe habit.
- If a later start says a **port is taken**, an old emulator is still
  running:
  ```
  npm run emulators:stop
  ```
- **Restart**: the two start commands again. Accounts, settings and records
  come back from `emulator-data\`.
- **Start over** with an empty system: stop everything, delete the
  `emulator-data` folder, start the emulators, then `npm run demo:setup` and
  `npm run demo:save`.

`emulator-data\` is git-ignored and stays on this PC.

## Notes

- Port 5000 (the Hosting emulator) serves the last production build, not the
  emulator-mode app; use http://localhost:5173/.
- The only addresses outside this PC the app contacts are Google Fonts (the
  Geist typeface).
- Do not start the app with `--host` or open a tunnel: that would expose it
  beyond this computer.
- The automated tests (`npm run test:e2e` and the others) first stop any
  running emulators, the demo's included, then run on their own empty ones.
  They do not touch `emulator-data\`, but anything not yet saved is lost, so
  run `npm run demo:save` before running them.
- Keep the PC from sleeping during long sessions (Settings → System → Power
  & battery → Screen and sleep).
