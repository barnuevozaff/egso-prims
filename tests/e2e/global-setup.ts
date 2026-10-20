import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

/**
 * Starts the app in Vite's "emulators" mode (.env.emulators: Firebase data
 * layer, demo project, local emulators) for the browser tests, and stops it
 * afterwards. The emulators themselves are started by `npm run test:e2e`.
 */

export const APP_URL = "http://127.0.0.1:5174";

let server: ChildProcess | undefined;

async function waitForApp(timeoutMs = 60_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    try {
      if ((await fetch(APP_URL)).ok) return;
    } catch {
      // not up yet
    }
    if (Date.now() > until) throw new Error(`The app did not start at ${APP_URL}.`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

export async function setup(): Promise<void> {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Browser tests run only with the emulators started (npm run test:e2e).");
  }
  const vite = path.resolve(__dirname, "../../node_modules/vite/bin/vite.js");
  server = spawn(process.execPath, [vite, "--mode", "emulators", "--host", "127.0.0.1", "--port", "5174", "--strictPort"], {
    cwd: path.resolve(__dirname, "../.."),
    stdio: "ignore",
  });
  await waitForApp();
}

export async function teardown(): Promise<void> {
  server?.kill();
}
