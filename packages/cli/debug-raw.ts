/** TEMP debug: raw-chunk echo latency (deleted after use) */
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawn } from "@opencode-ai/core/pty/driver"

const BINARY = "/home/toxic/.local/bin/kappa"
const text = "kappa-typing-latency-probe-12345"
const dir = await mkdtemp(path.join(os.tmpdir(), "kappa-raw-"))
const env: Record<string, string> = {}
for (const key of ["PATH", "LANG", "LC_ALL", "LC_CTYPE"]) env[key] = process.env[key] ?? ""
Object.assign(env, {
  TERM: "xterm-256color",
  KAPPA_TERMINAL: "1",
  KAPPA_TEST_HOME: dir,
  KAPPA_NO_DAEMON: "1",
  KAPPA_DISABLE_AUTOUPDATE: "1",
  KAPPA_DISABLE_MODELS_FETCH: "1",
  KAPPA_DISABLE_PROJECT_CONFIG: "1",
  KAPPA_PURE: "1",
  KAPPA_CONFIG_CONTENT: JSON.stringify({ enabled_providers: ["anthropic"], experimental: { openTelemetry: false } }),
  KAPPA_AUTH_CONTENT: "{}",
  ANTHROPIC_API_KEY: "dummy",
  HOME: dir,
  XDG_DATA_HOME: path.join(dir, ".local", "share"),
  XDG_CACHE_HOME: path.join(dir, ".cache"),
  XDG_CONFIG_HOME: path.join(dir, ".config"),
  XDG_STATE_HOME: path.join(dir, ".local", "state"),
})
const project = path.join(dir, "project")
await mkdir(project, { recursive: true })
const proc = spawn(BINARY, ["--pure"], { name: "xterm-256color", cwd: project, env, cols: 100, rows: 40 })
let output = ""
let lastChunkAt = Date.now()
const arriving = Promise.withResolvers<void>()
proc.onData((chunk) => {
  output += chunk
  if (output.length > 200_000) output = output.slice(-100_000)
  lastChunkAt = Date.now()
  try { arriving.resolve() } catch {}
})
await arriving.promise
// wait for boot (output settles / screen present): poll raw output for "Ask" or "commands" markers
const norm = (s: string) => s.replace(/\s+/g, "")
const bootMark = async () => {
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    if (norm(output).includes("Ask")) return true
    await Bun.sleep(100)
  }
  return false
}
const booted = await bootMark()
console.log("booted:", booted, "output bytes:", output.length)
if (!booted) { await rm(dir, { recursive: true, force: true }); process.exit(1) }
await Bun.sleep(500)
// type each char; measure when a CHUNK arrives containing the full typed text in the ESC-stripped stream
const strip = (s: string) => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "").replace(/\x1b\][^\x07]*\x07/g, "").replace(/\x1b[()][A-Z0-9]/g, "")
let typed = ""
const lat: number[] = []
for (let i = 0; i < text.length; i++) {
  typed += text[i]!
  const t0 = Date.now()
  // clear the "seen" watermark so we only match NEW output
  const pre = output.length
  proc.write(text[i]!)
  let echo = -1
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const fresh = strip(output.slice(pre))
    if (norm(fresh).includes(typed)) { echo = Date.now() - t0; break }
    await Bun.sleep(5)
  }
  lat.push(echo)
  process.stdout.write(`${i}: '${text[i]}' ${echo}ms\n`)
}
const got = lat.filter((x) => x >= 0)
console.log("avg(ms):", got.length ? Math.round(got.reduce((a, b) => a + b, 0) / got.length) : -1)
console.log("max(ms):", got.length ? Math.max(...got) : -1)
console.log("stalls:", lat.filter((x) => x < 0).length, "over-250ms:", lat.filter((x) => x >= 250).length)
try {
  const { KappaPtyTermination } = await import("@opencode-ai/core/kappacode/pty/termination")
  await KappaPtyTermination.terminate(proc)
} catch {}
await rm(dir, { recursive: true, force: true })