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
 *   admin  --email <a@alaminos.gov.ph> [--name "Full Name"]
 *                                           the first Administrator; prints a one-time set-password link
 *   staff  --email <…> --role "Department User"|Viewer|Administrator [--approver] [--name …]
 *                                           an office account with a role (the app has no Users screen yet)
 *   settings --file <settings.json>         the office's particulars and numbering format; never overwrites
 */
import { readFileSync } from "node:fs";

import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import {
  AUTHORISED_PROJECT,
  assertSetupTarget,
  freshStartCheck,
  provisionAccount,
  provisionFirstAdministrator,
  seedSettings,
  type Role,
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
const auth = getAuth();
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
  case "admin":
  case "staff": {
    const email = value("--email");
    if (!email) throw new Error("--email is required.");
    const p =
      command === "admin"
        ? await provisionFirstAdministrator(auth, { email, displayName: value("--name") })
        : await provisionAccount(auth, {
            email,
            displayName: value("--name"),
            role: (value("--role") ?? "") as Role,
            approver: args.includes("--approver"),
          });
    say(`${p.created ? "Created" : "Updated"} ${p.email} (${p.uid}) as ${p.role}${p.approver ? ", approver" : ""}.`);
    say("Give this one-time link to that person only; it lets them set their own password:");
    say(p.passwordLink);
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
    console.error("Commands: check | admin | staff | settings  (see the top of functions/setup/cli.ts)");
    process.exit(2);
}
