/**
 * Authentication handlers — extracted from KappaProvider.
 *
 * Manages login (device auth flow), logout, organization switching,
 * and profile refresh. No vscode dependency.
 */

import type { KappaClient } from "@kappacode/sdk/v2/client"
import { getErrorMessage } from "../../kappa-provider-utils"

export interface AuthContext {
  readonly client: KappaClient | null
  postMessage(msg: unknown): void
  getWorkspaceDirectory(): string
  disposeGlobal(): Promise<void>
  invalidateProviderUsage(): void
  invalidateProviders(): void
  fetchAndSendProviders(): Promise<void>
  fetchAndSendAgents(): Promise<void>
  fetchAndSendSpeechToTextModels(): Promise<void>
}

/**
 * Handle login via the provider OAuth device-auth flow.
 * Sends device auth messages so the webview can display QR code, code, and timer.
 *
 * @param attempt - The current login attempt counter value (pre-incremented by caller).
 * @param getAttempt - Returns the latest attempt counter (may have changed if user cancelled).
 */
export async function handleLogin(ctx: AuthContext, attempt: number, getAttempt: () => number): Promise<void> {
  if (!ctx.client) return

  console.log("[Kappa New] KappaProvider: 🔐 Starting login flow...")

  try {
    const dir = ctx.getWorkspaceDirectory()

    // Step 1: Initiate OAuth authorization
    const { data: auth } = await ctx.client.provider.oauth.authorize(
      { providerID: "kappa", method: 0, directory: dir },
      { throwOnError: true },
    )
    console.log("[Kappa New] KappaProvider: 🔐 Got auth URL:", auth.url)

    // Parse code from instructions (format: "Open URL and enter code: ABCD-1234")
    const match = auth.instructions?.match(/code:\s*(\S+)/i)
    const code = match ? match[1] : undefined

    // Send device auth details to webview
    ctx.postMessage({
      type: "deviceAuthStarted",
      code,
      verificationUrl: auth.url,
      expiresIn: 900, // 15 minutes default
    })

    // Step 2: Wait for callback (blocks until polling completes)
    await ctx.client.provider.oauth.callback({ providerID: "kappa", method: 0, directory: dir }, { throwOnError: true })

    // Check if this attempt was cancelled
    if (attempt !== getAttempt()) return

    console.log("[Kappa New] KappaProvider: 🔐 Login successful")

    ctx.invalidateProviderUsage()
    ctx.invalidateProviders()
    await ctx.disposeGlobal()

    // Step 3: Fetch profile and push to webview
    const { data: profile } = await ctx.client.kappa.profile(undefined, { throwOnError: true })
    ctx.postMessage({ type: "profileData", data: profile })
    ctx.postMessage({ type: "deviceAuthComplete" })
  } catch (error) {
    if (attempt !== getAttempt()) return
    ctx.postMessage({
      type: "deviceAuthFailed",
      error: getErrorMessage(error) || "Login failed",
    })
  }
}

/** Handle logout: remove auth credentials and clear profile. */
export async function handleLogout(ctx: AuthContext): Promise<void> {
  if (!ctx.client) return

  try {
    console.log("[Kappa New] KappaProvider: 🚪 Logging out...")
    await ctx.client.auth.remove({ providerID: "kappa" }, { throwOnError: true })
    console.log("[Kappa New] KappaProvider: 🚪 Logged out successfully")
    ctx.postMessage({ type: "profileData", data: null })

    ctx.invalidateProviderUsage()
    ctx.invalidateProviders()
    await ctx.disposeGlobal()

    await ctx.fetchAndSendProviders()
  } catch (error) {
    console.error("[Kappa New] KappaProvider: ❌ Logout failed:", error)
    ctx.postMessage({
      type: "error",
      message: getErrorMessage(error) || "Failed to logout",
    })
  }
}

/**
 * Handle organization switch.
 * Persists the selection and refreshes profile + providers since both change with org context.
 */
export async function handleSetOrganization(ctx: AuthContext, organizationId: string | null): Promise<void> {
  if (!ctx.client) return

  console.log("[Kappa New] KappaProvider: Switching organization:", organizationId ?? "personal")
  try {
    await ctx.client.kappa.organization.set({ organizationId }, { throwOnError: true })
  } catch (error) {
    console.error("[Kappa New] KappaProvider: Failed to switch organization:", error)
    // Re-fetch current profile to reset webview state — best-effort
    try {
      const result = await ctx.client.kappa.profile()
      ctx.postMessage({ type: "profileData", data: result.data ?? null })
    } catch (profileError) {
      console.error("[Kappa New] KappaProvider: Failed to refresh profile after org switch error:", profileError)
    }
    return
  }

  ctx.invalidateProviderUsage()
  ctx.invalidateProviders()
  await ctx.disposeGlobal()

  // Org switch succeeded — refresh profile and providers independently (best-effort)
  try {
    const result = await ctx.client.kappa.profile()
    ctx.postMessage({ type: "profileData", data: result.data ?? null })
  } catch (error) {
    console.error("[Kappa New] KappaProvider: Failed to refresh profile after org switch:", error)
  }
  try {
    await ctx.fetchAndSendProviders()
  } catch (error) {
    console.error("[Kappa New] KappaProvider: Failed to refresh providers after org switch:", error)
  }
  try {
    await ctx.fetchAndSendAgents()
  } catch (error) {
    console.error("[Kappa New] KappaProvider: Failed to refresh agents after org switch:", error)
  }
  try {
    await ctx.fetchAndSendSpeechToTextModels()
  } catch (error) {
    console.error("[Kappa New] KappaProvider: Failed to refresh speech-to-text models after org switch:", error)
  }
}

/** Handle profile refresh request. */
export async function handleRefreshProfile(ctx: AuthContext): Promise<void> {
  if (!ctx.client) return

  console.log("[Kappa New] KappaProvider: 🔄 Refreshing profile...")
  const result = await ctx.client.kappa.profile().catch(() => ({ data: null }))
  ctx.postMessage({ type: "profileData", data: result.data ?? null })
}
