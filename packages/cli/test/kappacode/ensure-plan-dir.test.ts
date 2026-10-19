import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { KappaSessionPrompt } from "../../src/kappacode/session/prompt.ts"
import { tmpdir } from "../fixture/fixture.ts"

describe("KappaSessionPrompt.ensurePlanDir", () => {
  test("creates a missing plan directory", async () => {
    await using tmp = await tmpdir({})
    const dir = path.join(tmp.path, ".kappa", "plans")
    await KappaSessionPrompt.ensurePlanDir(dir)
    const stat = await fs.stat(dir)
    expect(stat.isDirectory()).toBe(true)
  })

  test("is idempotent when the directory already exists", async () => {
    await using tmp = await tmpdir({})
    const dir = path.join(tmp.path, ".kappa", "plans")
    await fs.mkdir(dir, { recursive: true })
    await expect(KappaSessionPrompt.ensurePlanDir(dir)).resolves.toBeUndefined()
    const stat = await fs.stat(dir)
    expect(stat.isDirectory()).toBe(true)
  })

  test("creates intermediate parent directories", async () => {
    await using tmp = await tmpdir({})
    const dir = path.join(tmp.path, "deep", "nested", ".kappa", "plans")
    await KappaSessionPrompt.ensurePlanDir(dir)
    const stat = await fs.stat(dir)
    expect(stat.isDirectory()).toBe(true)
  })
})
