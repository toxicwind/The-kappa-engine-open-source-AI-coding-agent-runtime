// kappacode_change - new file
// Tests for the legacy Kilo plugin/marketplace compatibility layer.
// Mirrors tau's approach: a rebrand must not break legacy specifiers.
import { describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { LEGACY_KILO_CONFIG, normalizeLegacyKiloName, normalizeLegacyKiloSpec } from "../../../src/kappacode/config/legacy-kilo"
import { parsePluginSpecifier } from "../../../src/plugin/shared"
import { ConfigPlugin } from "../../../src/config/plugin"

describe("legacy kilo name normalization", () => {
  test("kilocode scope remaps to kappacode with segment rename", () => {
    expect(normalizeLegacyKiloName("@kilocode/kilo-indexing")).toBe("@kappacode/kappa-indexing")
    expect(normalizeLegacyKiloName("@kilocode/plugin-atomic-chat")).toBe("@kappacode/plugin-atomic-chat")
    expect(normalizeLegacyKiloName("@kilocode/sdk")).toBe("@kappacode/sdk")
  })

  test("bare kilo- prefix remaps", () => {
    expect(normalizeLegacyKiloName("kilo-indexing")).toBe("kappa-indexing")
  })

  test("canonical names pass through", () => {
    expect(normalizeLegacyKiloName("@kappacode/kappa-indexing")).toBe("@kappacode/kappa-indexing")
    expect(normalizeLegacyKiloName("some-plugin")).toBe("some-plugin")
  })
})

describe("legacy kilo spec normalization", () => {
  test("keeps version and entrypoint suffixes", () => {
    expect(normalizeLegacyKiloSpec("@kilocode/kilo-indexing@1.2.3")).toBe("@kappacode/kappa-indexing@1.2.3")
    expect(normalizeLegacyKiloSpec("@kilocode/plugin-atomic-chat:npm:@kappacode/plugin-atomic-chat@latest")).toBe(
      "@kappacode/plugin-atomic-chat:npm:@kappacode/plugin-atomic-chat@latest",
    )
  })

  test("path and git specs pass through untouched", () => {
    expect(normalizeLegacyKiloSpec("file:///home/x/plugin.ts")).toBe("file:///home/x/plugin.ts")
    expect(normalizeLegacyKiloSpec("./plugin.ts")).toBe("./plugin.ts")
    expect(normalizeLegacyKiloSpec("git+https://github.com/kilocode/foo")).toBe("git+https://github.com/kilocode/foo")
  })

  test("specifiers without kilo are untouched", () => {
    expect(normalizeLegacyKiloSpec("@opencode-ai/plugin")).toBe("@opencode-ai/plugin")
  })
})

describe("parsePluginSpecifier kilo compat", () => {
  test("marketplace identity resolves to kappa package name", () => {
    expect(parsePluginSpecifier("@kilocode/kilo-indexing").pkg).toBe("@kappacode/kappa-indexing")
    expect(parsePluginSpecifier("@kilocode/kilo-indexing@2.0.0").pkg).toBe("@kappacode/kappa-indexing")
  })
})

describe("legacy .kilo plugin discovery", () => {
  test("load() scans .kilo/plugin and .kilo/plugins directories", async () => {
    const dir = mkdtempSync(join(tmpdir(), "legacy-kilo-test-"))
    mkdirSync(join(dir, ".kilo", "plugin"), { recursive: true })
    mkdirSync(join(dir, ".kilo", "plugins"), { recursive: true })
    writeFileSync(join(dir, ".kilo", "plugin", "a.ts"), "export default {}")
    writeFileSync(join(dir, ".kilo", "plugins", "b.ts"), "export default {}")

    const found = await ConfigPlugin.load(dir)
    expect(found.map((spec) => (Array.isArray(spec) ? spec[0] : spec)).some((spec) => spec.endsWith("/.kilo/plugin/a.ts"))).toBe(true)
    expect(found.map((spec) => (Array.isArray(spec) ? spec[0] : spec)).some((spec) => spec.endsWith("/.kilo/plugins/b.ts"))).toBe(true)
  })

  test("canonical discovery dirs still work", async () => {
    const dir = mkdtempSync(join(tmpdir(), "canonical-kilo-test-"))
    mkdirSync(join(dir, "plugin"), { recursive: true })
    writeFileSync(join(dir, "plugin", "a.ts"), "export default {}")

    const found = await ConfigPlugin.load(dir)
    expect(found.map((spec) => (Array.isArray(spec) ? spec[0] : spec)).some((spec) => spec.endsWith("/plugin/a.ts"))).toBe(true)
  })
})

describe("legacy config constants", () => {
  test("frozen layout matches tau pattern", () => {
    expect(Object.isFrozen(LEGACY_KILO_CONFIG)).toBe(true)
    expect(LEGACY_KILO_CONFIG.scopeAliases).toEqual(["@kilocode"])
    expect(LEGACY_KILO_CONFIG.canonicalScope).toBe("@kappacode")
  })
})
