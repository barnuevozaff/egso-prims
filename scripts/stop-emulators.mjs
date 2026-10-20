// Stops Firebase emulator processes left behind by an earlier run.
//
// On Windows the Firebase CLI can crash while shutting down (a libuv
// assertion under Node 24) and leave the Java emulators running, holding
// their ports, so the next `emulators:exec` fails with "port taken". This
// stops only Java processes running a jar from the Firebase emulator cache
// (~/.cache/firebase/emulators); it never touches the CLI itself, the
// Firebase MCP server or anything else.

import { execFileSync } from "node:child_process";

const MARKER = /[\\/]\.cache[\\/]firebase[\\/]emulators[\\/]/;

function windowsProcesses() {
  const out = execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_Process -Filter \"Name='java.exe'\" | " +
        "ForEach-Object { \"$($_.ProcessId)`t$($_.CommandLine)\" }",
    ],
    { encoding: "utf8" },
  );
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [pid, ...cmd] = line.split("\t");
      return { pid: Number(pid), cmd: cmd.join("\t") };
    });
}

function posixProcesses() {
  const out = execFileSync("ps", ["-eo", "pid=,args="], { encoding: "utf8" });
  return out
    .split("\n")
    .filter((l) => l.includes("java"))
    .map((l) => {
      const [, pid, cmd] = l.match(/^\s*(\d+)\s+(.*)$/) ?? [];
      return { pid: Number(pid), cmd: cmd ?? "" };
    });
}

const leftovers = (process.platform === "win32" ? windowsProcesses() : posixProcesses()).filter(
  (p) => p.pid && MARKER.test(p.cmd),
);

for (const { pid, cmd } of leftovers) {
  const jar = cmd.match(/[^\\/]+\.jar/)?.[0] ?? "emulator";
  try {
    process.kill(pid);
    console.log(`Stopped leftover ${jar} (pid ${pid}).`);
  } catch (err) {
    console.warn(`Could not stop ${jar} (pid ${pid}): ${err.message}`);
  }
}
