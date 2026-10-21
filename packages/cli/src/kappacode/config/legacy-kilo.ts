// kappacode_change - new file
// Legacy Kilo compatibility layer for plugins and the marketplace.
//
// Mirrors the tau extensibility approach (packages/coding-agent legacy-pi-config):
// a rebrand changes the manifest name, not what the plugin ecosystem imports.
// Every legacy specifier, config filename, and discovery directory that used to
// be kilo-named is remapped here once and consumed at the shared choke points
// (plugin spec parsing, config resolution, plugin auto-discovery).

export const LEGACY_KILO_CONFIG = Object.freeze({
  /** Historical npm scope every kilo-scoped package is remapped to. */
  canonicalScope: "@kappacode",
  /** Scopes that published (or aliased) kappa plugins before the rebrand. */
  scopeAliases: ["@kilocode"] as const,
  /** Config filenames accepted alongside kappa.json / kappa.jsonc. */
  configFiles: ["kilo.jsonc", "kilo.json"] as const,
  /** Extra directories scanned for auto-discovered plugin entry files. */
  discoveryDirs: [".kappa/plugin", ".kappa/plugins", ".kappa/plugins/*"] as const,
})

/**
 * Remap a legacy kappa plugin package name to its kappa equivalent.
 * - `@kilocode/<name>` → `@kappacode/<name>` with `kilo-*` segments renamed
 *   (`@kilocode/kilo-indexing` → `@kappacode/kappa-indexing`)
 * - bare `kilo-*` names keep their scope but rename the segment
 * - everything else passes through untouched
 */
export function normalizeLegacyKiloName(name: string): string {
  const scopeMatch = name.match(/^@kilocode\/(.+)$/)
  if (scopeMatch) {
    return `${LEGACY_KILO_CONFIG.canonicalScope}/${renameSegment(scopeMatch[1])}`
  }
  if (name.startsWith("kilo-")) {
    return renameSegment(name)
  }
  return name
}

function renameSegment(segment: string): string {
  if (segment.startsWith("kilo-")) return `kappa-${segment.slice("kilo-".length)}`
  if (segment === "kilo") return "kappa"
  return segment
}

/**
 * Normalize a legacy kappa plugin specifier (npm spec or `spec@version` /
 * `spec:entrypoint` compound form) to its kappa identity. Path and git specs
 * pass through untouched.
 */
export function normalizeLegacyKiloSpec(spec: string): string {
  if (!spec.includes("kilo")) return spec
  if (isPathLike(spec) || spec.startsWith("git+")) return spec

  const scopeMatch = spec.match(/^(@kilocode\/[^@:\s]+)(.*)$/)
  if (scopeMatch) {
    return `${normalizeLegacyKiloName(scopeMatch[1])}${scopeMatch[2]}`
  }

  const bare = spec.match(/^(kilo-[^@:\s]+)(.*)$/)
  if (bare) {
    return `${normalizeLegacyKiloName(bare[1])}${bare[2]}`
  }

  return spec
}

function isPathLike(spec: string): boolean {
  return (
    spec.startsWith("file://") ||
    spec.startsWith(".") ||
    spec.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(spec)
  )
}

/** Glob patterns for legacy plugin auto-discovery, in addition to the canonical ones. */
export const LEGACY_DISCOVERY_GLOBS = [
  "{.kappa/plugin,.kappa/plugins}/*.{ts,js}",
] as const
