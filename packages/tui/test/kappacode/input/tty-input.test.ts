import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { createFakeStdin, startFdPump, attachTtyInput } from "../../../src/kappacode/input/tty-input"

// Deterministic fd-based contract tests. Uses FIFOs: a self-held O_RDWR fifo
// gives tty-like blocking reads (read blocks until bytes arrive, never EOFs)
// and is testable anywhere without a real pty.

let fifoDir: string
let fifoPath: string
let handle: { fd: number; close: () => void }

function makeFifoPair(): { readFd: number; writeFd: number; close: () => void } {
  const p = path.join(fifoDir, `pair-${Math.random().toString(36).slice(2)}.fifo`)
  spawnSync("mkfifo", [p])
  // O_RDWR: self-held both ends — read blocks until written, never EOF.
  const fd = fs.openSync(p, "r+")
  return {
    readFd: fd,
    writeFd: fd,
    close: () => {
      try {
        fs.closeSync(fd)
      } catch {}
      try {
        fs.unlinkSync(p)
      } catch {}
    },
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

beforeAll(() => {
  fifoDir = fs.mkdtempSync(path.join(os.tmpdir(), "tty-input-test-"))
  fifoPath = path.join(fifoDir, "main.fifo")
  spawnSync("mkfifo", [fifoPath])
  handle = { fd: fs.openSync(fifoPath, "r+"), close: () => {} }
})

afterAll(() => {
  try {
    fs.closeSync(handle.fd)
  } catch {}
  try {
    fs.rmSync(fifoDir, { recursive: true, force: true })
  } catch {}
})

// ---------- startFdPump ----------
describe("startFdPump", () => {
  test("delivers bytes written to the fd", async () => {
    const pair = makeFifoPair()
    const chunks: Buffer[] = []
    const pump = startFdPump(pair.readFd, (c) => chunks.push(c))
    try {
      fs.writeSync(pair.writeFd, Buffer.from("PING"))
      await sleep(150)
      expect(Buffer.concat(chunks).toString()).toBe("PING")
    } finally {
      pump.stop()
      pair.close()
    }
  })

  test("preserves multi-chunk ordering", async () => {
    const pair = makeFifoPair()
    const chunks: Buffer[] = []
    const pump = startFdPump(pair.readFd, (c) => chunks.push(c))
    try {
      fs.writeSync(pair.writeFd, Buffer.from("abc"))
      await sleep(30)
      fs.writeSync(pair.writeFd, Buffer.from("def"))
      await sleep(30)
      fs.writeSync(pair.writeFd, Buffer.from("ghi"))
      await sleep(200)
      expect(Buffer.concat(chunks).toString()).toBe("abcdefghi")
    } finally {
      pump.stop()
      pair.close()
    }
  })

  test("binary-safe: arbitrary byte values survive", async () => {
    const pair = makeFifoPair()
    const chunks: Buffer[] = []
    const pump = startFdPump(pair.readFd, (c) => chunks.push(c))
    try {
      const bytes = Buffer.from([0x00, 0x1b, 0x7f, 0x80, 0xff, 0x0a])
      fs.writeSync(pair.writeFd, bytes)
      await sleep(150)
      expect(Buffer.concat(chunks)).toEqual(bytes)
    } finally {
      pump.stop()
      pair.close()
    }
  })

  test("stop() halts delivery", async () => {
    const pair = makeFifoPair()
    const chunks: Buffer[] = []
    const pump = startFdPump(pair.readFd, (c) => chunks.push(c))
    try {
      fs.writeSync(pair.writeFd, Buffer.from("one"))
      await sleep(120)
      const count = chunks.length
      expect(count).toBeGreaterThan(0)
      pump.stop()
      fs.writeSync(pair.writeFd, Buffer.from("two"))
      await sleep(150)
      expect(chunks.length).toBe(count)
    } finally {
      pump.stop()
      pair.close()
    }
  })

  test("survives empty reads without spinning the event loop", async () => {
    const pair = makeFifoPair()
    let chunks = 0
    const pump = startFdPump(pair.readFd, () => chunks++)
    try {
      await sleep(120)
      fs.writeSync(pair.writeFd, Buffer.from("x"))
      await sleep(120)
      expect(chunks).toBe(1)
    } finally {
      pump.stop()
      pair.close()
    }
  })
})

// ---------- createFakeStdin ----------
describe("createFakeStdin", () => {
  test("shapes like a Node ReadStream the renderer accepts", () => {
    const fake = createFakeStdin()
    expect(fake.isTTY).toBe(true)
    expect(typeof fake.on).toBe("function")
    expect(typeof fake.removeListener).toBe("function")
    expect(typeof fake.once).toBe("function")
    expect(typeof fake.pause).toBe("function")
    expect(typeof fake.resume).toBe("function")
    expect(fake.read()).toBeNull()
  })

  test("setRawMode toggles without throwing", () => {
    const fake = createFakeStdin()
    expect(() => fake.setRawMode(true)).not.toThrow()
    expect(() => fake.setRawMode(false)).not.toThrow()
  })

  test("never emits data (pump owns the bytes)", async () => {
    const fake = createFakeStdin()
    const seen: string[] = []
    fake.on("data", (c: Buffer | string) => seen.push(String(c)))
    fake.resume()
    await sleep(80)
    expect(seen).toEqual([])
  })

  test("destroy is safe", () => {
    const fake = createFakeStdin()
    expect(() => fake.destroy()).not.toThrow()
    expect(() => fake.setRawMode(true)).not.toThrow()
    expect(() => fake.setRawMode(false)).not.toThrow()
  })
})

// ---------- attachTtyInput ----------
describe("attachTtyInput", () => {
  test("forwards fd bytes to the renderer sink", async () => {
    const pair = makeFifoPair()
    const received: (Buffer | string)[] = []
    const sink = { stdinListener: (c: Buffer | string) => received.push(c) }
    const pump = attachTtyInput(sink, pair.readFd)
    try {
      fs.writeSync(pair.writeFd, Buffer.from("\x1b[Ahello"))
      await sleep(150)
      expect(Buffer.concat(received.map((c) => (typeof c === "string" ? Buffer.from(c) : c))).toString()).toBe(
        "\x1b[Ahello",
      )
    } finally {
      pump.stop()
      pair.close()
    }
  })

  test("listener exceptions are contained, not fatal", async () => {
    const pair = makeFifoPair()
    const sink = {
      stdinListener: () => {
        throw new Error("boom")
      },
    }
    const pump = attachTtyInput(sink, pair.readFd)
    try {
      fs.writeSync(pair.writeFd, Buffer.from("x"))
      await sleep(150)
      // pump still alive after the throw: next bytes still get read
      let rest = 0
      const pump2 = startFdPump(pair.readFd, () => rest++)
      await sleep(80)
      pump2.stop()
      fs.writeSync(pair.writeFd, Buffer.from("y"))
      await sleep(120)
    } finally {
      pump.stop()
      pair.close()
    }
  })
})