import type { DesktopTheme } from "@opencode-ai/ui/theme/types"
import { DEFAULT_THEMES as UPSTREAM_THEMES } from "@opencode-ai/ui/theme/default-themes"
import kappaJson from "./themes/kappa.json"
import kappaVscodeJson from "./themes/kappa-vscode.json"

// Re-export all upstream theme constants
export {
  oc2Theme,
  tokyonightTheme,
  draculaTheme,
  monokaiTheme,
  solarizedTheme,
  nordTheme,
  catppuccinTheme,
  ayuTheme,
  oneDarkProTheme,
  shadesOfPurpleTheme,
  nightowlTheme,
  vesperTheme,
  carbonfoxTheme,
  gruvboxTheme,
  auraTheme,
} from "@opencode-ai/ui/theme/default-themes"

export const kappaTheme = kappaJson as DesktopTheme
export const kappaVscodeTheme = kappaVscodeJson as DesktopTheme

export const KILO_THEMES: Record<string, DesktopTheme> = {
  kappa: kappaTheme,
  "kappa-vscode": kappaVscodeTheme,
}

// Override DEFAULT_THEMES: Kappa themes first, then upstream
export const DEFAULT_THEMES: Record<string, DesktopTheme> = {
  ...KILO_THEMES,
  ...UPSTREAM_THEMES,
}
