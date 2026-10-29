/**
 * Starts the Emulator Suite for hand testing (`npm run demo:emulators`), with
 * the demo data kept between runs: it loads emulator-data/ when it exists and
 * saves back to it when the emulators stop with Ctrl+C. emulator-data/ is
 * machine-local and git-ignored. Offline demo-egso-prims project only; every
 * emulator listens on 127.0.0.1 (firebase.json).
 */
import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";

const DIR = "emulator-data";

execSync("node scripts/stop-emulators.mjs", { stdio: "inherit" });
execSync("npm --prefix functions run build", { stdio: "inherit" });

const args = ["emulators:start", "--project", "demo-egso-prims", `--export-on-exit=${DIR}`];
if (existsSync(`${DIR}/firebase-export-metadata.json`)) args.push(`--import=${DIR}`);
else console.log(`No saved demo data yet; starting empty. Run "npm run demo:setup" once the emulators are up.`);

const child = spawn("firebase", args, { stdio: "inherit", shell: process.platform === "win32" });
// Ctrl+C reaches the Firebase CLI too, which saves the data before it exits.
process.on("SIGINT", () => {});
child.on("exit", (code) => process.exit(code ?? 0));
