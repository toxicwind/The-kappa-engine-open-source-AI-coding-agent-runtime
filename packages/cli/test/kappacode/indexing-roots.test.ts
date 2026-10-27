import { describe, expect, test } from "bun:test"
import { homedir } from "node:os"
import { allowed } from "@opencode-ai/core/kappacode/fff"
import { KappaIndexing } from "@/kappacode/indexing"
import { toIndexingConfigInput } from "@kappacode/kappa-indexing/config"

const HOME = homedir().trim()

describe("kappa indexing multi-root (indexing.roots)", () => {
  test("allowed() accepts a pens-style absolute root (guarded multi-root can index it)", () => {
    expect(allowed("/home/toxic/pens", HOME)).toBe(true)
    expect(allowed(`${HOME}/pens`, HOME)).toBe(true)
  })

  test("allowed() rejects the home dir and filesystem root (disallowed roots are skipped)", () => {
    // Pass home explicitly so the guard is hermetic regardless of KAPPA_TEST_HOME.
    expect(allowed(HOME, HOME)).toBe(false)
    expect(allowed("/", HOME)).toBe(false)
  })

  test("toIndexingConfigInput carries roots through to the engine input", () => {
    const input = toIndexingConfigInput({
      enabled: true,
      roots: [`${HOME}/pens`, `${HOME}/estate`],
    })
    expect(input.roots).toEqual([`${HOME}/pens`, `${HOME}/estate`])
  })

  test("KappaIndexing.input keeps enabled + roots on the merged cfg input", () => {
    const out = KappaIndexing.input({ enabled: true, roots: [`${HOME}/pens`] }, { enabled: true })
    expect(out.roots).toEqual([`${HOME}/pens`])
    expect(out.enabled).toBe(true)
  })
})
