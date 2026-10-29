/**
 * First-run setup for a fresh EGSO-PRIMS on Firebase.
 *
 * Emulator (default; what this repository's tests and rehearsals use):
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *   node functions/setup/cli.ts <command> [options]
 *
 * Remote (egso-b2c0a only, after approval, with credentials that reach only
 * that project — docs/firebase/fresh-start.md):
 *   node functions/setup/cli.ts <command> --remote --confirm-remote egso-b2c0a [options]
 *
 * Commands:
 *   check                                   is the database fresh?
 *   settings --file <settings.json>         the office's particulars and numbering format; never overwrites
 *
 * Accounts are not made here: add them in the Firebase console
 * (Authentication → Users → Add user); every account is an Administrator
 * (29 Oct 2026).
 */
import { readFileSync } from "node:fs";

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import {
  AUTHORISED_PROJECT,
  assertSetupTarget,
  freshStartCheck,
  seedSettings,
} from "./provision.ts";

const args = process.argv.slice(2);
const command = args[0];
const value = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const remote = args.includes("--remote");
const projectId = remote ? AUTHORISED_PROJECT : "demo-egso-prims";
assertSetupTarget({ projectId, remote, confirm: value("--confirm-remote") });

process.env.GCLOUD_PROJECT = projectId;
if (!remote) process.env.METADATA_SERVER_DETECTION = "none";
initializeApp({ projectId });
const db = getFirestore();

const say = (line: string) => console.log(line);

switch (command) {
  case "check": {
    const r = await freshStartCheck(db);
    say(r.fresh ? "Fresh: no records, counters or claims." : "NOT fresh:");
    for (const [c, n] of Object.entries(r.notEmpty)) say(`  ${c}: ${n}${n >= 1000 ? "+" : ""}`);
    say(`Settings documents: ${r.settings}`);
    process.exit(r.fresh ? 0 : 1);
    break;
  }
  case "settings": {
    const file = value("--file");
    if (!file) throw new Error("--file is required.");
    const values = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    const r = await seedSettings(db, values, "first-run-setup");
    say(`Written: ${r.written.join(", ") || "none"}`);
    say(`Kept (already set): ${r.kept.join(", ") || "none"}`);
    break;
  }
  default:
    console.error("Commands: check | settings  (see the top of functions/setup/cli.ts)");
    process.exit(2);
}
