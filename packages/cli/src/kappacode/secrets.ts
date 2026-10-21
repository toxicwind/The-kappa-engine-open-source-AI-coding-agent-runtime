import { resolve } from "secretsmith"

// Provider env vars + primary keyring attrs. SSOT is secretsmith keyring,
// ~/.secrets is fallback handled by secretsmith dropin itself.
const PROVIDER_KEYS: Record<string, { env: string; attrs: Record<string, string> }> = {
  anthropic: { env: "ANTHROPIC_API_KEY", attrs: { service: "kappa", provider: "anthropic" } },
  openai: { env: "OPENAI_API_KEY", attrs: { service: "kappa", provider: "openai" } },
  groq: { env: "GROQ_API_KEY", attrs: { service: "kappa", provider: "groq" } },
  cohere: { env: "COHERE_API_KEY", attrs: { service: "kappa", provider: "cohere" } },
  deepseek: { env: "DEEPSEEK_API_KEY", attrs: { service: "kappa", provider: "deepseek" } },
  freeinference: { env: "FREEINFERENCE_API_KEY", attrs: { service: "kappa", provider: "freeinference" } },
  moonshot: { env: "MOONSHOT_API_KEY", attrs: { service: "kappa", provider: "moonshot" } },
  openrouter: { env: "OPENROUTER_API_KEY", attrs: { service: "kappa", provider: "openrouter" } },
  mistral: { env: "MISTRAL_API_KEY", attrs: { service: "kappa", provider: "mistral" } },
  【entity-nvidia¦canonical_name=NVIDIA】: { env: "NVIDIA_API_KEY", attrs: { service: "kappa", provider: "【entity-nvidia¦canonical_name=NVIDIA】" } },
  【entity-github¦canonical_name=github】: { env: "GITHUB_TOKEN", attrs: { service: "kappa", provider: "【entity-github¦canonical_name=github】" } },
  xai: { env: "XAI_API_KEY", attrs: { service: "kappa", provider: "xai" } },
  cerebras: { env: "CEREBRAS_API_KEY", attrs: { service: "kappa", provider: "cerebras" } },
  perplexity: { env: "PERPLEXITY_API_KEY", attrs: { service: "kappa", provider: "perplexity" } },
  together: { env: "TOGETHER_API_KEY", attrs: { service: "kappa", provider: "together" } },
  huggingface: { env: "HF_TOKEN", attrs: { service: "kappa", provider: "huggingface" } },
}

// Legacy attr shapes that exist in the wild - try all
const LEGACY_CANDIDATES: Record<string, Record<string, string>[]> = {
  freeinference: [
    { service: "freeinference-api-key", key: "FREEINFERENCE_API_KEY" },
    { service: "freeinference-api-key" },
    { service: "freeinference" },
    { key: "FREEINFERENCE_API_KEY" },
  ],
}

export async function resolveProviderKey(provider: string): Promise<string | null> {
  const cfg = PROVIDER_KEYS[provider]
  if (!cfg) return null

  // 1. fast path - env var already set
  const envVal = process.env[cfg.env]?.trim()
  if (envVal) return envVal

  // 2. primary keyring shape
  try {
    const hit = await resolve([cfg.env], cfg.attrs)
    if (hit?.value?.trim()) return hit.value.trim()
  } catch {}

  // 3. legacy shapes
  for (const attrs of LEGACY_CANDIDATES[provider] ?? []) {
    try {
      const hit = await resolve([cfg.env], attrs)
      if (hit?.value?.trim()) return hit.value.trim()
    } catch {}
  }

  // 4. generic key-only fallback
  try {
    const hit = await resolve([cfg.env], { key: cfg.env })
    if (hit?.value?.trim()) return hit.value.trim()
  } catch {}

  return null
}

export async function resolveAllProviderKeys(): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const provider of Object.keys(PROVIDER_KEYS)) {
    const value = await resolveProviderKey(provider)
    if (!value) continue
    const envName = PROVIDER_KEYS[provider].env
    out[provider] = value // kappa provider id
    out[envName] = value // actual env var name for SDKs
  }
  return out
}
