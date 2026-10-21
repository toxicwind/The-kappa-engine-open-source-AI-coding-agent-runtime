// kappacode_change - new file
// Legacy Kappa compatibility layer for plugins and the marketplace.
//
// Mirrors the tau extensibility approach (packages/coding-agent legacy-pi-config):
// a rebrand changes the manifest name, not what the plugin ecosystem imports.
// Every legacy specifier, config filename, and discovery directory that used to
// be kappa-named is remapped here once and consumed at the shared choke points
// (plugin spec parsing, config resolution, plugin auto-discovery).

export const LEGACY_KILO_CONFIG = Object.freeze({
  /** Historical npm scope every kappa-scoped package is remapped to. */
  canonicalScope: "@kappacode",
  /** Scopes that published (or aliased) kappa plugins before the rebrand. */
  scopeAliases: ["@kappacode"] as const,
  /** Config filenames accepted alongside kappa.json / kappa.jsonc. */
  configFiles: ["kappa.jsonc", "kappa.json"] as const,
  /** Extra directories scanned for auto-discovered plugin entry files. */
  discoveryDirs: [".kappa/plugin", ".kappa/plugins", ".kappa/plugins/*"] as const,
})

/**
 * Remap a legacy kappa plugin package name to its kappa equivalent.
 * - `@kappacode/<name>` → `@kappacode/<name>` with `kappa-*` segments renamed
 *   (`@kappacode/kappa-indexing` → `@kappacode/kappa-indexing`)
 * - bare `kappa-*` names keep their scope but rename the segment
 * - everything else passes through untouched
 */
export function normalizeLegacyKappaName(name: string): string {
  const scopeMatch = name.match(/^@kappacode\/(.+)$/)
  if (scopeMatch) {
    return `${LEGACY_KILO_CONFIG.canonicalScope}/${renameSegment(scopeMatch[1])}`
  }
  if (name.startsWith("kappa-")) {
    return renameSegment(name)
  }
  return name
}

function renameSegment(segment: string): string {
  if (segment.startsWith("kappa-")) return `kappa-${segment.slice("kappa-".length)}`
  if (segment === "kappa") return "kappa"
  return segment
}

/**
 * Normalize a legacy kappa plugin specifier (npm spec or `spec@version` /
 * `spec:entrypoint` compound form) to its kappa identity. Path and git specs
 * pass through untouched.
 */
export function normalizeLegacyKappaSpec(spec: string): string {
  if (!spec.includes("kappa")) return spec
  if (isPathLike(spec) || spec.startsWith("git+")) return spec

  const scopeMatch = spec.match(/^(@kappacode\/[^@:\s]+)(.*)$/)
  if (scopeMatch) {
    return `${normalizeLegacyKappaName(scopeMatch[1])}${scopeMatch[2]}`
  }

  const bare = spec.match(/^(kappa-[^@:\s]+)(.*)$/)
  if (bare) {
    return `${normalizeLegacyKappaName(bare[1])}${bare[2]}`
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
