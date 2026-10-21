#!/usr/bin/env bun
// script/kmake.ts — unified kappa build/dev/test route CLI.
//
// Consolidates the old jumble (make, make:nativelink, kmake-test, kappamake-test,
// kappa-run-fast) into one command with clear, non-overlapping subcommands. Each
// route leads with the fastest valid strategy (hft-latency: race, don't queue;
// keep the fast path hot).
//
//   kmake dev               run kappa from source (TUI) in current dir
//   kmake build             build the single binary via nativelink (mbx-cache)
//   kmake typecheck         typecheck changed packages only (git-diff); --all = full gate
//   kmake test [pkg|path]   bun test; specific path is instant, or cli|core|llm
//   kmake grid [action]     tmux parallel test grid  (start|status|kill)
//   kmake run <task>        run a task under the 2s run-fast deadline
//   kmake lint              oxlint

import { $ } from "bun"
import { existsSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dir, "..")
const bun = Bun.which("bun") ?? "/home/toxic/.bun/bin/bun"

const help =
  "kmake -- unified kappa build/dev/test route CLI\n\n" +
  "usage: kmake <command> [args]\n\n" +
  "  dev              run kappa from source (TUI) in current dir\n" +
  "  build            build the single binary via nativelink (mbx-cache)\n" +
  "  typecheck        typecheck changed packages only (git-diff); --all = full gate\n" +
  "  test [pkg|path]  bun test (specific path is instant; cli|core|llm = suite)\n" +
  "  grid [action]    tmux parallel test grid  (start|status|kill)\n" +
  "  run <task>       run a task under the 2s run-fast deadline\n" +
  "  lint             oxlint"

// Clean env: the estate shell rc (BASH_ENV) can pollute module resolution and
// cause spurious tsgo failures. Unset BASH_ENV to match CI.
async function spawnClean(args: string[], env: Record<string, string> = {}): Promise<number> {
  const child = await Bun.spawn(args, {
    env: { ...process.env, BASH_ENV: "", ...env },
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  })
  return await child.exited
}

async function changedPackages(): Promise<string[]> {
  const out = await $`git -C ${root} diff --name-only HEAD`.quiet().text()
  const seen = new Set<string>()
  for (const m of out.matchAll(/packages\/([a-z0-9-]+)/g)) {
    const pkg = m[1] ?? ""
    if (existsSync(resolve(root, "packages", pkg, "package.json"))) seen.add(pkg)
  }
  return [...seen]
}

async function typecheck(argv: string[]): Promise<number> {
  const all = argv.includes("--all") || argv.includes("--all=true")
  if (all) {
    return await spawnClean([bun, "run", "--cwd", root, "script/typecheck-serial.ts", "--skip-jetbrains"])
  }
  const pkgs = await changedPackages()
  if (pkgs.length === 0) {
    console.log("kmake typecheck: no changed packages (upstream diff clean); nothing to typecheck")
    return 0
  }
  let rc = 0
  for (const pkg of pkgs) {
    const dir = resolve(root, "packages", pkg)
    process.stdout.write(`typecheck ${pkg.padEnd(28)} `)
    const ok = (await spawnClean([bun, "run", "--cwd", dir, "typecheck"])) === 0
    println(ok ? "OK" : "FAIL")
    if (!ok) rc = 1
  }
  if (rc === 0) console.log("kmake typecheck: all changed packages passed (clean env)")
  return rc
}

function println(s: string): void {
  process.stdout.write(`${s}\n`)
}

async function test(arg0?: string, rest: string[] = []): Promise<number> {
  if (arg0) {
    if (arg0 === "cli") return await spawnClean([bun, "test", "--cwd", resolve(root, "packages/cli"), "./test"])
    if (arg0 === "core") return await spawnClean([bun, "test", "--cwd", resolve(root, "packages/core")])
    if (arg0 === "llm") return await spawnClean([bun, "test", "--cwd", resolve(root, "packages/llm")])
    const m = arg0.match(/^packages\/([a-z0-9-]+)(?:[\/](.*))?$/)
    if (m) {
      const pkg = m.at(1) ?? ""
      const dir = resolve(root, "packages", pkg)
      const file = m.at(2)
      const target = file ? `./${file}` : "./test"
      return await spawnClean([bun, "test", "--cwd", dir, target, ...rest])
    }
    const target = /^(\/|\.\/)/.test(arg0) ? arg0 : `./${arg0}`
    return await spawnClean([bun, "test", "--cwd", resolve(root, "packages/cli"), target, ...rest])
  }
  // No arg: full run -> parallel tmux grid (races each suite in its own pane).
  return await spawnClean([bun, "run", script("script/kmake-test.ts"), "start"])
}

function script(file: string): string {
  return resolve(root, file)
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const cmd = argv.at(0) ?? "help"
  const args = argv.slice(1)
  switch (cmd) {
    case "dev":
      return await spawnClean(["bash", script("bin/kappadev"), ...args])
    case "build":
      return await spawnClean([bun, "run", "--cwd", root, "make:nativelink"])
    case "typecheck":
      return await typecheck(args)
    case "test":
      return await test(args.at(0), args.slice(1))
    case "grid":
      return await spawnClean([bun, "run", script("script/kmake-test.ts"), args.at(0) ?? "start"])
    case "run":
      if (args.length === 0) {
        console.error("usage: kmake run <task> [args...]")
        return 2
      }
      return await spawnClean([bun, "run", script("script/run-fast.ts"), ...args])
    case "lint":
      return await spawnClean([bun, "run", "--cwd", root, "lint"])
    case "help":
    case "--help":
    case "-h":
      println(help)
      return 0
    default:
      console.error(`unknown kmake command: ${cmd}`)
      console.error("try: kmake dev|build|typecheck|test|grid|run|lint")
      return 2
  }
}

process.exitCode = await main()