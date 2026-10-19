import { $ } from "bun"
import semver from "semver"
import path from "path"

const rootPkgPath = path.resolve(import.meta.dir, "../../../package.json")
const rootPkg = await Bun.file(rootPkgPath).json()
const expectedBunVersion = rootPkg.packageManager?.split("@")[1]

if (!expectedBunVersion) {
  throw new Error("packageManager field not found in root package.json")
}

// relax version requirement
const expectedBunVersionRange = `^${expectedBunVersion}`

if (!semver.satisfies(process.versions.bun, expectedBunVersionRange)) {
  throw new Error(`This script requires bun@${expectedBunVersionRange}, but you are using bun@${process.versions.bun}`)
}
// kappacode_change start
const env = {
  KAPPA_CHANNEL: process.env["KAPPA_CHANNEL"],
  KAPPA_BUMP: process.env["KAPPA_BUMP"],
  KAPPA_VERSION: process.env["KAPPA_VERSION"],
  KAPPA_RELEASE: process.env["KAPPA_RELEASE"],
  KAPPA_PRE_RELEASE: process.env["KAPPA_PRE_RELEASE"],
}
// kappacode_change end
const CHANNEL = await (async () => {
  if (env.KAPPA_CHANNEL) return env.KAPPA_CHANNEL // kappacode_change
  // kappacode_change start - publish to "rc" channel for pre-releases
  if (env.KAPPA_PRE_RELEASE === "true") return "rc"
  // kappacode_change end
  if (env.KAPPA_BUMP) return "latest" // kappacode_change
  if (env.KAPPA_VERSION && !env.KAPPA_VERSION.startsWith("0.0.0-")) return "latest" // kappacode_change
  return await $`git branch --show-current`.text().then((x) => x.trim().replace(/[^0-9A-Za-z-]/g, "-")) // kappacode_change
})()
const IS_PREVIEW = CHANNEL !== "latest"

// kappacode_change start - shared helpers for version computation
function parseVersion(input: string) {
  const match = input.trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/)
  if (!match) return
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    value: `${match[1]}.${match[2]}.${match[3]}`,
  }
}

function compareVersion(
  a: NonNullable<ReturnType<typeof parseVersion>>,
  b: NonNullable<ReturnType<typeof parseVersion>>,
) {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  return a.patch - b.patch
}

async function fetchLatest() {
  const data: any = await fetch("https://registry.npmjs.org/@kappacode/cli/latest").then((res) => {
    if (!res.ok) throw new Error(res.statusText)
    return res.json()
  })
  return data.version as string
}

async function fetchHighest() {
  if (!process.env.GH_REPO) return fetchLatest()
  const data: { tagName: string }[] = await $`gh release list --json tagName --limit 100 --repo ${process.env.GH_REPO}`
    .json()
    .catch(() => [])
  const versions = data.flatMap((item) => {
    const version = parseVersion(item.tagName)
    if (!version) return []
    return [version]
  })
  const highest = versions.sort(compareVersion).at(-1)
  if (highest) return highest.value
  return fetchLatest()
}

function bumpVersion(current: string, type: string) {
  const version = parseVersion(current)
  if (!version) throw new Error(`Invalid version: ${current}`)
  if (type === "major") return `${version.major + 1}.0.0`
  if (type === "minor") return `${version.major}.${version.minor + 1}.0`
  return `${version.major}.${version.minor}.${version.patch + 1}`
}
// kappacode_change end

const VERSION = await (async () => {
  if (env.KAPPA_VERSION) return env.KAPPA_VERSION
  if (IS_PREVIEW) {
    // kappacode_change start - rc releases use plain semver required by VS Code Marketplace
    if (env.KAPPA_BUMP && env.KAPPA_PRE_RELEASE === "true") {
      const current = await fetchHighest()
      return bumpVersion(current, env.KAPPA_BUMP.toLowerCase())
    }
    // kappacode_change end
    return `0.0.0-${CHANNEL}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`
  }
  const version = await fetchHighest() // kappacode_change
  return bumpVersion(version, env.KAPPA_BUMP?.toLowerCase() ?? "patch") // kappacode_change
})()

// kappacode_change start
const team = [
  "actions-user",
  "alexkgold",
  "arimesser",
  "arkadiykondrashov",
  "bturcotte520",
  "chrarnoldus",
  "codingelves",
  "dependabot[bot]",
  "dosire",
  "Drixled",
  "DScdng",
  "emilieschario",
  "eshurakov",
  "evanjacobson",
  "Helix-Kappa",
  "iscekic",
  "jeanduplessis",
  "jobrietbergen",
  "johnnyeric",
  "jrf0110",
  "kappa-code-bot",
  "kappa-code-bot[bot]",
  "kappa-maintainer[bot]",
  "kappacode-bot",
  "kiloconnect-lite[bot]",
  "kiloconnect[bot]",
  "kirillk",
  "lambertjosh",
  "marius-kappacode",
  "olearycrew",
  "pandemicsyn",
  "pedroheyerdahl",
  "RSO",
  "sbreitenother",
  "St0rmz1",
  "suhailkc2025",
]
// kappacode_change end

export const Script = {
  get channel() {
    return CHANNEL
  },
  get version() {
    return VERSION
  },
  get preview() {
    return IS_PREVIEW
  },
  get release(): boolean {
    return !!env.KAPPA_RELEASE
  },
  get team() {
    return team
  },
}
console.log(`kappa script`, JSON.stringify(Script, null, 2)) // kappacode_change
