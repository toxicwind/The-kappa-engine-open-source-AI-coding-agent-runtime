/** TEMP debug: per-key grid evolution (deleted after use) */
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawn } from "@opencode-ai/core/pty/driver"
import { VtScreen } from "./src/kappacode/cli/cmd/tui/vt/vt-screen.ts"

const BINARY = "/home/toxic/.local/bin/kappa"
const term = process.argv[2] ?? "xterm-256color"
const dir = await mkdtemp(path.join(os.tmpdir(), "kappa-debug-"))
const env: Record<string, string> = {}
for (const key of ["PATH", "LANG", "LC_ALL", "LC_CTYPE"]) env[key] = process.env[key] ?? ""
Object.assign(env, {
  TERM: term,
  KAPPA_TERMINAL: "1",
  KAPPA_TEST_HOME: dir,
  KAPPA_NO_DAEMON: "1",
  KAPPA_DISABLE_AUTOUPDATE: "1",
  KAPPA_DISABLE_MODELS_FETCH: "1",
  KAPPA_DISABLE_PROJECT_CONFIG: "1",
  KAPPA_PURE: "1",
  KAPPA_CONFIG_CONTENT: JSON.stringify({ enabled_providers: [], experimental: { openTelemetry: false } }),
  KAPPA_AUTH_CONTENT: "{}",
  HOME: dir,
  XDG_DATA_HOME: path.join(dir, ".local", "share"),
  XDG_CACHE_HOME: path.join(dir, ".cache"),
  XDG_CONFIG_HOME: path.join(dir, ".config"),
  XDG_STATE_HOME: path.join(dir, ".local", "state"),
})
const project = path.join(dir, "project")
await mkdir(project, { recursive: true })
const proc = spawn(BINARY, ["--pure"], { name: term, cwd: project, env, cols: 100, rows: 40 })
const screen = new VtScreen(100, 40)
proc.onData((chunk) => screen.write(chunk))
const rows = (from: number, to: number) =>
  screen
    .cells()
    .slice(from, to)
    .map((row, y) => `${y + from}: ${row.map((c) => (c.char === " " ? "·" : c.char)).join("").replace(/\s+$/, "")}`)
// boot wait
const norm = (s: string) => s.replace(/\s+/g, "")
const bootStart = Date.now()
for (;;) {
  if (norm(screen.text()).includes("Ask") || norm(screen.text()).length > 700) break
  if (Date.now() - bootStart > 45_000) { console.log("BOOT TIMEOUT"); await rm(dir, { recursive: true, force: true }); process.exit(1) }
  await Bun.sleep(100)
}
await Bun.sleep(400)
console.log(`BOOTED ${Date.now() - bootStart}ms\n=== boot screen rows 14-26 ===`)
console.log(rows(14, 27).join("\n"))
// type slowly, snapshot after each char
const text = "hello world"
for (let i = 0; i < text.length; i++) {
  proc.write(text[i]!)
  await Bun.sleep(180) // human cadence
  const t0 = Date.now()
  for (;;) {
    if (norm(screen.text()).includes(text.slice(0, i + 1))) break
    if (Date.now() - t0 > 1500) break
    await Bun.sleep(10)
  }
  console.log(`\n--- after '${text[i]}' (echo ${Date.now() - t0}ms) rows 14-26 ---`)
  console.log(rows(14, 27).join("\n"))
}
await Bun.sleep(300)
console.log(`\n=== final rows 14-30 ===`)
console.log(rows(14, 31).join("\n"))
// terminate
try {
  const { KappaPtyTermination } = await import("@opencode-ai/core/kappacode/pty/termination")
  await KappaPtyTermination.terminate(proc)
} catch {}
await rm(dir, { recursive: true, force: true })