import type { IndexingConfig } from "@kappacode/kappa-indexing/config"

type Auth = unknown

type Env = {
  KILO_API_KEY?: string
  KILO_ORG_ID?: string
}

type Provider = {
  key?: unknown
  options?: Record<string, unknown>
}

export type KappaIndexingAuth = {
  apiKey?: string
  baseUrl?: string
  organizationId?: string
}

const providers = [
  "openai",
  "ollama",
  "openai-compatible",
  "gemini",
  "mistral",
  "vercel-ai-gateway",
  "bedrock",
  "openrouter",
  "voyage",
]

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return
  const trimmed = value.trim()
  return trimmed || undefined
}

function token(auth: Auth): string | undefined {
  const data = record(auth)
  if (data.type === "api") return text(data.key)
  if (data.type === "oauth") return text(data.access)
  return
}

function org(auth: Auth): string | undefined {
  const data = record(auth)
  if (data.type === "oauth") return text(data.accountId)
  return
}

function value(input: unknown): boolean {
  if (input === undefined || input === null) return false
  if (typeof input === "string") return input.trim().length > 0
  if (typeof input === "object") return Object.values(input).some(value)
  return true
}

function hasOtherProvider(indexing: unknown): boolean {
  const cfg = record(indexing)
  return providers.some((provider) => value(cfg[provider]))
}

export function resolveKappaIndexingAuth(input: {
  config?: unknown
  provider?: Provider
  auth?: Auth
  env?: Env
}): KappaIndexingAuth {
  const config = record(input.config)
  const options = record(record(config.provider).kappa)
  const provider = input.provider ?? record(input.provider)
  const providerOptions = record(provider.options)
  const providerConfig = record(options.options)
  const kappa = record(record(config.indexing).kappa)
  const env = input.env ?? process.env

  return {
    apiKey:
      text(kappa.apiKey) ??
      text(providerConfig.apiKey) ??
      token(input.auth) ??
      text(provider.key) ??
      text(providerOptions.kappacodeToken) ??
      text(env.KILO_API_KEY),
    baseUrl: text(kappa.baseUrl) ?? text(providerConfig.baseURL) ?? text(providerConfig.baseUrl),
    organizationId:
      text(kappa.organizationId) ??
      text(providerConfig.kappacodeOrganizationId) ??
      org(input.auth) ??
      text(providerOptions.kappacodeOrganizationId) ??
      text(env.KILO_ORG_ID),
  }
}

export function hasKappaIndexingAuth(input: Parameters<typeof resolveKappaIndexingAuth>[0]): boolean {
  return !!resolveKappaIndexingAuth(input).apiKey
}

export function shouldDefaultIndexingToKappa(indexing: unknown, auth: KappaIndexingAuth): boolean {
  const cfg = record(indexing)
  if (cfg.provider !== undefined || !auth.apiKey) return false
  return !hasOtherProvider(cfg)
}

export function indexingWithKappaDefault(
  indexing: IndexingConfig | undefined,
  auth: KappaIndexingAuth,
): IndexingConfig | undefined {
  if (!shouldDefaultIndexingToKappa(indexing, auth)) return indexing
  return { ...indexing, provider: "kappa" }
}
