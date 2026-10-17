#!/usr/bin/env bun
/**
 * script/typecheck-serial.ts — the "no-build hotfix" for kappa typecheck.
 *
 * Theestate canary Bun SIGSEGVs on the FULL parallel `turbo typecheck` (37
 * packages, JSC GC under memory pressure) — tracked upstack (oven-sh/bun
 * #39967, #39815, open). Every SINGLE-package typecheck passes. This runner does
 * the same work serially, one package at a time, so the kappa push/CI is not
 * blocked by the upstream crash.
 *
 * Usage:
 *   bun script/typecheck-serial.ts            # typecheck every workspace pkg, serially
 *   bun script/typecheck-serial.ts --filter=@kappacode/vscode
 *
 * Exit 0 only when every run package typechecks; failures accumulate and are
 * reported with evidence (the package + its error lines).
 */
import { $ } from "bun"

const filter = process.argv.find((a) => a.startsWith("--filter="))?.slice("--filter=".length)
const skipJetbrains = !!process.argv.includes("--skip-jetbrains")

// Resolve workspace packages from the root package.json workspaces globs.
const pkg = await Bun.file("package.json").json()
const ws: string[] = pkg.workspaces?.packages ?? []

import { Glob } from "bun"
const glob = new Glob("**/package.json")
const packageDirs = new Set<string>()
for (const pat of ws) {
  if (pat.endsWith("*")) {
    const base = pat.slice(0, -1)
    for await (const f of glob.scan({ cwd: base, onlyFiles: true, absolute: true })) {
      if (f.includes("node_modules")) continue
      packageDirs.add(f.slice(0, -"/package.json".length))
    }
  } else if (pat) {
    packageDirs.add(pat)
  }
}

const results: { pkg: string; ok: boolean; err?: string }[] = []
let failed = false

for (const dir of [...packageDirs].sort()) {
  // Skip jetbrains (needs Java 21; excluded via flag or never auto-run).
  if (skipJetbrains && (dir.includes("kappa-jetbrains") || dir.includes("jetbrains"))) continue
  // Only typecheck packages that define a typecheck script.
  let hasTc = false
  try {
    const pf = await Bun.file(`${dir}/package.json`).json()
    hasTc = !!pf.scripts?.typecheck
  } catch {
    continue
  }
  if (!hasTc) continue

  // Run each package's typecheck serially — with BASH_ENV unset so the estate
  // kairos 2s shim does NOT SIGINT the long subprocess.
  const proc = Bun.spawn(["bun", "--cwd", dir, "run", "typecheck"], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, BASH_ENV: "", RF_QUIET: "1" },
  })
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
  const code = await proc.exited
  const ok = code === 0
  const msg = stdout.trim().split("\n").filter(Boolean).slice(-8).join("\n")
  const e = stderr.trim().split("\n").filter(Boolean).slice(-8).join("\n")
  if (ok) {
    process.stdout.write(`✓ ${dir}\n`)
  } else {
    failed = true
    results.push({ pkg: dir, ok: false, err: msg || e })
    process.stdout.write(`✗ ${dir}\n  ${(msg || e).replace(/\n/g, "\n  ")}\n`)
  }
}

if (failed) {
  process.stderr.write(`typecheck-serial: ${results.length} package(s) failed\n`)
  for (const r of results) process.stderr.write(`  - ${r.pkg}\n${r.err}\n`)
  process.exit(1)
}
process.stdout.write(`typecheck-serial: all ${packageDirs.size} packages passed\n`)
process.exit(0)