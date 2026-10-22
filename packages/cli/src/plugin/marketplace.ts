// kappacode_change - new file
// Marketplace registry + config-key CRUD for the Kappa extension marketplace.
//
// The marketplace is a discoverable catalog of extension sources. Two stores:
//   1. the `marketplace: [...]` key in global kappa.jsonc (the configured set),
//   2. a local registry file ~/.config/kappa/marketplace.json (the known set,
//      seeded with a baked-in starter list mirroring Tau's baked-in extensions).
// The command layer reads/writes both: `marketplace-add` writes a source to the
// config key and appends it to the registry; `marketplace-remove` deletes from
// both; `marketplace-list` prints configured + known sources.
import path from "path"
import { Global } from "@opencode-ai/core/global"
import { Filesystem } from "@/util/filesystem"
import type { MarketplaceEntry, MarketplaceEntrySchema } from "@/config/marketplace"

export const MARKETPLACE_REGISTRY_FILENAME = "marketplace.json"

/** Baked-in starter set, mirroring Tau's approach (Tau ships airspeak/nvidia-nim/nemotron). */
export const STARTER_MARKETPLACES: MarketplaceEntry[] = [
  {
    name: "kappa-ext",
    url: "https://github.com/toxicwind/kappa-extensions",
    ref: "main",
  },
  {
    name: "opencode",
    url: "https://github.com/anomalyco/opencode-extensions",
    ref: "main",
  },
]

function registryPath(): string {
  return path.join(Global.Path.config, MARKETPLACE_REGISTRY_FILENAME)
}

/** Returns the path to the global config file (kappa.jsonc preferred). */
export function configPath(): string {
  return path.join(Global.Path.config, "kappa.jsonc")
}

export type MarketplaceRegistry = MarketplaceEntry[]

/**
 * Read the local registry (~/.config/kappa/marketplace.json). If the file does
 * not exist yet, returns the baked-in starter set without writing anything.
 */
export async function readRegistry(): Promise<MarketplaceRegistry> {
  if (!(await Filesystem.exists(registryPath()))) return STARTER_MARKETPLACES
  try {
    const raw = await Filesystem.readJson<MarketplaceRegistry>(registryPath())
    return Array.isArray(raw) ? raw : STARTER_MARKETPLACES
  } catch {
    return STARTER_MARKETPLACES
  }
}

/** Persist the registry to disk, creating the config dir if needed. */
export async function writeRegistry(entries: MarketplaceRegistry): Promise<void> {
  await Filesystem.write(registryPath(), JSON.stringify(entries, null, 2))
}

/**
 * Read the `marketplace` (or `marketplaces`) key from the global kappa.jsonc.
 * Returns [] when the key is absent or the file is missing/unreadable.
 */
export async function readConfigMarketplaces(): Promise<MarketplaceRegistry> {
  const file = configPath()
  if (!(await Filesystem.exists(file))) return []
  try {
    const raw = (await Filesystem.readJson<Record<string, unknown>>(file)) ?? {}
    const list = Array.isArray(raw.marketplace)
      ? raw.marketplace
      : Array.isArray(raw.marketplaces)
        ? raw.marketplaces
        : []
    return list.filter((item: unknown): item is MarketplaceEntry => isEntry(item))
  } catch {
    return []
  }
}

/** Validate a bare object looks like a MarketplaceEntry (name + url strings). */
function isEntry(value: unknown): value is MarketplaceEntry {
  if (!value || typeof value !== "object") return false
  const entry = value as Record<string, unknown>
  return typeof entry.name === "string" && typeof entry.url === "string"
}

/** Exact-match helper: entries are identified by normalized name. */
export function entryKey(entry: MarketplaceEntry): string {
  return entry.name.trim().toLowerCase()
}

/** True if a marketplace source with the same name is present. */
export function hasEntry(entries: MarketplaceRegistry, name: string): boolean {
  const key = name.trim().toLowerCase()
  return entries.some((entry) => entryKey(entry) === key)
}

export type MarketplaceMutation = { ok: true; added: MarketplaceEntry } | { ok: false; error: string }

/** Add a source to BOTH the config key and the registry. Idempotent by name. */
export async function addMarketplace(entry: MarketplaceEntry): Promise<MarketplaceMutation> {
  if (hasEntry(await readConfigMarketplaces(), entry.name)) {
    return { ok: false, error: `marketplace "${entry.name}" is already configured` }
  }

  const configs = await readConfigMarketplaces()
  configs.push(entry)
  await writeConfigMarketplaces(configs)

  const registry = await readRegistry()
  if (!hasEntry(registry, entry.name)) {
    registry.push(entry)
    await writeRegistry(registry)
  }

  return { ok: true, added: entry }
}

/** Remove a source from BOTH the config key and the registry by name. */
export async function removeMarketplace(
  name: string,
): Promise<{ ok: boolean; removed?: MarketplaceEntry; error?: string }> {
  const key = name.trim().toLowerCase()
  const configs = await readConfigMarketplaces()
  const index = configs.findIndex((item) => entryKey(item) === key)
  if (index < 0) {
    return { ok: false, error: `marketplace "${name}" is not configured` }
  }
  const removed = configs[index]
  configs.splice(index, 1)
  await writeConfigMarketplaces(configs)

  const registry = await readRegistry()
  const registryWithout = registry.filter((item) => entryKey(item) !== key)
  if (registryWithout.length !== registry.length) await writeRegistry(registryWithout)

  return { ok: true, removed }
}

/**
 * Write the `marketplace` key into the global kappa.jsonc. Preserves existing
 * undefined keys and leaves non-marketplace content untouched.
 */
export async function writeConfigMarketplaces(entries: MarketplaceRegistry): Promise<void> {
  const file = configPath()
  let data: Record<string, unknown> = {}
  if (await Filesystem.exists(file)) {
    try {
      data = (await Filesystem.readJson<Record<string, unknown>>(file)) ?? {}
    } catch {
      // Fall through with an empty object; the write below recreates the file.
    }
  }
  data.marketplace = entries
  await Filesystem.write(file, JSON.stringify(data, null, 2))
}
