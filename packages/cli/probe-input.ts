/**
 * TEMP diagnostic probe — kappa TUI typing-freeze repro (single leg; deleted after use).
 * Usage: bun probe-input.ts <term> <whichKey 0|1>
 * Measures per-char echo latency via VT screen, space-normalized matching.
 */
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { stripVTControlCharacters } from "node:util"
import { spawn } from "@opencode-ai/core/pty/driver"
import { VtScreen } from "./src/kappacode/cli/cmd/tui/vt/vt-screen.ts"

const BINARY = "/home/toxic/.local/bin/kappa"
const CHARS = "kappa-typing-latency-probe-12345" // no spaces: robust substring checks
const BURST = "BURSTburst987654321"
const GAP_MS = 25
const STALL_MS = 250
const COLS = 100
const ROWS = 40

const term = process.argv[2] ?? "xterm-256color"
const whichKey = process.argv[3] === "1"
const outDir = "/home/toxic/tmp/kappa-tui-repro"

const norm = (s: string) => s.replace(/\s+/g, "")

async function makeEnv(dir: string) {
  const env: Record<string, string> = {}
  for (const key of ["PATH", "SystemRoot", "SYSTEMROOT", "ComSpec", "LANG", "LC_ALL", "LC_CTYPE", "LANGUAGE"]) {
    const value = process.env[key]
    if (value !== undefined) env[key] = value
  }
  Object.assign(env, {
    TERM: term,
    KAPPA_TERMINAL: "1",
    KAPPA_TEST_HOME: dir,
    KAPPA_NO_DAEMON: "1",
    KAPPA_DISABLE_AUTOUPDATE: "1",
    KAPPA_DISABLE_MODELS_FETCH: "1",
    KAPPA_DISABLE_PROJECT_CONFIG: "1",
    KAPPA_PURE: "1",
    KAPPA_RPC_HANDSHAKE_TIMEOUT: "8000",
    KAPPA_CONFIG_CONTENT: JSON.stringify({
      enabled_providers: ["anthropic"],
      experimental: { openTelemetry: false },
    }),
    KAPPA_AUTH_CONTENT: "{}",
    ANTHROPIC_API_KEY: "dummy",
    HOME: dir,
    USERPROFILE: dir,
    APPDATA: path.join(dir, "AppData", "Roaming"),
    LOCALAPPDATA: path.join(dir, "AppData", "Local"),
    XDG_DATA_HOME: path.join(dir, ".local", "share"),
    XDG_CACHE_HOME: path.join(dir, ".cache"),
    XDG_CONFIG_HOME: path.join(dir, ".config"),
    XDG_STATE_HOME: path.join(dir, ".local", "state"),
    TMPDIR: dir,
    TMP: dir,
    TEMP: dir,
  })
  if (whichKey) {
    const kv = { news_read_ids: [], theme: "kappa", sidebar: "hide", plugin_enabled: { "which-key": true } }
    await mkdir(path.join(dir, ".local", "state", "kappa"), { recursive: true })
    await writeFile(path.join(dir, ".local", "state", "kappa", "kv.json"), JSON.stringify(kv))
  }
  return env
}

async function waitFor(fn: () => boolean, ms: number, poll = 25) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (fn()) return Date.now()
    await Bun.sleep(poll)
  }
  return -1
}

async function main() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "kappa-typing-"))
  const project = path.join(dir, "project")
  await mkdir(project, { recursive: true })
  const proc = spawn(BINARY, ["--pure"], { name: term, cwd: project, env: await makeEnv(dir), cols: COLS, rows: ROWS })
  const screen = new VtScreen(COLS, ROWS)
  const chunks: string[] = []
  const data = proc.onData((chunk) => {
    chunks.push(chunk)
    screen.write(chunk)
  })
  const t0 = Date.now()
  // boot: wait for the real UI screen (input field present) before typing anything
  const bootAt = await waitFor(() => {
    const text = norm(screen.text())
    return text.includes("Ask") || text.includes("Connect") || text.length > 800
  }, 45_000, 100)
  const bootMs = bootAt < 0 ? -1 : bootAt - t0
  if (bootAt < 0) {
    console.log(JSON.stringify({ ok: false, phase: "boot", term, whichKey, bootMs, screen: stripVTControlCharacters(screen.text()).slice(-300) }))
    await terminate(proc)
    await rm(dir, { recursive: true, force: true })
    return
  }
  await Bun.sleep(300) // let the first frame settle
  // per-char typing with echo latency
  const latencies: number[] = []
  const stalls: Array<{ i: number; ch: string; ms: number }> = []
  const snapshots: string[] = []
  let typed = ""
  for (let i = 0; i < CHARS.length; i++) {
    const ch = CHARS[i]!
    typed += ch
    proc.write(ch)
    const echoAt = await waitFor(() => norm(screen.text()).includes(typed), 5_000, 5)
    if (echoAt < 0) {
      stalls.push({ i, ch, ms: -1 })
      typed = typed.slice(0, -1) // drop so accumulated check doesn't compound
    } else {
      const ms = echoAt - (t0 + bootMs + 150)
      latencies.push(ms)
      if (ms >= STALL_MS) stalls.push({ i, ch, ms })
    }
    // snapshot the dialog/prompt area after every 3rd char
    if (i % 3 === 2) {
      const rows = screen
        .cells()
        .slice(14)
        .map((row, y) => row.map((c) => (c.char === " " ? "·" : c.char)).join("").replace(/\s+$/, ""))
        .map((l, y) => (l.length ? `R${y + 14}: ${l.slice(0, 100)}` : null))
        .filter(Boolean)
      snapshots.push(`-- after '${ch}' (${i}): ${echoAt < 0 ? "NO ECHO" : `${echoAt - (t0 + bootMs + 150)}ms`} --\n${rows.join("\n")}`)
    }
  }
  // burst (paste-like): whole string at once
  const target = typed + BURST
  proc.write(target.replace(typed, ""))
  const burstAt = await waitFor(() => norm(screen.text()).includes(target), 10_000, 25)
  const burstMs = burstAt < 0 ? -1 : burstAt - Date.now() - 0 // rough
  // second burst: 240 chars in one write (full-buffer paste flood)
  const flood = "x".repeat(240)
  const floodTail = "qwertyuiop"
  proc.write(flood + floodTail)
  const floodAt = await waitFor(() => norm(screen.text()).includes(floodTail), 12_000, 25)
  const floodMs = floodAt < 0 ? -1 : floodAt - Date.now()
  const totalMs = Date.now() - t0
  const avg = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : -1
  const sorted = [...latencies].sort((a, b) => a - b)
  const p95 = latencies.length ? sorted[Math.floor(sorted.length * 0.95)]! : -1
  const maxMs = latencies.length ? sorted[sorted.length - 1]! : -1
  const result = {
    ok: stalls.length === 0 && burstMs >= 0 && floodMs >= 0,
    term, whichKey, bootMs, avgMs: avg, p95Ms: p95, maxMs, stalls, burstMs, floodMs, totalMs,
    screenLen: screen.text().length,
  }
  console.log(JSON.stringify(result))
  console.log("=== PER-CHAR SNAPSHOTS ===")
  console.log(snapshots.join("\n\n"))
  // grid dump: raw rows with visible char markers
  const grid = screen.cells().map((row, y) =>
    row.map((c) => (c.char === " " ? "·" : c.char)).join("").replace(/\s+$/, ""),
  )
  const nonEmpty = grid.map((l, i) => [l, i] as const).filter(([l]) => l.length)
  console.log("=== GRID rows with content ===")
  for (const [l, i] of nonEmpty) console.log(`R${i}: ${JSON.stringify(l.slice(0, 120))}`)
  await writeFile(path.join(outDir, `result-${term}-wk${whichKey ? 1 : 0}.json`), JSON.stringify(result, null, 2))
  await writeFile(path.join(outDir, `screen-${term}-wk${whichKey ? 1 : 0}.txt`), stripVTControlCharacters(chunks.join("")).slice(-3000))
  await terminate(proc)
  await rm(dir, { recursive: true, force: true })
}

async function terminate(proc: any) {
  try {
    const { KappaPtyTermination } = await import("@opencode-ai/core/kappacode/pty/termination")
    await KappaPtyTermination.terminate(proc)
  } catch {}
}

await main()