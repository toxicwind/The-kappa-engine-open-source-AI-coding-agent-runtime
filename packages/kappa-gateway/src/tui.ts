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
// All TUI components with JSX have been moved to packages/opencode/src/kappacode/
// to ensure correct JSX transpilation with @opentui/solid.
//
// Components moved:
// - registerKappaCommands -> @/kappacode/kappa-commands
// - DialogKappaTeamSelect -> @/kappacode/components/dialog-kappa-team-select
// - DialogKappaOrganization -> @/kappacode/components/dialog-kappa-organization
// - DialogKappaProfile -> @/kappacode/components/dialog-kappa-profile
// - KappaAutoMethod -> @/kappacode/components/dialog-kilo-auto-method
// - KappaNews -> @/kappacode/components/kappa-news
// - NotificationBanner -> @/kappacode/components/notification-banner
// - DialogKappaNotifications -> @/kappacode/components/dialog-kappa-notifications
