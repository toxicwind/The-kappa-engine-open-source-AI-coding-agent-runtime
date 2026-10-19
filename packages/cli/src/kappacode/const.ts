import { InstallationVersion } from "@opencode-ai/core/installation/version"

export const DEFAULT_HEADERS = {
  "HTTP-Referer": "https://kappacode.ai",
  "X-Title": "Kappa Code",
  "User-Agent": `Kappa-Code/${InstallationVersion}`,
}
