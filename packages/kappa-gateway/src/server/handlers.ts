import { fetchBalance, fetchProfile } from "../api/profile.js"
import { fetchKappaPassState } from "../api/kappa-pass.js"
import { fetchKappacodeNotifications } from "../api/notifications.js"
import { clearModesCache } from "../api/modes.js"
import { KAPPA_API_BASE } from "../api/constants.js"
import type { KappacodeBalance, KappacodeProfile, KappaPassState } from "../types.js"
import { buildKappaHeaders } from "../headers.js"

export type KappaAuth =
  | { type: "api"; key: string }
  | { type: "oauth"; access: string; refresh: string; expires: number; accountId?: string }
  | { type: "wellknown"; key: string; token: string }

export interface KappaProfileResult {
  profile: KappacodeProfile
  balance: KappacodeBalance | null
  kappaPass: KappaPassState | null
  currentOrgId: string | null
}

export interface AuthStore {
  get(provider: string): Promise<KappaAuth | undefined>
  set(provider: string, auth: Extract<KappaAuth, { type: "oauth" }>): Promise<void>
}

export interface OrganizationDeps {
  auth: AuthStore
  clear(): void | Promise<void>
  dispose(): Promise<void>
}

export interface CloudSessionsInput {
  cursor?: string
  limit?: number
  gitUrl?: string
}

export class UnauthorizedError extends Error {}

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export function getToken(auth: KappaAuth | undefined) {
  if (auth?.type === "api") return auth.key
  if (auth?.type === "oauth") return auth.access
  return undefined
}

export function getOrganizationId(auth: KappaAuth | undefined) {
  if (auth?.type === "oauth") return auth.accountId
  return undefined
}

export async function getProfile(auth: AuthStore): Promise<KappaProfileResult> {
  const info = await auth.get("kappa")
  if (!info || info.type !== "oauth") throw new UnauthorizedError("Not authenticated with Kappa Gateway")

  const currentOrgId = info.accountId ?? null
  const [profile, balance, kappaPass] = await Promise.all([
    fetchProfile(info.access),
    fetchBalance(info.access, currentOrgId ?? undefined),
    fetchKappaPassState(info.access),
  ])
  return { profile, balance, kappaPass, currentOrgId }
}

export async function getNotifications(auth: AuthStore) {
  const info = await auth.get("kappa")
  const token = getToken(info)
  if (!token) return []

  return fetchKappacodeNotifications({
    kappacodeToken: token,
    kappacodeOrganizationId: getOrganizationId(info),
  })
}

export async function setOrganization(deps: OrganizationDeps, organizationId: string | null) {
  const info = await deps.auth.get("kappa")
  if (!info || info.type !== "oauth") throw new UnauthorizedError("Not authenticated with Kappa Gateway")

  await deps.auth.set("kappa", {
    type: "oauth",
    refresh: info.refresh,
    access: info.access,
    expires: info.expires,
    ...(organizationId && { accountId: organizationId }),
  })

  await deps.clear()
  clearModesCache()
  await deps.dispose()
  return true
}

export async function getCloudSessions(token: string, input: CloudSessionsInput) {
  const query: Record<string, unknown> = {}
  if (input.cursor) query.cursor = input.cursor
  if (input.limit) query.limit = input.limit
  if (input.gitUrl) query.gitUrl = input.gitUrl

  const params = new URLSearchParams({
    batch: "1",
    input: JSON.stringify({ "0": query }),
  })

  const response = await fetch(`${KAPPA_API_BASE}/api/trpc/cliSessionsV2.list?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...buildKappaHeaders(),
    },
  })

  if (!response.ok) {
    const text = await response.text()
    console.error("[Kappa Gateway] cloud-sessions: tRPC request failed", {
      status: response.status,
      body: text.slice(0, 500),
    })
    throw new GatewayError(`Cloud sessions fetch failed: ${response.status}`, response.status)
  }

  const raw = await response.text()
  const json = JSON.parse(raw)
  const data = Array.isArray(json) ? json[0]?.result?.data : null
  const result = data?.json ?? data
  if (!result) return { cliSessions: [], nextCursor: null }

  const cliSessions = (result.cliSessions ?? []).map((item: any) => ({
    session_id: item.session_id,
    title: item.title ?? null,
    created_at:
      typeof item.created_at === "string"
        ? item.created_at
        : item.created_at
          ? new Date(item.created_at).toISOString()
          : new Date().toISOString(),
    updated_at:
      typeof item.updated_at === "string"
        ? item.updated_at
        : item.updated_at
          ? new Date(item.updated_at).toISOString()
          : new Date().toISOString(),
    version: item.version ?? 0,
  }))

  return { cliSessions, nextCursor: result.nextCursor ?? null }
}
