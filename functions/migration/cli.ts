/**
 * Imports a Supabase export (a folder of <table>.json files) into the LOCAL
 * Firestore emulator and prints the reconciliation report.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 \
 *   node functions/migration/cli.ts --source <folder> [--dry-run] [--storage-base <url>]
 *
 * The project is always demo-egso-prims. Refuses any other target.
 * Exits 1 when the import is refused or does not reconcile.
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { assertLocalTarget, readExport, runImport } from "./import.ts";

const PROJECT_ID = "demo-egso-prims";

const args = process.argv.slice(2);
const value = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const source = value("--source");
if (!source) {
  console.error("Usage: node functions/migration/cli.ts --source <folder> [--dry-run] [--storage-base <url>]");
  process.exit(2);
}

assertLocalTarget(PROJECT_ID);
process.env.GCLOUD_PROJECT = PROJECT_ID;
// No metadata-server probe: the emulator needs no credentials.
process.env.METADATA_SERVER_DETECTION = "none";
initializeApp({ projectId: PROJECT_ID });

const report = await runImport(getFirestore(), readExport(source), {
  dryRun: args.includes("--dry-run"),
  storageBase: value("--storage-base"),
});

for (const t of report.tables) {
  const totals = Object.keys(t.totalsSource)
    .map((k) => `${k} ${t.totalsSource[k]} → ${t.totalsTarget[k]}`)
    .join(", ");
  console.log(`${t.ok ? "ok " : "BAD"} ${t.table.padEnd(24)} ${String(t.source).padStart(6)} → ${String(t.target).padEnd(6)} ${totals}`);
  for (const m of t.mismatches) console.log(`      generated column differs: ${m}`);
}
for (const s of report.skipped) console.log(`skip ${s}`);
console.log(`claims ${report.claims}, counters ${report.counters.length}${report.dryRun ? " (dry run: nothing written)" : ""}`);
for (const e of report.errors) console.error(`ERROR ${e}`);
process.exit(report.ok ? 0 : 1);
