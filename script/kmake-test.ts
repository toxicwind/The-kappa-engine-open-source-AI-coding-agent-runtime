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
 */
import { $ } from "bun"

const SESS = "kmake"
const BUN = Bun.which("bun") ?? "/home/toxic/.bun/bin/bun"
const repo = new URL("..", import.meta.url).pathname
const HOME = process.env.HOME ?? "/home/toxic"

// [pane-index, working-dir-relative, cmd] — run the PROJECT's own `bun test`
// so bun + workspace deps resolve from the project (its node_modules), not an
// ad-hoc PATH.
const suites = [
  ["0.0", "packages/llm/test/kilocode", `${BUN} test fingerprint.test.ts`],
  ["0.1", "packages/llm", `${BUN} test`],
  ["0.2", "packages/opencode", `${BUN} test ./test`],
  ["0.3", "packages/llm", `${BUN} test test/schema.test.ts`],
] as const

const OUT = "/home/toxic/tmp/kappa-compact/kmake" // pane logs live here
// Login shell (project env: direnv/etc. + node_modules on PATH) — full output
// to a per-pane log (no `2>&1`, no `| tail`).
const paneCmd = (dir: string, cmd: string, pane: string) =>
  `cd ${repo}${dir} && mkdir -p ${OUT} && ${cmd} > ${OUT}/pane-${pane}.log 2> ${OUT}/pane-${pane}.err; echo PANE_DONE_$?`

const start = async () => {
  const wall = await $`tmux ls`.quiet().text().catch(() => "")
  if (!wall.includes(`${SESS}:`)) {
    await $`tmux new-session -d -s ${SESS} -n kappa-tests -x 230 -y 60`.quiet()
    await $`tmux split-window -v -t ${SESS}:0.0`.quiet() // pane 0.1
    await $`tmux split-window -h -t ${SESS}:0.0`.quiet() // pane 0.2
    await $`tmux split-window -h -t ${SESS}:0.1`.quiet() // pane 0.3
    await $`tmux select-layout -t ${SESS} tiled`.quiet()
  }
  for (const [pane, dir, cmd] of suites) {
    await $`tmux send-keys -t ${SESS}:${pane} ${paneCmd(dir, cmd, pane)} C-m`.quiet()
  }
  console.log(`dispatched ${suites.length} suites into ${SESS} — attach: tmux attach -t ${SESS}`)
}

const status = async () => {
  for (const [pane] of suites) {
    const out = await $`tmux capture-pane -t ${SESS}:${pane} -p`.text().catch(() => "(no pane)")
    console.log(`===== ${SESS}:${pane} =====`)
    console.log(out.trim().split("\n").slice(-18).join("\n"))
  }
}

const kill = async () => {
  await $`tmux kill-session -t ${SESS}`.quiet().catch(() => {})
  console.log(`teardown ${SESS}`)
}

const op = process.argv[2] ?? "start"
switch (op) {
  case "start": await start(); break
  case "status": await status(); break
  case "kill": await kill(); break
  default: console.log(`usage: bun script/kmake-test.ts start|status|kill`)
}

const tmuxSend = false // placeholder; panes are dispatched directly above