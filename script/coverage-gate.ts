// kilocode_change - new file
//
// Coverage gate: runs test suite with bun --coverage, checks a 90% threshold,
// reports low-coverage files, and exits non-zero when below the bar.
//
// Usage: bun run script/coverage-gate.ts [--threshold <pct>] [--source <dir>]
//
// The gate enforces coverage on files actually exercised by the test run
// (bun only reports coverage for files imported by test targets). Files not
// imported by any test are excluded so dead/untested code doesn't drag the
// percentage down.
//
// Uses bun's text-coverage reporter (the only reporter bun supports) and
// parses the summary line + per-file rows from stdout.

import path from "path"
import fs from "fs/promises"

const root = path.resolve(import.meta.dir, "..")
const cliRoot = path.join(root, "packages", "cli")

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2)
let threshold = 90
let sourceDirs: string[] = []

for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === "--threshold" && i + 1 < argv.length) {
    threshold = Number(argv[++i])
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
      console.error(`Invalid threshold: ${threshold}`)
      process.exit(2)
    }
  } else if (a === "--source" && i + 1 < argv.length) {
    sourceDirs.push(argv[++i])
  } else if (a === "--help" || a === "-h") {
    console.log(`
Usage: bun run script/coverage-gate.ts [options]

Coverage gate — enforces a minimum test-coverage percentage on source files.

Options:
  --threshold <pct>   Minimum coverage percentage (default: 90).
  --source <dir>      Restrict coverage report to this source directory
                      (may be specified multiple times). When omitted, all
                      files touched by the test run are included.
  -h, --help          Show this help.

Exit codes:
  0   Coverage >= threshold
  1   Coverage < threshold (gate fails)
  2   Bad arguments
`)
    process.exit(0)
  }
}

// ---------------------------------------------------------------------------
// Run tests with coverage — capture stdout for text-coverage parsing
// ---------------------------------------------------------------------------

const coverageEnv: Record<string, string> = {
  ...process.env,
  BUN_COVERAGE_DIR: "/tmp/kappa-coverage-gate",
}

// Build test target list from the same discoverer the test runner uses.
const testTargets: string[] = []
const glob = new Bun.Glob("**/*.test.{ts,tsx}")
const allFiles = (await Array.fromAsync(glob.scan({ cwd: path.join(cliRoot, "test") })))
  .map((f) => f.replaceAll("\\", "/"))
  .sort()

const skipped = new Set(["mcp/oauth-browser.test.ts"])
let targets = allFiles.filter((f) => !skipped.has(f))

if (sourceDirs.length > 0) {
  // Map source dirs to test directories by convention:
  // src/foo/bar.ts -> test/foo/bar.test.ts
  const srcBases = sourceDirs.map((d) => {
    const p = path.resolve(cliRoot, d)
    const rel = p.startsWith(cliRoot) ? path.relative(cliRoot, p) : path.basename(p)
    return rel.startsWith("src/") ? rel.slice(4) : rel
  })
  targets = targets.filter((f) =>
    srcBases.some((b) => f.startsWith(b + "/") || f === b + ".test.ts" || f === b + "/index.test.ts"),
  )
}

if (targets.length === 0) {
  console.error("No test files matched the given filters")
  process.exit(2)
}

const coverageDir = "/tmp/kappa-coverage-gate"
await fs.mkdir(coverageDir, { recursive: true })

// Split targets into chunks to avoid arg-length limits.
const CHUNK = 80
const chunks: string[][] = []
for (let i = 0; i < targets.length; i += CHUNK) chunks.push(targets.slice(i, i + CHUNK))

const cmd = [
  "bun",
  "test",
  "--coverage",
  "--coverage-reporter=text",
  "--coverage-dir",
  coverageDir,
  "--timeout",
  "60000",
]
const proc = Bun.spawn([...cmd, ...chunks[0].map((t) => path.join("test", t))], {
  cwd: cliRoot,
  env: coverageEnv,
  stdout: "pipe",
  stderr: "pipe",
  windowsHide: true,
})

const stdout = (async () => {
  const d = new TextDecoder()
  let text = ""
  for await (const chunk of proc.stdout) text += d.decode(chunk, { stream: true })
  return text + d.decode()
})()

const stderr = (async () => {
  const d = new TextDecoder()
  let text = ""
  for await (const chunk of proc.stderr) text += d.decode(chunk, { stream: true })
  return text + d.decode()
})()

const code = await Promise.race([proc.exited, Bun.sleep(600_000).then(() => -1)])

if (code === -1) {
  await proc.kill("SIGKILL")
  console.error("Test run timed out after 600s")
  process.exit(1)
}

const [outText, errText] = await Promise.all([stdout, stderr])
if (errText) console.error(errText)

if (code !== 0) {
  console.error(`bun test exited with code ${code}`)
  const lastLines = outText.split("\n").slice(-200).join("\n")
  if (lastLines.trim()) console.error(lastLines)
  process.exit(1)
}

// Strip ANSI escape codes for reliable regex parsing
const ESC = String.fromCharCode(27) + "\\[[0-9;]*[a-zA-Z]"
const clean = outText.replace(new RegExp(ESC, "g"), "")

// ---------------------------------------------------------------------------
// Parse bun text-coverage output
//
// Format (from actual bun output):
//   --------------------------------------------------------------------------|---------|---------|-------------------
//   File                                                                                   | % Funcs | % Lines | Uncovered Line #s
//   --------------------------------------------------------------------------|---------|---------|-------------------
//   All files                                                                              |   38.97 |   19.61 |
//   src/foo/bar.ts                                                                        |    0.00 |   19.37 | 107-111,141
// ---------------------------------------------------------------------------

const SUMMARY_RE = /^All\s+files\s+\|\s+[\d.]+\s*\|\s+([\d.]+)\s*\|/
const FILE_RE = /^\s+(.+\.ts(x)?)\s+\|\s+[\d.]+\s*\|\s+([\d.]+)/

const summaryMatch = clean.match(SUMMARY_RE)
let overallStmtPct = 0
let overallFuncPct = 0

if (summaryMatch) {
  // bun text coverage columns: | % Funcs | % Lines |
  // We need both. Re-parse with a broader match.
  const broad = clean.match(/All\s+files\s*\|\s+([\d.]+)\s*\|\s+([\d.]+)/)
  if (broad) {
    overallFuncPct = Number(broad[1])
    overallStmtPct = Number(broad[2])
  }

  console.log("\n" + "=".repeat(72))
  console.log("COVERAGE GATE REPORT")
  console.log("=".repeat(72))
  console.log(`  Threshold:       ${threshold}%`)
  console.log(`  Total functions: ${overallFuncPct.toFixed(1)}%`)
  console.log("─".repeat(72))
  console.log(`  STATEMENTS:  ${overallStmtPct.toFixed(1)}%  (from bun text coverage)`)
  console.log("─".repeat(72))
} else {
  console.error("Could not find summary line in coverage output")
  console.error("Coverage output snippet:")
  const lines = clean.split("\n")
  const covStart = lines.findIndex((l) => l.includes("% Funcs"))
  if (covStart >= 0) console.error(lines.slice(covStart, covStart + 15).join("\n"))
  else console.error(clean.slice(-500))
  process.exit(1)
}

// Parse per-file rows for low-coverage report
const fileLines = clean.split("\n")
const lowCov: { path: string; pct: number; funcsPct: string; uncovered: string }[] = []
const zeroCov: { path: string }[] = []

for (const line of fileLines) {
  const m = line.match(FILE_RE)
  if (!m) continue
  const filePath = m[1]
  const stmtPct = Number(m[3])
  const uncovered = m[4].trim()

  // Filter by source dirs if specified
  if (sourceDirs.length > 0) {
    if (!sourceDirs.some((sd) => filePath.startsWith(sd + "/") || filePath === sd)) continue
  }

  if (stmtPct < threshold) {
    lowCov.push({ path: filePath, pct: stmtPct, funcsPct: m[2], uncovered })
  }
  if (stmtPct === 0) {
    zeroCov.push({ path: filePath })
  }
}

// Low-coverage files
if (lowCov.length > 0) {
  console.log(`\nFILES BELOW ${threshold}% THRESHOLD (${lowCov.length}):`)
  console.log("─".repeat(72))
  lowCov.sort((a, b) => a.pct - b.pct)
  for (const f of lowCov) {
    const rel = path.relative(cliRoot, f.path)
    console.log(`  ${f.pct.toFixed(1)}%  ${rel}`)
  }
}

// Zero-coverage files
if (zeroCov.length > 0) {
  console.log(`\nZERO-COVERAGE FILES (${zeroCov.length}):`)
  console.log("─".repeat(72))
  for (const f of zeroCov) {
    console.log(`  UNCOVERED  ${path.relative(cliRoot, f.path)}`)
  }
}

console.log("\n" + "=".repeat(72))

// Persist report
const reportPath = path.join(coverageDir, "report.txt")
const sortedLow = [...lowCov].sort((a, b) => a.pct - b.pct)
await Bun.write(
  reportPath,
  [
    `Threshold: ${threshold}%`,
    `Statements coverage: ${overallStmtPct.toFixed(1)}%`,
    "",
    "LOW COVERAGE FILES:",
    ...sortedLow.map((f) => `  ${f.pct.toFixed(1)}%  ${path.relative(cliRoot, f.path)}`),
    "",
    "ZERO COVERAGE FILES:",
    ...zeroCov.map((f) => `  UNCOVERED  ${path.relative(cliRoot, f.path)}`),
    "",
  ].join("\n"),
)
console.log(`Report persisted: ${reportPath}\n`)

// ---------------------------------------------------------------------------
// Gate verdict
// ---------------------------------------------------------------------------

if (overallStmtPct < threshold) {
  console.log(`GATE FAILED: ${overallStmtPct.toFixed(1)}% < ${threshold}% threshold`)
  console.log(`  ${lowCov.length} file(s) below threshold. Review ${reportPath}`)
  process.exit(1)
}

console.log(`GATE PASSED: ${overallStmtPct.toFixed(1)}% >= ${threshold}% threshold`)
process.exit(0)
