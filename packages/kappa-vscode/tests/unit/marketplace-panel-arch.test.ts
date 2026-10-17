import { describe, expect, it } from "bun:test"
import fs from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dir, "../..")
const kappa = fs.readFileSync(path.join(root, "src/KiloProvider.ts"), "utf-8")
const panel = fs.readFileSync(path.join(root, "src/MarketplacePanelProvider.ts"), "utf-8")
const remove = fs.readFileSync(path.join(root, "src/kappa-provider/remove-config-item.ts"), "utf-8")

describe("standalone Marketplace architecture", () => {
  it("keeps Marketplace webview cases out of KiloProvider", () => {
    for (const type of [
      "fetchMarketplaceData",
      "installMarketplaceItem",
      "removeInstalledMarketplaceItem",
      "dismissAgentMigrationBanner",
    ]) {
      expect(kappa).not.toContain(`case \"${type}\"`)
      expect(panel).toContain(`case \"${type}\"`)
    }
  })

  it("uses a dedicated Marketplace webview bundle", () => {
    expect(panel).toContain('"dist", "marketplace.js"')
    expect(panel).not.toContain('"dist", "webview.js"')
  })

  it("keeps sidebar removal behind a narrow adapter", () => {
    expect(kappa).toContain("removeMcp(this.removeConfigItemCtx, name)")
    expect(remove).toContain("removeMarketplaceItemFromAllScopes")
    expect(kappa).not.toContain("marketplaceRemove")
    expect(kappa).not.toContain("createMarketplaceRemover")
    expect(remove).not.toContain("MarketplaceInstaller")
    expect(remove).not.toContain("MarketplacePaths")
    expect(remove).not.toContain("new MarketplaceService()")
    expect(remove).not.toContain("AgentMarketplaceItem")
    expect(remove).not.toContain("McpMarketplaceItem")
  })

  it("broadcasts MCP removals from Marketplace to every Kilo provider", () => {
    expect(panel).toContain("mcpRemoval(this.connection)")
    expect(panel).toContain('phase: "installed"')
    expect(panel).toContain('event.phase === "removed" || event.phase === "installed"')
    expect(kappa).toContain("mcpRemoval(this.connectionService).on")
    expect(kappa).toContain('type: "mcpRemoved"')
    expect(kappa).toContain('type: "mcpRemovalState"')
  })

  it("invalidates Agent Behaviour tabs after cross-provider config changes", () => {
    expect(kappa).toContain('type: "agentBehaviourInvalidated"')
    expect(kappa).toContain('event.type === "server.instance.disposed"')
    expect(kappa).toContain('event.type === "global.config.updated"')
  })
})
