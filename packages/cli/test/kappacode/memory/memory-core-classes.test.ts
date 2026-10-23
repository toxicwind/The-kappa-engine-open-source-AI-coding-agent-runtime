import { describe, expect, test } from "bun:test"
import { SessionMemory, MentalModelStore } from "@opencode-ai/core/memory"

describe("SessionMemory", () => {
  test("starts with empty recalled and retained sets", () => {
    const sm = new SessionMemory("ses_test")
    expect(sm.sessionID).toBe("ses_test")
    expect(sm.recalled.size).toBe(0)
    expect(sm.retained.size).toBe(0)
    expect(sm.lastRecallAt).toBe(0)
    expect(sm.lastRetainAt).toBe(0)
  })

  test("markRecalled adds to recalled set", () => {
    const sm = new SessionMemory("ses_test")
    sm.markRecalled("key1")
    expect(sm.recalled.has("key1")).toBe(true)
  })

  test("markRetained adds to retained set", () => {
    const sm = new SessionMemory("ses_test")
    sm.markRetained("key2")
    expect(sm.retained.has("key2")).toBe(true)
  })

  test("wasRecalled checks recalled set", () => {
    const sm = new SessionMemory("ses_test")
    sm.markRecalled("key3")
    expect(sm.wasRecalled("key3")).toBe(true)
    expect(sm.wasRecalled("key4")).toBe(false)
  })

  test("reset clears both recalled and retained sets", () => {
    const sm = new SessionMemory("ses_test")
    sm.markRecalled("r1")
    sm.markRetained("t1")
    sm.reset()
    expect(sm.recalled.size).toBe(0)
    expect(sm.retained.size).toBe(0)
  })
})

describe("MentalModelStore", () => {
  test("get returns undefined for unknown key", () => {
    const ms = new MentalModelStore()
    expect(ms.get("nonexistent")).toBeUndefined()
  })

  test("set and get round-trips value", () => {
    const ms = new MentalModelStore()
    ms.set("project", "this is the project")
    expect(ms.get("project")).toBe("this is the project")
  })

  test("set truncates value to 2000 characters", () => {
    const ms = new MentalModelStore()
    const longVal = "x".repeat(5000)
    ms.set("long", longVal)
    expect(ms.get("long")?.length).toBe(2000)
  })

  test("keys returns all stored keys", () => {
    const ms = new MentalModelStore()
    ms.set("k1", "v1")
    ms.set("k2", "v2")
    const keys = ms.keys()
    expect(keys).toContain("k1")
    expect(keys).toContain("k2")
  })

  test("clear removes all stored values", () => {
    const ms = new MentalModelStore()
    ms.set("a", "1")
    ms.set("b", "2")
    ms.clear()
    expect(ms.keys()).toEqual([])
    expect(ms.get("a")).toBeUndefined()
  })

  test("overwriting a key updates the value", () => {
    const ms = new MentalModelStore()
    ms.set("key", "first")
    ms.set("key", "second")
    expect(ms.get("key")).toBe("second")
    expect(ms.keys()).toEqual(["key"])
  })
})
