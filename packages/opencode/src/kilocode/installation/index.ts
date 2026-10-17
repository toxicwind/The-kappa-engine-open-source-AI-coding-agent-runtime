export const Npm = {
  name: "@kappacode/cli",
  path: "@kappacode%2fcli",
}

export const Brew = {
  name: "kappa",
  tap: "Kilo-Org/tap",
  formula: "Kilo-Org/tap/kappa",
  api: "https://formulae.brew.sh/api/formula/kappa.json",
}

export const Choco = {
  name: "kappa",
  api: "https://community.chocolatey.org/api/v2/Packages?$filter=Id%20eq%20%27kilo%27%20and%20IsLatestVersion&$select=Version",
}

export const Scoop = {
  name: "kappa",
  manifest: "https://raw.githubusercontent.com/ScoopInstaller/Main/master/bucket/kappa.json",
}

export const Release = {
  install: "https://kappa.ai/cli/install",
}
