import { describe, expect, test } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { hasIndexingPlugin, isIndexingPlugin, normalizePluginName } from "../../../src/detect"

describe("indexing plugin detection", () => {
  test("bundles detect module for browser targets", async () => {
    const dir = await mkdtemp(`${tmpdir()}/kappa-indexing-detect-`)
    const result = await Bun.build({
      entrypoints: [fileURLToPath(new URL("../../../src/detect.ts", import.meta.url))],
      minify: true,
      outdir: dir,
      target: "browser",
    })

    expect(result.success).toBe(true)
  })

  test("normalizes supported plugin forms", () => {
    expect(normalizePluginName("kappa-indexing")).toBe("kappa-indexing")
    expect(normalizePluginName("kappa-indexing@1.2.3")).toBe("kappa-indexing")
    expect(normalizePluginName("@kappacode/kappa-indexing")).toBe("@kappacode/kappa-indexing")
    expect(normalizePluginName("@kappacode/kappa-indexing@1.2.3")).toBe("@kappacode/kappa-indexing")
    expect(normalizePluginName("../../packages/kappa-indexing")).toBe("@kappacode/kappa-indexing")
    expect(normalizePluginName("file:///tmp/.opencode/plugin/kappa-indexing.js")).toBe("kappa-indexing")
    expect(normalizePluginName("file:///tmp/node_modules/@kappacode/kappa-indexing/index.js")).toBe(
      "@kappacode/kappa-indexing",
    )
    expect(normalizePluginName("file:///tmp/repo/packages/kappa-indexing/src/index.ts")).toBe("@kappacode/kappa-indexing")
  })

  test("detects supported indexing plugin specifiers", () => {
    const values = [
      "kappa-indexing",
      "kappa-indexing@1.2.3",
      "@kappacode/kappa-indexing",
      "@kappacode/kappa-indexing@1.2.3",
      "../../packages/kappa-indexing",
      "file:///tmp/.opencode/plugin/kappa-indexing.js",
      "file:///tmp/node_modules/@kappacode/kappa-indexing/index.js",
      "file:///tmp/repo/packages/kappa-indexing/src/index.ts",
    ]

    for (const value of values) {
      expect(isIndexingPlugin(value)).toBe(true)
    }
  })

  test("ignores unrelated plugin specifiers", () => {
    expect(isIndexingPlugin("@kappacode/kappa-gateway")).toBe(false)
    expect(isIndexingPlugin("file:///tmp/.opencode/plugin/index.js")).toBe(false)
    expect(hasIndexingPlugin(["@kappacode/kappa-gateway", "foo@1.0.0"])).toBe(false)
  })

  test("detects indexing plugin in merged plugin lists", () => {
    expect(
      hasIndexingPlugin(["@kappacode/kappa-gateway", "file:///tmp/node_modules/@kappacode/kappa-indexing/index.js"]),
    ).toBe(true)
  })
})
