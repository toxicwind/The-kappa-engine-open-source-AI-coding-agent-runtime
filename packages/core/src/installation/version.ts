declare global {
  const KAPPA_VERSION: string
  const KAPPA_CHANNEL: string
  const KAPPA_BUILD_KIND: string // kappacode_change
}

export const InstallationVersion = typeof KAPPA_VERSION === "string" ? KAPPA_VERSION : "local"
export const InstallationChannel = typeof KAPPA_CHANNEL === "string" ? KAPPA_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
// kappacode_change start - deterministic, non-empty channel token for database naming.
//
// Fixes the "lost sessions" split: a dev/local build made from a detached HEAD or
// otherwise branch-less git context sanitizes the channel to "" producing
// `kappa-.db` instead of `kappa-main.db`. Both the core and cli database path
// resolvers consume this single helper so they can never disagree on a filename.
export function safeChannelToken(channel: string = InstallationChannel): string {
  const safe = channel.replace(/[^a-zA-Z0-9._-]/g, "-")
  // A token with no alphanumeric characters is meaningless (e.g. "", "-", "----")
  // and would yield a garbage `kappa---.db`. Fall back to a stable "dev".
  return /[a-zA-Z0-9]/.test(safe) ? safe : "dev"
}
// kappacode_change end
// kappacode_change start - distinguish release builds from source / local builds
export const InstallationBuildKind: "source" | "release" =
  typeof KAPPA_BUILD_KIND === "string" && KAPPA_BUILD_KIND === "release" ? "release" : "source"
// kappacode_change end
