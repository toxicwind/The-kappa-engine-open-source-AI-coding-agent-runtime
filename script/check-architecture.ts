#!/usr/bin/env bun
// kilocode_change - new file

/**
 * Enforces domain architecture boundaries and state ratchets for Kilo packages and Kilo-owned code.
 *
 * Upstream-owned shared opencode files are exempt to prevent upstream merge conflicts.
 *
 * Rules checked:
 * 1. core-directionality: packages/core, packages/llm, and packages/schema must
 *    never import from packages/cli (@/*), @kappacode/cli, or packages/kappa-vscode.
 * 2. kappa-instance-state: No unclassified InstanceState.make singletons in Kilo-owned code
 *    (packages/cli/src/kilocode, packages/cli/src/kappa-sessions, packages/kappa-*).
 * 3. kappa-database-constructors: Direct SQLite instantiation (new Database / new DatabaseSync)
 *    in Kilo-owned code is restricted to allowed exceptions.
 * 4. kappa-tool-process-env: Direct process.env reads in Kilo tools must be classified.
 * 5. kappa-httpapi-handlers: Handlers must not call raw OS operations (node:fs, spawn).
 */

import path from "node:path"

const ROOT = path.resolve(import.meta.dir, "..")
const ALLOWLIST_PATH = path.join(ROOT, "script", "architecture-allowlist.json")
const allowlist = await Bun.file(ALLOWLIST_PATH).json()

type Violation = { file: string; rule: string; message: string }
const violations: Violation[] = []

function isKiloOwned(filePath: string): boolean {
  const norm = filePath.replaceAll("\\", "/").toLowerCase()
  return (
    norm.includes("/kilocode/") ||
    norm.includes("packages/kilocode") ||
    norm.includes("packages/kappa-") ||
    norm.startsWith("packages/kappa-") ||
    norm.includes("/kappa-sessions/")
  )
}

// ---------------------------------------------------------------------------
// Rule 1: Core / LLM / Schema Directionality Guard
// ---------------------------------------------------------------------------

const DOMAIN_SCOPES = ["packages/core/src", "packages/llm/src", "packages/schema/src"]
const FORBIDDEN_IMPORT_PATTERNS = [
  { pattern: /from\s+["']@\/.*["']/, reason: "internal opencode alias (@/*) in domain package" },
  { pattern: /from\s+["'].*packages\/opencode.*["']/, reason: "direct packages/cli import in domain package" },
  { pattern: /from\s+["']@kappacode\/cli(?:[\/].*)?["']/, reason: "@kappacode/cli package import in domain package" },
  { pattern: /from\s+["'].*packages\/kappa-vscode.*["']/, reason: "packages/kappa-vscode import in domain package" },
]

for (const scope of DOMAIN_SCOPES) {
  const scopeDir = path.join(ROOT, scope)
  const glob = new Bun.Glob("**/*.{ts,tsx}")
  for (const file of glob.scanSync({ cwd: scopeDir, onlyFiles: true })) {
    const fullPath = path.join(scopeDir, file)
    const text = await Bun.file(fullPath).text()
    for (const rule of FORBIDDEN_IMPORT_PATTERNS) {
      if (rule.pattern.test(text)) {
        violations.push({
          file: `${scope}/${file}`,
          rule: "core-directionality",
          message: `Forbidden backward dependency: ${rule.reason}. Domain packages must not depend on application layers.`,
        })
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Rule 2: Kilo InstanceState.make Ratchet (Kilo-owned code)
// ---------------------------------------------------------------------------

const srcGlob = new Bun.Glob("packages/*/src/**/*.ts")
const kiloInstanceHits = new Map<string, number>()

for (const file of srcGlob.scanSync({ cwd: ROOT, onlyFiles: true })) {
  const normPath = file.replaceAll("\\", "/")
  if (!isKiloOwned(normPath)) continue
  const text = await Bun.file(path.join(ROOT, file)).text()
  const matches = [...text.matchAll(/\bInstanceState\.make\b/g)]
  if (matches.length > 0) {
    kiloInstanceHits.set(normPath, matches.length)
  }
}

const allowedInstanceState: Record<string, { count: number; owner: string; reason: string }> =
  allowlist.rules["kappa-instance-state-singletons"]?.allowed ?? {}

// Check for unclassified additions or count mismatches
for (const [file, count] of kiloInstanceHits) {
  const expected = allowedInstanceState[file]
  if (!expected) {
    violations.push({
      file,
      rule: "kappa-instance-state",
      message: `Unclassified InstanceState.make found in Kilo-owned code (${count} site(s)). Encapsulate state in a scoped Effect Service in packages/core or add to architecture-allowlist.json.`,
    })
  } else if (expected.count !== count) {
    violations.push({
      file,
      rule: "kappa-instance-state",
      message: `Ratchet drift: expected ${expected.count} site(s), found ${count}. Update architecture-allowlist.json!`,
    })
  }
}

// Check for stale entries in allowlist
for (const file of Object.keys(allowedInstanceState)) {
  if (!kiloInstanceHits.has(file)) {
    violations.push({
      file,
      rule: "kappa-instance-state",
      message: `Stale allowlist entry: no InstanceState.make found in ${file}. Remove from architecture-allowlist.json to lock in progress!`,
    })
  }
}

// ---------------------------------------------------------------------------
// Rule 3: Kilo Database Direct Instantiation Guard (Kilo-owned code)
// ---------------------------------------------------------------------------

const allowedDb: Record<string, { count: number; owner: string; reason: string }> =
  allowlist.rules["kappa-database-constructors"]?.allowed ?? {}

const kiloDbHits = new Map<string, number>()

for (const file of srcGlob.scanSync({ cwd: ROOT, onlyFiles: true })) {
  const normPath = file.replaceAll("\\", "/")
  if (!isKiloOwned(normPath)) continue
  const text = await Bun.file(path.join(ROOT, file)).text()
  const matches = [...text.matchAll(/\bnew\s+(?:Database|DatabaseSync)\s*\(/g)]
  if (matches.length > 0) {
    kiloDbHits.set(normPath, matches.length)
  }
}

for (const [file, count] of kiloDbHits) {
  const expected = allowedDb[file]
  if (!expected) {
    violations.push({
      file,
      rule: "kappa-database-constructors",
      message: `Unclassified SQLite constructor (new Database / new DatabaseSync) in Kilo code (${count} site(s)). Route persistence through Database.Service in @opencode-ai/core.`,
    })
  } else if (expected.count !== count) {
    violations.push({
      file,
      rule: "kappa-database-constructors",
      message: `Ratchet drift for database constructor in ${file}: expected ${expected.count}, found ${count}. Update architecture-allowlist.json!`,
    })
  }
}

for (const file of Object.keys(allowedDb)) {
  if (!kiloDbHits.has(file)) {
    violations.push({
      file,
      rule: "kappa-database-constructors",
      message: `Stale database constructor allowlist entry: no direct instantiation found in ${file}. Remove from architecture-allowlist.json!`,
    })
  }
}

// ---------------------------------------------------------------------------
// Rule 4: Kilo Tool process.env Reads Guard
// ---------------------------------------------------------------------------

const allowedToolEnv: Record<string, { count: number; owner: string; reason: string }> =
  allowlist.rules["kappa-tool-process-env"]?.allowed ?? {}

const toolGlob = new Bun.Glob("packages/cli/src/tool/**/*.ts")
const toolEnvHits = new Map<string, number>()

for (const file of toolGlob.scanSync({ cwd: ROOT, onlyFiles: true })) {
  const normPath = file.replaceAll("\\", "/")
  const text = await Bun.file(path.join(ROOT, file)).text()
  const matches = [...text.matchAll(/\bprocess\.env\b/g)]
  // Check any tool in the allowlist or any Kilo-owned/modified tool
  if (matches.length > 0 && (allowedToolEnv[normPath] || isKiloOwned(normPath))) {
    toolEnvHits.set(normPath, matches.length)
  }
}

for (const [file, count] of toolEnvHits) {
  const expected = allowedToolEnv[file]
  if (!expected) {
    violations.push({
      file,
      rule: "kappa-tool-process-env",
      message: `Direct process.env read found in tool (${count} site(s)). Pass configuration via Tool.Context or Env.Service.`,
    })
  } else if (expected.count !== count) {
    violations.push({
      file,
      rule: "kappa-tool-process-env",
      message: `Ratchet drift for process.env in ${file}: expected ${expected.count}, found ${count}. Update architecture-allowlist.json!`,
    })
  }
}

for (const file of Object.keys(allowedToolEnv)) {
  if (!toolEnvHits.has(file)) {
    violations.push({
      file,
      rule: "kappa-tool-process-env",
      message: `Stale tool-process-env entry: no process.env read found in ${file}. Remove from architecture-allowlist.json!`,
    })
  }
}

// ---------------------------------------------------------------------------
// Rule 5: HttpApi Handler Boundaries (No raw OS operations in Kilo handlers)
// ---------------------------------------------------------------------------

const handlerGlob = new Bun.Glob("packages/cli/src/**/httpapi/handlers/**/*.ts")
for (const file of handlerGlob.scanSync({ cwd: ROOT, onlyFiles: true })) {
  const normPath = file.replaceAll("\\", "/")
  if (!isKiloOwned(normPath)) continue
  const text = await Bun.file(path.join(ROOT, file)).text()
  if (/\bchild_process\b|\bBun\.spawn(?:Sync)?\b|from\s+["'](?:node:)?fs(?:\/promises)?["']/.test(text)) {
    violations.push({
      file: normPath,
      rule: "kappa-httpapi-handlers",
      message: `Direct OS/process operations forbidden in HttpApi route handlers. Delegate to domain Effect services.`,
    })
  }
}

// ---------------------------------------------------------------------------
// Output & Exit
// ---------------------------------------------------------------------------

if (violations.length > 0) {
  console.error(`\n❌ Found ${violations.length} architecture boundary violation(s):\n`)
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}`)
    console.error(`    ↳ ${v.message}\n`)
  }
  console.error("Architecture rules protect domain decoupling and enable fast in-process testing.")
  console.error("To refactor an existing site, update script/architecture-allowlist.json.")
  process.exit(1)
}

const totalTracked =
  Object.keys(allowedInstanceState).length + Object.keys(allowedDb).length + Object.keys(allowedToolEnv).length

console.log(`check-architecture: ok (${totalTracked} classified Kilo ratchet sites, 0 boundary violations).`)
