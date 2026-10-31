/**
 * RACE PROBE: measures TUI input echo latency per env mode.
 * Usage: bun race-probe.ts <mode>
 * Modes:
 *   pure        — isolated home, KAPPA_PURE, NO_DAEMON, no MCP, no indexing (deployed binary)
 *   full        — user-like env: daemon attach, MCP, indexing, skills (deployed binary)
 *   nomcp       — full env minus MCP servers (deployed binary)
 *   noindex     — full env minus indexing plugin (deployed binary)
 *   source      — full env against SOURCE (bun run src/index.ts)
 *   sourcepure  — pure env against SOURCE
 * Writes /tmp/kappa-race/<mode>.json
 */
import { spawn } from "@opencode-ai/core/pty/driver"
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const mode = process.argv[2] ?? "pure"
const isSource = mode.startsWith("source")
const isPure = mode === "pure" || mode === "sourcepure"
const COLS = 100, ROWS = 40
const BINARY = "/home/toxic/.local/bin/kappa"

const dir = await mkdtemp(path.join(os.tmpdir(), `kappa-race-${mode}-`))
const project = path.join(dir, "project")
await mkdir(project, { recursive: true })

const userEnv: Record<string, string> = {}
// pull the live kappa's resolved env for user-like modes
if (!isPure) {
  const envTxt = await Bun.file("/proc/473255/environ").text().catch(() => "")
  if (envTxt) {
    for (const pair of envTxt.split("\0")) {
      const i = pair.indexOf("=")
      if (i > 0) {
        const k = pair.slice(0, i)
        if (["FREEINFERENCE_API_KEY","RHODOCHROSITE_API_KEY","HODOS_API_KEY","KAPPA_ALLOW_HOME_INDEXING"].includes(k))
          userEnv[k] = pair.slice(i + 1)
      }
    }
  }
}

const env: Record<string, string> = { ...(process.env as Record<string, string>), ...userEnv }
env.TERM = "xterm-256color"
env.KAPPA_DISABLE_AUTOUPDATE = "1"
if (isPure) {
  env.KAPPA_TERMINAL = "1"
  env.KAPPA_TEST_HOME = dir
  env.KAPPA_NO_DAEMON = "1"
  env.KAPPA_DISABLE_MODELS_FETCH = "1"
  env.KAPPA_DISABLE_PROJECT_CONFIG = "1"
  env.KAPPA_PURE = "1"
  env.KAPPA_CONFIG_CONTENT = JSON.stringify({ enabled_providers: ["anthropic"], experimental: { openTelemetry: false } })
  env.KAPPA_AUTH_CONTENT = "{}"
  env.ANTHROPIC_API_KEY = "dummy"
  env.HOME = dir
  env.XDG_DATA_HOME = path.join(dir, ".local", "share")
  env.XDG_CACHE_HOME = path.join(dir, ".cache")
  env.XDG_CONFIG_HOME = path.join(dir, ".config")
  env.XDG_STATE_HOME = path.join(dir, ".local", "state")
  env.TMPDIR = dir; env.TMP = dir; env.TEMP = dir
} else {
  env.KAPPA_ALLOW_HOME_INDEXING = env.KAPPA_ALLOW_HOME_INDEXING ?? "1"
  if (mode === "nomcp") env.KAPPA_RACE_DISABLE_MCP = "1"
  if (mode === "noindex") env.KAPPA_DISABLE_CODEBASE_INDEXING = "1"
}

const cwd = isSource ? "/home/toxic/pens/olympus/products/kappa/kappa-code/packages/cli" : project
const argv = isSource
  ? ["run", "--conditions=browser", "./src/index.ts"]
  : [BINARY]

const t0 = Date.now()
const proc = spawn("bun", argv, { name: "xterm-256color", cwd, env, cols: COLS, rows: ROWS })
let output = ""
proc.onData((c) => { output += c; if (output.length > 400_000) output = output.slice(-200_000) })

const norm = (s: string) => s.replace(/\s+/g, "")
const strip = (s: string) => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "").replace(/\x1b\][^\x07]*\x07/g, "").replace(/\x1b[()][A-Z0-9]/g, "")
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// boot wait
let bootMs = -1
{
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    const t = norm(strip(output))
    if (t.includes("Ask") || t.length > 800) { bootMs = Date.now() - t0; break }
    await sleep(100)
  }
}
await sleep(500)

// typing test: per char echo latency with watermark
const text = "kappa-race-probe-01"
const lat: number[] = []
let typed = ""
for (let i = 0; i < text.length; i++) {
  typed += text[i]!
  const pre = output.length
  const w0 = Date.now()
  proc.write(text[i]!)
  let echo = -1
  const deadline = Date.now() + 6_000
  while (Date.now() < deadline) {
    const fresh = norm(strip(output.slice(pre)))
    if (fresh.includes(typed)) { echo = Date.now() - w0; break }
    await sleep(5)
  }
  lat.push(echo)
  await sleep(20)
}
const got = lat.filter((x) => x >= 0)
const result = {
  mode, bootMs,
  echoed: got.length,
  of: lat.length,
  avgMs: got.length ? Math.round(got.reduce((a, b) => a + b, 0) / got.length) : -1,
  maxMs: got.length ? Math.max(...got) : -1,
  deadChars: lat.filter((x) => x < 0).length,
  lat,
}
await Bun.write(`/tmp/kappa-race/${mode}.json`, JSON.stringify(result, null, 2))
console.log(mode, JSON.stringify(result))
// keep screen tail for forensics
await Bun.write(`/tmp/kappa-race/${mode}-screen.txt`, strip(output).slice(-2500))
try {
  const { KappaPtyTermination } = await import("@opencode-ai/core/kappacode/pty/termination")
  await KappaPtyTermination.terminate(proc)
} catch {}
await rm(dir, { recursive: true, force: true })
process.exit(0)
