/**
 * Legacy Kappa CLI migration module
 *
 * Migrates authentication from the legacy Kappa Code VS Code extension CLI
 * config path (~/.kappacode/cli/config.json) to the new auth.json format.
 */
import fs from "fs/promises"
import os from "os"
import path from "path"

export const LEGACY_CONFIG_PATH = path.join(os.homedir(), ".kappacode", "cli", "config.json")

interface LegacyProvider {
  id: string
  provider: string
  kappacodeToken?: string
  kappacodeModel?: string
  kappacodeOrganizationId?: string
}

interface LegacyConfig {
  providers?: LegacyProvider[]
}

interface LegacyKappaAuth {
  token: string
  organizationId?: string
}

// Auth info types matching opencode's Auth module
type ApiAuth = { type: "api"; key: string }
type OAuthAuth = { type: "oauth"; access: string; refresh: string; expires: number; accountId?: string }
type AuthInfo = ApiAuth | OAuthAuth

/**
 * Extract kappa auth from legacy config
 */
function extractKappaAuth(config: LegacyConfig): LegacyKappaAuth | undefined {
  if (!config.providers) return undefined

  const provider = config.providers.find((p) => p.provider === "kappacode")
  if (!provider?.kappacodeToken) return undefined

  return {
    token: provider.kappacodeToken,
    organizationId: provider.kappacodeOrganizationId,
  }
}

/**
 * Migrate Kappa authentication from legacy CLI config path.
 *
 * Checks ~/.kappacode/cli/config.json for existing kappa credentials
 * and migrates them to the new auth.json format.
 *
 * @param hasKappaAuth - Callback to check if kappa auth already exists
 * @param saveKappaAuth - Callback to save the migrated auth
 * @returns true if migration was performed, false otherwise
 */
export async function migrateLegacyKappaAuth(
  hasKappaAuth: () => Promise<boolean>,
  saveKappaAuth: (auth: AuthInfo) => Promise<void>,
): Promise<boolean> {
  // Skip if kappa auth already configured
  if (await hasKappaAuth()) return false

  // Check if legacy config exists and parse it
  const content = await fs.readFile(LEGACY_CONFIG_PATH, "utf-8").catch(() => null)
  if (!content) return false

  let config: LegacyConfig | null = null
  try {
    config = JSON.parse(content) as LegacyConfig
  } catch {
    return false
  }

  // Extract kappa auth from legacy config
  const legacy = extractKappaAuth(config)
  if (!legacy) return false

  // Migrate to new format
  // Use OAuth format if organization ID present, otherwise API format
  if (legacy.organizationId) {
    await saveKappaAuth({
      type: "oauth",
      access: legacy.token,
      refresh: "",
      expires: 0,
      accountId: legacy.organizationId,
    })
  } else {
    await saveKappaAuth({
      type: "api",
      key: legacy.token,
    })
  }

  return true
}
