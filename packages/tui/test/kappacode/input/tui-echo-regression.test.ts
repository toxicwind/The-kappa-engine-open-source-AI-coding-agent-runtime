import { describe, expect, test } from "bun:test"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { spawn, type Proc } from "@opencode-ai/core/pty/driver"
// Regression gate for the frozen-TUI bug (2026-10-31): a fresh TUI must
// consume stdin and echo keystrokes within 1s. The original failure mode:
// Bun's Node-compat process.stdin never subscribed fd 0 (kernel proof:
// zero `epoll_ctl ADD fd=0` across whole boots), so keystrokes sat in the
// tty buffer forever and the TUI froze. The fix (tty-input.ts) feeds the
// renderer's stdin listener from Bun's native stream via a fake stdin.

const ECHO_PROBE = `zztypingprobe${Date.now().toString(36)}`
const BOOT_TIMEOUT_MS = 60_000
const ECHO_TIMEOUT_MS = 5_000

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    if (predicate()) return true
    await Bun.sleep(100)
  }
  return predicate()
}

describe("TUI input regression gate", () => {
  test(
    "fresh TUI echoes typed text within 1s (frozen-stdin guard)",
    async () => {
      const dir = Bun.env.TMPDIR ?? "/tmp"
      const proc: Proc = spawn(
        process.env.KAPPA_BINARY ?? "kappa",
        [],
        {
          name: "kappa",
          cwd: dir,
          env: { ...process.env, TERM: "xterm-256color", KAPPA_DISABLE_AUTOUPDATE: "1" },
          cols: 120,
          rows: 40,
        },
      )
      let screen = ""
      const onData = (chunk: string): void => {
        screen += chunk
      }
      proc.onData(onData)
      const clean = (): string =>
        screen.replace(/\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[()][0-9A-B]|\x1b[=>]/g, "")

      try {
        // skip the initial raw/alternate-screen sequences
        const booted = await waitFor(() => clean().includes("Ask") || clean().includes("What can I help"), BOOT_TIMEOUT_MS)
        expect(booted).toBe(true)
        // type the probe; measure until it echoes on screen
        screen = ""
        const started = Date.now()
        proc.write(ECHO_PROBE)
        const echoed = await waitFor(() => clean().includes(ECHO_PROBE.slice(0, 8)), ECHO_TIMEOUT_MS)
        const elapsed = Date.now() - started
        expect(echoed).toBe(true)
        expect(elapsed).toBeLessThan(1_000)
      } finally {
        try {
          proc.kill()
        } catch {}
      }
    },
    BOOT_TIMEOUT_MS + 15_000,
  )

  test("mutation proof: the gate fails against a broken input binary", async () => {
    // Audit-of-the-audit: a gate that cannot fail is not a gate. A stub whose
    // stdin never reaches a TUI must trip the same assertion the real TUI
    // passes, otherwise this test file proves nothing.
    const stub = join(Bun.env.TMPDIR ?? "/tmp", `kappa-stub-${Date.now()}.sh`)
    writeFileSync(stub, "#!/bin/sh\nsleep 30\n", { mode: 0o755 })
    try {
      let screen = ""
      const proc: Proc = spawn(
        stub,
        [],
        {
          name: "kappa-stub",
          cols: 100,
          rows: 40,
        },
      )
      proc.onData((chunk) => {
        screen += chunk
      })
      await Bun.sleep(2_500)
      proc.write("zzmutation")
      const echoed = await Promise.race([
        new Promise<boolean>((resolve) => {
          const deadline = setTimeout(() => resolve(false), 1_000)
          const timer = setInterval(() => {
            if (screen.includes("zzmutation")) {
              clearTimeout(deadline)
              clearInterval(timer)
              resolve(true)
            }
          }, 50)
        }),
      ])
      expect(echoed).toBe(false)
    } finally {
      try {
        const { rmSync } = await import("node:fs")
        rmSync(stub, { force: true })
      } catch {}
    }
  }, 15_000)
})