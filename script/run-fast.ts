#!/usr/bin/env bun
// bin/run-fast.ts — runs a task from kappa's bun install with a 2s hard deadline.
// Usage: bin/run-fast <task-name> [task-args...]
// Falls through to bun run <task-name> if no deadline breach.

import { $ } from "bun"

const args = Bun.argv.slice(2)
if (args.length === 0) {
  console.error("usage: bun run script/run-fast.ts <task-name> [args...]")
  process.exit(1)
}

const taskName = args[0]
const taskArgs = args.slice(1)
const deadlineS = 2.0

const start = Date.now()
const proc = Bun.spawn(
  ["bun", "run", taskName, ...taskArgs],
  { stdio: ["inherit", "inherit", "inherit"] },
)

const exitCode = await proc.exited

const elapsed = ((Date.now() - start) / 1000).toFixed(2)
if (Number(elapsed) > deadlineS) {
  console.error(`\n⚠ run-fast: ${taskName} exceeded ${deadlineS}s (${elapsed}s) — consider background_process or backgrounding`)
}

process.exitCode = exitCode
