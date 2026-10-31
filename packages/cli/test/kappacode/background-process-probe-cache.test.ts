import { describe, expect, test } from "bun:test"
import { BackgroundProcess } from "../../src/kappacode/background-process/index.ts"

const { parseStatStarttime, ProcessOwnershipCache, backgroundProcessEmitKey } = BackgroundProcess
type ProcessProbeIo = BackgroundProcess.ProcessProbeIo

// Sample /proc/<pid>/stat shapes: comm may contain spaces/parens; field 22
// (1-indexed, 3rd field after the trailing ")" of comm) is starttime.
// Real /proc/<pid>/stat: minflt(10) cminflt(11) majflt(12) cmajflt(13)
// utime(14) stime(15) cutime(16) cstime(17) priority(18) nice(19)
// num_threads(20) itrealvalue(21) starttime(22) — 8 fields between minflt and nice.
const STAT_FLAT = "12345 (kappa) S 1 12345 12345 0 -1 4194560 652 0 0 0 0 0 0 0 0 1 0 0 987654 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0"
const STAT_PAREN_COMM = `987 (node server (v2)) S 1 987 987 0 -1 4194560 652 0 0 0 0 0 0 0 0 1 0 0 54321 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0`

describe("parseStatStarttime", () => {
  test("extracts field 22 from a flat comm stat", () => {
    expect(parseStatStarttime(STAT_FLAT)).toBe("987654")
  })

  test("extracts field 22 when comm contains spaces and parens", () => {
    // comm "(node server (v2))" — trailing ")" ends comm; starttime = "54321"
    const fields = STAT_PAREN_COMM.slice(STAT_PAREN_COMM.lastIndexOf(")") + 2).split(" ")
    // position 19 in post-comm fields == field 22 overall
    expect(fields[19]).toBe("54321")
    expect(parseStatStarttime(STAT_PAREN_COMM)).toBe("54321")
  })

  test("returns undefined for malformed stat", () => {
    expect(parseStatStarttime("broken")).toBeUndefined()
  })
})

describe("ProcessOwnershipCache", () => {
  test("miss on unknown pid", () => {
    const c = new ProcessOwnershipCache()
    expect(c.lookup(12345, STAT_FLAT)).toBeUndefined()
  })

  test("hit returns cached owned while starttime unchanged", () => {
    const c = new ProcessOwnershipCache()
    c.set(12345, STAT_FLAT, true)
    expect(c.lookup(12345, STAT_FLAT)).toBe(true)
  })

  test("pid reuse (different starttime) forces re-verification", () => {
    const c = new ProcessOwnershipCache()
    c.set(12345, STAT_FLAT, true)
    const reused = STAT_FLAT.replace("987654", "111111")
    expect(c.lookup(12345, reused)).toBeUndefined()
  })

  test("delete clears the entry", () => {
    const c = new ProcessOwnershipCache()
    c.set(12345, STAT_FLAT, true)
    c.delete(12345)
    expect(c.lookup(12345, STAT_FLAT)).toBeUndefined()
  })
})

describe("backgroundProcessEmitKey", () => {
  const base = {
    id: "bg-1",
    status: "running",
    pid: 4242,
    ready: false,
    exitCode: undefined,
    output: "",
  } as const

  test("same observable state produces the same key", () => {
    expect(backgroundProcessEmitKey(base as never)).toBe(backgroundProcessEmitKey({ ...base } as never))
  })

  test("status change produces a different key", () => {
    const changed = { ...base, status: "exited", exitCode: 1 }
    expect(backgroundProcessEmitKey(changed as never)).not.toBe(backgroundProcessEmitKey(base as never))
  })

  test("output growth produces a different key (length-sensitive)", () => {
    const grown = { ...base, output: "hello world" }
    expect(backgroundProcessEmitKey(grown as never)).not.toBe(backgroundProcessEmitKey(base as never))
  })

  test("unobservable mutations produce the same key", () => {
    const same = { ...base, output: "", readyChanged: true }
    expect(backgroundProcessEmitKey(same as never)).toBe(backgroundProcessEmitKey(base as never))
  })
})

describe("probeLinux hot-path amortization", () => {
  const LEADER_STAT = `99999 (leader) S 1 99999 99999 0 -1 4194560 652 0 0 0 0 0 0 0 0 1 0 0 424242 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0`

  test("10 ticks read /proc/<pid>/environ exactly once", async () => {
    const TOKEN = "tok-contract-123"
    let environReads = 0
    const io: ProcessProbeIo = {
      readStat: async () => LEADER_STAT,
      readEnviron: async () => {
        environReads++
        return `KAPPA_BACKGROUND_PROCESS_TOKEN=${TOKEN}\0OTHER=1`
      },
      readdir: async () => ["1", "99999"],
    }
    const cache = new ProcessOwnershipCache()
    for (let i = 0; i < 10; i++) {
      const result = await BackgroundProcess.probeLinux(99999, TOKEN, cache, io)
      expect(result).toBe("owned")
    }
    expect(environReads).toBe(1)
  })

  test("pid reuse forces exactly one re-read of environ", async () => {
    const TOKEN = "tok-reuse-456"
    let environReads = 0
    let statCalls = 0
    const io: ProcessProbeIo = {
      readStat: async (file) => {
        // Stat is re-read every tick; the STARTTIME flips on tick 6 to
        // simulate the OS reusing pid 99999 for a new process.
        void file
        statCalls++
        return statCalls <= 5 ? LEADER_STAT : LEADER_STAT.replace("424242", "777777")
      },
      readEnviron: async () => {
        environReads++
        return `KAPPA_BACKGROUND_PROCESS_TOKEN=${TOKEN}\0`
      },
      readdir: async () => ["1", "99999"],
    }
    const cache = new ProcessOwnershipCache()
    // Tick 1: environ read (cache miss). Ticks 2-5: cache hits (0 reads).
    // Tick 6: starttime flip -> re-verification (1 read). Ticks 7-10: hits.
    for (let i = 0; i < 10; i++) {
      const result = await BackgroundProcess.probeLinux(99999, TOKEN, cache, io)
      expect(result).toBe("owned")
    }
    expect(environReads).toBe(2)
  })
})