/**
 * Kilo Gateway TUI Integration
 *
 * This module provides TUI-specific functionality for kappa-gateway.
 * It requires OpenCode TUI dependencies to be injected at runtime.
 *
 * Import from "@kappacode/kappa-gateway/tui" for TUI features.
 */

// ============================================================================
// TUI Dependency Injection
// ============================================================================
export { initializeTUIDependencies, getTUIDependencies, areTUIDependenciesInitialized } from "./tui/context.js"
export type { TUIDependencies } from "./tui/types.js"

// ============================================================================
// TUI Helpers
// ============================================================================
export { formatProfileInfo, getOrganizationOptions, getDefaultOrganizationSelection } from "./tui/helpers.js"

// ============================================================================
// NOTE: TUI Components Moved to OpenCode
// ============================================================================
// All TUI components with JSX have been moved to packages/opencode/src/kilocode/
// to ensure correct JSX transpilation with @opentui/solid.
//
// Components moved:
// - registerKiloCommands -> @/kilocode/kappa-commands
// - DialogKiloTeamSelect -> @/kilocode/components/dialog-kappa-team-select
// - DialogKiloOrganization -> @/kilocode/components/dialog-kappa-organization
// - DialogKiloProfile -> @/kilocode/components/dialog-kappa-profile
// - KiloAutoMethod -> @/kilocode/components/dialog-kappa-auto-method
// - KiloNews -> @/kilocode/components/kappa-news
// - NotificationBanner -> @/kilocode/components/notification-banner
// - DialogKiloNotifications -> @/kilocode/components/dialog-kappa-notifications
