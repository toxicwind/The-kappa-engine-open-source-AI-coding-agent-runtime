// kappacode_change - new file
// Kappa extension marketplace, as a first-class config primitive.
//
// Contract: Kappa loads BOTH Kappa-native extensions AND legacy Kilo-format
// plugins through one marketplace key. A marketplace entry that points at a
// Kilo plugin spec (ConfigPluginV1 string/npm/git specifier) is resolved
// through the existing normalizeLegacyKiloSpec path so the Kilo ecosystem keeps
// working unchanged; an entry that is already a Kappa-native spec (has `type`
// + `entry`) is loaded as-is. This is the "kappa extensions AND kilo plugins,
// marketplace primary, backward compat preserved" contract.
import { Schema } from "effect"
import { normalizeLegacyKiloSpec } from "@/kappacode/config/legacy-kilo"

// kappacode_change - schema lives in core (Config.Info recognizes the
// `marketplace` key); the CLI re-exports it and keeps only normalization here.
export { KappaExtensionType, KappaExtension, MarketplaceEntrySchema as MarketplaceEntry, MarketplaceConfigSchema, type MarketplaceConfig } from "@opencode-ai/core/config/marketplace" // kappacode_change

/** The kinds of extension Kappa understands natively. Mirrors the marketplace. */
export const KappaExtensionType = Schema.Literals(["tool", "model", "hook", "agent", "integ"])
export type KappaExtensionType = typeof KappaExtensionType.Type

/**
 * A Kappa-native extension. `entry` is the load target (a path/URL/package
 * spec). Kappa-native specs carry `type` + `entry` and are loaded as-is.
 */
export const KappaExtension = Schema.Struct({
  id: Schema.String,
  version: Schema.optional(Schema.String),
  type: KappaExtensionType,
  entry: Schema.String,
  /** Optional manifest/options payload carried through to the loader. */
  manifest: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
})
export type KappaExtension = typeof KappaExtension.Type

/**
 * A single marketplace source declared in the `marketplace` config key.
 * `url` is the source catalog; `ref` optionally pins a tag/branch/sha;
 * `manifest` optionally embeds an inline spec (Kappa-native or Kilo plugin).
 */
export const MarketplaceEntrySchema = Schema.Struct({
  name: Schema.String,
  url: Schema.String,
  ref: Schema.optional(Schema.String),
  manifest: Schema.optional(Schema.Unknown),
})
export type MarketplaceEntry = typeof MarketplaceEntrySchema.Type

/** The `marketplace: [...]` config key (also accepts `marketplaces:` alias). */
export const MarketplaceConfigSchema = Schema.Array(MarketplaceEntrySchema)
export type MarketplaceConfig = typeof MarketplaceConfigSchema.Type

/** Parse a KappaExtension or fail, returning the original on non-Kappa shapes. */
export function parseKappaExtension(value: unknown): KappaExtension | undefined {
  try {
    return Schema.decodeUnknownSync(KappaExtension)(value)
  } catch {
    return undefined
  }
}

/**
 * Normalize a marketplace entry's manifest into either a Kappa-native
 * KappaExtension or a legacy Kilo plugin specifier.
 *
 * - If the manifest is already a Kappa-native spec (has type + entry),
 *   it is returned unchanged.
 * - If the manifest is a Kilo-format plugin specifier (string or
 *   ConfigPluginV1.Spec), it is passed through normalizeLegacyKiloSpec so the
 *   pre-existing Kilo plugin load path keeps working.
 * - If there is no manifest, the raw url (plus optional ref) is treated as a
 *   load target the caller resolves.
 */
export function normalizeMarketplaceManifest(
  entry: MarketplaceEntry,
): { kind: "kappa"; extension: KappaExtension } | { kind: "kilo"; spec: string } | { kind: "none" } {
  const manifest = entry.manifest
  if (manifest == null) return { kind: "none" }

  // Kappa-native ext spec (object with type + entry).
  if (typeof manifest === "object" && !Array.isArray(manifest)) {
    const extension = parseKappaExtension(manifest)
    if (extension) return { kind: "kappa", extension }
  }

  // Legacy Kilo plugin specifier (bare string or `[spec, opts]` array).
  const spec = Array.isArray(manifest) ? manifest[0] : typeof manifest === "string" ? manifest : undefined
  if (typeof spec === "string") {
    return { kind: "kilo", spec: normalizeLegacyKiloSpec(spec) }
  }

  return { kind: "none" }
}

/** True if this marketplace entry is a Kappa-native extension source. */
export function isKappaNativeEntry(entry: MarketplaceEntry): boolean {
  return normalizeMarketplaceManifest(entry).kind === "kappa"
}
