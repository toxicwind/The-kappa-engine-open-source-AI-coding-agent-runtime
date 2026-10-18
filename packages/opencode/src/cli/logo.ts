// kappacode_change start
import { LOGO_PLAIN } from "../kappacode/cli/logo.ts"

export const logo = {
  left: ["", "", ""],
  right: LOGO_PLAIN.split("\n"),
}
// kappacode_change end

export const go = {
  left: ["", "", "", ""], // kappacode_change
  right: LOGO_PLAIN.split("\n"), // kappacode_change - populate with actual logo
}

export const marks = "_^~,"
