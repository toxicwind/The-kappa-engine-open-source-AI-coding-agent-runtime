import { resolve } from "secretsmith"

// Provider environment variables and the keyring attributes used to look them
// up when the variable is not set in the environment. The keyring lookup uses
// the freedesktop Secret Service via the estate secretsmith dropin.
const PROVIDER_KEYS: Record<string, { env: string; attrs: Record<string, string> }> = {
  anthropic: { env: "ANTHROPIC_API_KEY", attrs: { service: "kappa", provider: "anthropic" } },
  openai: { env: "OPENAI_API_KEY", attrs: { service: "kappa", provider: "openai" } },
  groq: { env: "GROQ_API_KEY", attrs: { service: "kappa", provider: "groq" } },
  cohere: { env: "COHERE_API_KEY", attrs: { service: "kappa", provider: "cohere" } },
  deepseek: { env: "DEEPSEEK_API_KEY", attrs: { service: "kappa", provider: "deepseek" } },
  moonshot: { env: "MOONSHOT_API_KEY", attrs: { service: "kappa", provider: "moonshot" } },
  openrouter: { env: "OPENROUTER_API_KEY", attrs: { service: "kappa", provider: "openrouter" } },
  mistral: { env: "MISTRAL_API_KEY", attrs: { service: "kappa", provider: "mistral" } },
  nvidia: { env: "NVIDIA_API_KEY", attrs: { service: "kappa", provider: "nvidia" } },
  github: { env: "GITHUB_TOKEN", attrs: { service: "kappa", provider: "github" } },
  xai: { env: "XAI_API_KEY", attrs: { service: "kappa", provider: "xai" } },
  cerebras: { env: "CEREBRAS_API_KEY", attrs: { service: "kappa", provider: "cerebras" } },
  perplexity: { env: "PERPLEXITY_API_KEY", attrs: { service: "kappa", provider: "perplexity" } },
  together: { env: "TOGETHER_API_KEY", attrs: { service: "kappa", provider: "together" } },
  huggingface: { env: "HF_TOKEN", attrs: { service: "kappa", provider: "huggingface" } },
}

// Resolve a provider API key: environment variable first (fast path), then the
// freedesktop Secret Service keyring via the estate secretsmith dropin, then
// the legacy vault (~/.secrets / ~/.bashrc.env). Returns null when unavailable.
export async function resolveProviderKey(provider: string): Promise<string | null> {
  const cfg = PROVIDER_KEYS[provider]
  if (!cfg) return null
  const env = process.env[cfg.env]?.trim()
  if (env) return env
  const hit = await resolve([cfg.env], cfg.attrs)
  if (hit.value) return hit.value
  return null
}

export async function resolveAllProviderKeys(): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const provider of Object.keys(PROVIDER_KEYS)) {
    const value = await resolveProviderKey(provider)
    if (value) out[provider] = value
  }
  return out
}
