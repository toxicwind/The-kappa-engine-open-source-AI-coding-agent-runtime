//
// @kappacode/kappa-ui
//
// Theme and style override layer for @opencode-ai/ui that matches the
// visual style of the legacy Kappa Code VS Code extension.
//
// Two themes are provided:
// - kappa:        For web/desktop (light + dark variants from legacy VS Code themes) [DEFAULT]
// - kappa-vscode: For the VS Code extension (adapts to user's VS Code theme)
//
// This package mirrors @opencode-ai/ui's structure exactly. All component imports
// are re-exported from @opencode-ai/ui by default, and can be individually overridden
// by replacing the re-export with a custom implementation.

export { KAPPA_THEMES, kappaTheme, kappaVscodeTheme } from "./theme/default-themes"

export type { DesktopTheme } from "@opencode-ai/ui/theme/types"
