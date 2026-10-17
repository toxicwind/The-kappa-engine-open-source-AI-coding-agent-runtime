import { describe, expect, test } from "bun:test"
import path from "path"
import { KappaOauthCallbackPage } from "@opencode-ai/core/kappacode/oauth/page"

const root = path.join(__dirname, "..", "..")

describe("Kappa OAuth branding", () => {
  test("Codex OAuth browser flow uses Kappa branding", async () => {
    const src = await Bun.file(path.join(root, "src", "plugin", "openai", "codex.ts")).text()

    expect(src).toContain('originator: "kappa"')
    expect(src).toContain('"User-Agent": `kappa/${InstallationVersion}`')
    expect(src).toContain("return to Kappa")
    expect(src).not.toContain('originator: "opencode"')
    expect(src).not.toContain("return to OpenCode")
  })

  test("core OAuth browser flow uses Kappa branding", async () => {
    const src = await Bun.file(path.join(root, "..", "core", "src", "plugin", "provider", "openai.ts")).text()
    const pages = [
      KappaOauthCallbackPage.success({ provider: "ChatGPT" }),
      KappaOauthCallbackPage.error("Denied", { provider: "ChatGPT" }),
    ]

    expect(src).toContain('originator: "kappa"')
    expect(src).toContain('"User-Agent": `kappa/${InstallationVersion}`')
    expect(src).toContain("KappaOauthCallbackPage")
    expect(src).not.toContain('originator: "opencode"')
    for (const page of pages) {
      expect(page).toContain("· Kappa</title>")
      expect(page).toContain('aria-label="Kappa Code"')
      expect(page).toContain('viewBox="0 0 100 100"')
      expect(page).not.toContain("OpenCode")
      expect(page).not.toContain('viewBox="0 0 234 42"')
    }
  })

  test("MCP OAuth callback page uses Kappa branding", async () => {
    const src = await Bun.file(path.join(root, "src", "mcp", "oauth-callback.ts")).text()

    expect(src).toContain("return to Kappa")
    expect(src).not.toContain("return to OpenCode")
  })
})
