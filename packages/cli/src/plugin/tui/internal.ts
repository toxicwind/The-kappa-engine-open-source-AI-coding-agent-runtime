import { createBuiltinPlugins, type BuiltinTuiPlugin } from "@opencode-ai/tui/builtins"
import type { RuntimeFlags } from "@/effect/runtime-flags"
import { withKappaTuiPlugins } from "@/kappacode/plugins/internal" // kappacode_change

export type InternalTuiPlugin = BuiltinTuiPlugin

// kappacode_change start
export function internalTuiPlugins(
  flags: Pick<RuntimeFlags.Info, "experimentalEventSystem" | "experimentalSessionSwitcher">,
): InternalTuiPlugin[] {
  return withKappaTuiPlugins(
    createBuiltinPlugins({
      experimentalEventSystem: flags.experimentalEventSystem,
    }),
    flags,
  )
  // kappacode_change end
}
