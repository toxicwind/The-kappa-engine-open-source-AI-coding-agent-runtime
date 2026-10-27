import { describe, expect, it } from "bun:test"
import { flattenSkills } from "../../src/config/plugin/skill"

describe("ConfigSkillPlugin.flattenSkills", () => {
  it("passes through a plain string[] unchanged", () => {
    expect(flattenSkills(["a/skill", "b/skill"])).toEqual(["a/skill", "b/skill"])
  })
  it("flattens a {paths, urls} struct to paths then urls", () => {
    expect(flattenSkills({ paths: ["p1", "p2"], urls: ["https://u1"] })).toEqual(["p1", "p2", "https://u1"])
  })
  it("handles a paths-only struct", () => {
    expect(flattenSkills({ paths: ["/only"] })).toEqual(["/only"])
  })
  it("handles a urls-only struct", () => {
    expect(flattenSkills({ urls: ["https://u"] })).toEqual(["https://u"])
  })
  it("filters non-strings and returns [] for garbage", () => {
    expect(flattenSkills(null)).toEqual([])
    expect(flattenSkills(42)).toEqual([])
    expect(flattenSkills(["ok", 7, "also"])).toEqual(["ok", "also"])
    expect(flattenSkills({ paths: [1, "x"], urls: null })).toEqual(["x"])
  })
})
