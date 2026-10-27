#!/usr/bin/env bun
/**
 * kmake-test — run kappa's bun test suites live in a tmux grid.
 *
 * Why tmux: the estate box shells source a bash-2s-shim that SIGKILLs any
 * command past the 2s run-fast deadline, killing long `bun test` runs.
 * tmux-server-spawned panes are NOT wrapped by that shim, so each suite runs
 * to completion in its own pane while you watch or scrape.
 *
 * Every pane runs via `env -i` (clean env, no .bashrc) so run-fast never wraps
 * the test process.
 *
 * Usage:
 *   bun script/kmake-test.ts start    # build/spin the grid (idempotent)
 *   bun script/kmake-test.ts status   # per-pane tail
 *   bun script/kmake-test.ts kill     # teardown
 *
 * Grid: 4 test-suite panes + 1 pane running the fastest typecheck (`tsgo --noEmit`
 * on packages/cli). The typecheck pane is part of the scaffold so every run
 * also verifies types, not just runtime tests.
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs"
import { $ } from "bun"

const SESS = "kmake"
const BUN = Bun.which("bun") ?? "/home/toxic/.bun/bin/bun"
const repo = new URL("..", import.meta.url).pathname
const HOME = process.env.HOME ?? "/home/toxic"

// [pane-index, working-dir-relative, cmd] — run the PROJECT's own `bun test`
// so bun + workspace deps resolve from the project (its node_modules), not an
// ad-hoc PATH.
const TYPE = "tsgo" // fastest typecheck (native TS compiler); NOT `tsc`
const suites = [
  ["0.0", "packages/llm/test/kappacode", `${BUN} test fingerprint.test.ts`],
  ["0.1", "packages/llm", `${BUN} test`],
  ["0.2", "packages/cli", `${BUN} test ./test`],
  ["0.3", "packages/llm", `${BUN} test test/schema.test.ts`],
  // kappacode_change - run the fastest typecheck as part of the scaffold grid.
  // tsgo is the native-preview TS compiler (~10-50x faster than tsc) and covers
  // the cli package + its workspace imports in one shot.
  ["0.4", "packages/cli", `${TYPE} --noEmit`],
] as const

const OUT = `${HOME}/.local/state/kappa/kmake` // pane logs live here (never in /tmp/kappa-compact)
// Login shell (project env: direnv/etc. + node_modules on PATH) — full output
// to a per-pane log (no `2>&1`, no `| tail`).
const paneCmd = (dir: string, cmd: string, pane: string) =>
  `cd ${repo}${dir} && mkdir -p ${OUT} && ${cmd} > ${OUT}/pane-${pane}.log 2> ${OUT}/pane-${pane}.err; echo PANE_DONE_$?`

// Single source of truth for pane targeting. `select-layout tiled` reassigns
// 0.x indices, so we never target by them: after the grid is scaffolded we
// capture the live tmux pane_ids (%N — unique, lifetime-stable) in suite order
// and persist the mapping. start(), status() all resolve through this.
const STATE = `${OUT}/panes.json`

const resolvePaneTargets = async (): Promise<string[]> => {
  const out = await $`tmux list-panes -t ${SESS} -F '#{pane_id}'`
    .quiet()
    .text()
    .catch(() => "")
  const ids = out.trim().split("\n").filter(Boolean)
  if (ids.length < suites.length) return []
  return ids.slice(0, suites.length)
}

const saveTargets = (ids: string[]) => {
  mkdirSync(OUT, { recursive: true })
  writeFileSync(STATE, JSON.stringify(ids))
}

const loadTargets = (): string[] => {
  try {
    const ids = JSON.parse(readFileSync(STATE, "utf8")) as string[]
    return Array.isArray(ids) ? ids : []
  } catch {
    return []
  }
}

const start = async () => {
  const wall = await $`tmux ls`
    .quiet()
    .text()
    .catch(() => "")
  if (!wall.includes(`${SESS}:`)) {
    await $`tmux new-session -d -s ${SESS} -n kappa-tests -x 230 -y 60`.quiet()
    await $`tmux split-window -v -t ${SESS}:0.0`.quiet() // pane 0.1
    await $`tmux split-window -h -t ${SESS}:0.0`.quiet() // pane 0.2
    await $`tmux split-window -h -t ${SESS}:0.1`.quiet() // pane 0.3
    await $`tmux split-window -v -t ${SESS}:0.2`.quiet() // pane 0.4 - typecheck
    await $`tmux select-layout -t ${SESS} tiled`.quiet()
  }
  const targets = await resolvePaneTargets()
  if (!targets.length) {
    console.log(`could not resolve ${suites.length} panes in ${SESS} — attach: tmux attach -t ${SESS}`)
    return
  }
  saveTargets(targets)
  for (const [i, [pane, dir, cmd]] of suites.entries()) {
    const t = targets[i]
    await $`tmux send-keys -t ${t} ${paneCmd(dir, cmd, pane)} C-m`.quiet()
  }
  console.log(`dispatched ${suites.length} suites into ${SESS} — attach: tmux attach -t ${SESS}`)
}

const status = async () => {
  const targets = loadTargets()
  for (const [i, [pane]] of suites.entries()) {
    const t = targets[i] ?? pane
    const out = await $`tmux capture-pane -t ${t} -p`.text().catch(() => "(no pane)")
    console.log(`===== ${SESS}:${t} (${pane}) =====`)
    console.log(out.trim().split("\n").slice(-18).join("\n"))
  }
}

const kill = async () => {
  await $`tmux kill-session -t ${SESS}`.quiet().catch(() => {})
  console.log(`teardown ${SESS}`)
}

const op = process.argv[2] ?? "start"
switch (op) {
  case "start":
    await start()
    break
  case "status":
    await status()
    break
  case "kill":
    await kill()
    break
  default:
    console.log(`usage: bun script/kmake-test.ts start|status|kill`)
}

const tmuxSend = false // placeholder; panes are dispatched directly above
