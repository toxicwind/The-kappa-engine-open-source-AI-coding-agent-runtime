import { describe, expect, test } from "bun:test"
import path from "path"
import { LSP } from "@/lsp/lsp"
import { tmpdir } from "../fixture/fixture.ts"

describe("LSP.Diagnostic.report", () => {
  test("report() returns empty string when no errors", () => {
    const result = LSP.Diagnostic.report("/foo/bar.ts", [
      { severity: 2, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, message: "warning" },
      { severity: 3, range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } }, message: "info" },
    ] as any)
    expect(result).toBe("")
  })

  test("report() formats errors with file path", () => {
    const result = LSP.Diagnostic.report("/foo/bar.ts", [
      {
        severity: 1,
        range: { start: { line: 5, character: 3 }, end: { line: 5, character: 10 } },
        message: "Cannot find module",
      },
    ] as any)
    expect(result).toContain('<diagnostics file="/foo/bar.ts">')
    expect(result).toContain("ERROR [6:4] Cannot find module")
    expect(result).toContain("</diagnostics>")
  })

  test("report() truncates at MAX_PER_FILE and shows count", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "many.ts")
    await Bun.write(file, "export const x = 1\n")

    const errors: any[] = []
    for (let i = 0; i < 25; i++) {
      errors.push({
        severity: 1,
        range: { start: { line: i, character: 0 }, end: { line: i, character: 5 } },
        message: `error ${i}`,
      })
    }

    const result = LSP.Diagnostic.report(file, errors)
    const lines = result.split("\n")
    // First line is <diagnostics ...>
    // Last 4 lines should be errors + "... and X more" + </diagnostics>
    expect(lines.length).toBeGreaterThan(0)
    const hasTruncation = result.includes("... and 5 more")
    expect(hasTruncation).toBe(true)
  })

  test("report() includes file in tags", () => {
    const result = LSP.Diagnostic.report("/test/app.ts", [
      {
        severity: 1,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
        message: "test error",
      },
    ] as any)
    expect(result).toContain('file="/test/app.ts"')
  })

  test("report() with mixed severities only includes errors", () => {
    const result = LSP.Diagnostic.report("/mixed.ts", [
      { severity: 1, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } }, message: "error" },
      { severity: 2, range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } }, message: "warning" },
      { severity: 3, range: { start: { line: 2, character: 0 }, end: { line: 2, character: 5 } }, message: "info" },
      { severity: 4, range: { start: { line: 3, character: 0 }, end: { line: 3, character: 5 } }, message: "hint" },
    ] as any)
    expect(result).toContain("ERROR [1:1] error")
    expect(result).not.toContain("warning")
    expect(result).not.toContain("info")
    expect(result).not.toContain("hint")
  })
})
