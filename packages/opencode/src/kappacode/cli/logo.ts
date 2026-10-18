// kappacode_change - new file
// Kappa CLI logo variants.
// Selection: modern (box-drawing) > plain (hard-block) > fallback (CP437 drop shadows).
// KILO_UNICODE_LOGO env override preserved.

/**
 * Option 1: modern — 7-row ANSI Shadow KAPPA with zero trailing text.
 * Uses box-drawing glyphs with `+` / `#` / `:` character shapes for crisp edges.
 */
export const LOGO_MODERN = [
  "     :::    :::     :::     :::::::::  :::::::::     :::   ",
  "     +:+   +:+    +:+ +:+   :+:    :+: +:+    +:+  +:+ +:+ ",
  "    +:+  +:+    +:+   +:+  +:+    +:+ +:+    +:+ +:+   +:+ ",
  "   +#++:++    +#++:++#++: +#++:++#+  +#++:++#+ +#++:++#++: ",
  "  +#+  +#+   +#+     +#+ +#+        +#+       +#+     +#+   ",
  " #+#   #+#  #+#     #+# #+#        #+#       #+#     #+#    ",
  "###    ### ###     ### ###        ###       ###     ###    ",
].join("\n");

/**
 * Option 2: plain — Hard-block geometry without combining characters.
 * Pure U+2588 blocks, no box-drawing, no drop shadows.
 */
export const LOGO_PLAIN = [
  " ██   ██   █████   ██████   ██████    █████  ",
  " ██  ██   ██   ██  ██   ██  ██   ██  ██   ██ ",
  " █████    ███████  ██████   ██████   ███████ ",
  " ██  ██   ██   ██  ██       ██       ██   ██ ",
  " ██   ██  ██   ██  ██       ██       ██   ██ ",
].join("\n");

/**
 * Option 3: fallback — Pure full-block art with CP437 drop shadows (~).
 * ~ = U+007E used as a drop-shadow indicator.
 */
export const LOGO_FALLBACK = [
  " ██   ██   █████   ██████   ██████    █████  ",
  " ██  ██~  ██~~~██  ██~~~██  ██~~~██  ██~~~██ ",
  " █████~   ███████  ██████~  ██████~  ███████ ",
  " ██~~██   ██~~~██  ██~~~~   ██~~~~   ██~~~██ ",
  " ██   ██  ██   ██  ██       ██       ██   ██ ",
  " ~~   ~~  ~~   ~~  ~~       ~~       ~~   ~~ ",
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
  // Old Windows Console Host cannot render box-drawing/sextant glyphs reliably.
  if (platform === "win32") return windows(env)
  if (env.ConEmuPID) return false
  if (env.ANSICON) return false
  return true
}

export function tui(env = process.env, platform = process.platform) {
  return supports(env, platform) ? LOGO_MODERN : LOGO_PLAIN
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
