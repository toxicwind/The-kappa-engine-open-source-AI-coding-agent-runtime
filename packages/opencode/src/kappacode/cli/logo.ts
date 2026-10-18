// kappacode_change - new file
// Kappa CLI logo variants.
// Selection: modern (sextant glyphs) > plain (stencil) > fallback (compact).

/**
 * Option 1: modern
 * Sharp diagonal cut graffiti art with Unicode shade blocks and katakana footer.
 */
export const LOGO_MODERN = [
  "   __  ___  _____   ______ ______  _____     ▄█▀█▄   ",
  "  / / / / |/ /   | / ____// ____/ /   |     █▀ █ ▀█  ",
  " / /_/ /|   / /| |/ /_   / /_    / /| |    █   █   █ ",
  "/ __  //   / ___ / __/  / __/   / ___ |     ▀█▄█▄█▀  ",
  "/_/ /_//_/|_/_/  |_/_/    /_/    /_/  |_|   [ ｶ ｯ ﾊﾟ ]",
  " ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀ ",
].join("\n");

/**
 * Option 2: plain
 * Geometric stencil cut font (monospaced ASCII, zero wide glyphs).
 */
export const LOGO_PLAIN = [
  "  ___  __  _______   ______ ______  _______    ",
  "  \\  \\/ / /  _    \\ /  __  \\\\  __  \\/  _    \\  ",
  "   \\   / |  / \\    |  /_/  /|  /_/  |  / \\    \\ ",
  "   /   \\ |  |--|   |   ___/ |   ___/|  |--|   | ",
  "  /__/\\_\\|__|  |___|__|     |__|    |__|  |___| ",
  "  ----=[ k a p p a _ c o d e _ e n g i n e ]=-- ",
].join("\n");

/**
 * Option 3: fallback
 * Ultra-compact 3-line stencil block.
 */
export const LOGO_FALLBACK = [
  "  [_/ /_ [-_-[_-[_-[_-_  ",
  "  [ \\ \\| | | | | | | | | ",
  "  --- k a p p a -------  ",
].join("\n");

function flag(value: string | undefined) {
  const key = value?.toLowerCase()
  if (!key) return
  if (yes.has(key)) return true
  if (no.has(key)) return false
}

const yes = new Set(["1", "true", "yes", "on"])
const no = new Set(["0", "false", "no", "off"])

function windows(env: NodeJS.ProcessEnv) {
  if (env.WT_SESSION) return true
  if (env.TERM_PROGRAM === "vscode") return true
  if (env.WEZTERM_PANE) return true
  if (env.TERM_PROGRAM === "WezTerm") return true
  return false
}

export function supports(env = process.env, platform = process.platform) {
  const override = flag(env.KILO_UNICODE_LOGO)
  if (override !== undefined) return override
  if (env.TERM === "dumb") return false
  if (platform === "win32") return windows(env)
  if (env.ConEmuPID) return false
  if (env.ANSICON) return false
  return true
}

export function tui(env = process.env, platform = process.platform) {
  return LOGO_MODERN
}

export function plain(env = process.env, platform = process.platform) {
  return LOGO_PLAIN
}

export function session(
  title: string,
  id: string | undefined,
  dim: string,
  normal: string,
  env = process.env,
  platform = process.platform,
) {
  const lines = LOGO_MODERN.split("\n")
  return [``, `${lines[0]}${dim}${title}${normal}`, `${lines[1]}${dim}kappa -s ${id}${normal}`, lines[2]].join("\n")
}
