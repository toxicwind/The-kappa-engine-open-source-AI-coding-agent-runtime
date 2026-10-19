declare global {
  const KAPPA_VERSION: string
  const KAPPA_CHANNEL: string
  const KAPPA_BUILD_KIND: string // kappacode_change
}

export const InstallationVersion = typeof KAPPA_VERSION === "string" ? KAPPA_VERSION : "local"
export const InstallationChannel = typeof KAPPA_CHANNEL === "string" ? KAPPA_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
// kappacode_change start - distinguish release builds from source / local builds
export const InstallationBuildKind: "source" | "release" =
  typeof KAPPA_BUILD_KIND === "string" && KAPPA_BUILD_KIND === "release" ? "release" : "source"
// kappacode_change end
