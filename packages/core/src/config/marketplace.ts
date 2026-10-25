// kappacode_change - new file (schema moved from packages/cli/src/config/marketplace.ts
// so the core Config schema can recognize the `marketplace` key; normalization
// (Kappa-native vs legacy Kilo specs) stays in the CLI package where
// normalizeLegacyKiloSpec lives.)
import { Schema } from "effect"

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
