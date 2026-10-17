import type { BuiltinTuiPlugin } from "@opencode-ai/tui/builtins"
import HomeNews from "@/kappacode/plugins/home-news"
import HomeOnboarding from "@/kappacode/plugins/home-onboarding"
import Attention from "@/kappacode/plugins/attention"
import HomeFooter from "@/kappacode/plugins/home-footer"
import Permissions from "@/kappacode/plugins/permissions"
import SidebarFooter from "@/kappacode/plugins/sidebar-footer"
import MemoryStatus from "@/kappacode/plugins/memory-status"
import MemoryPalette from "@/kappacode/plugins/memory-palette"
import SidebarProcesses from "@/kappacode/plugins/sidebar-background-processes"
import SidebarIndexing from "@/kappacode/plugins/sidebar-indexing"
import SidebarPr from "@/kappacode/plugins/sidebar-pr"
import SidebarUsage from "@/kappacode/plugins/sidebar-usage"
import Sandbox from "@/kappacode/plugins/sandbox"
import Remote from "@/kappacode/plugins/remote"
import Reload from "@/kappacode/plugins/reload"
import SessionSwitcher from "@/kappacode/plugins/session-switcher"
import SessionV2Debug from "@/kappacode/plugins/session-v2-debug"
import type { RuntimeFlags } from "@/effect/runtime-flags"

const plugins = [
  HomeNews,
  HomeOnboarding,
  Attention,
  HomeFooter,
  Permissions,
  SidebarFooter,
  MemoryStatus,
  MemoryPalette,
  SidebarProcesses,
  SidebarIndexing,
  SidebarPr,
  SidebarUsage,
  Sandbox,
  Remote,
  Reload,
] satisfies BuiltinTuiPlugin[]

export function withKiloTuiPlugins(
  builtins: BuiltinTuiPlugin[],
  flags: Pick<RuntimeFlags.Info, "experimentalEventSystem" | "experimentalSessionSwitcher">,
) {
  return [
    ...plugins,
    ...(flags.experimentalEventSystem ? [SessionV2Debug] : []),
    ...(flags.experimentalSessionSwitcher ? [SessionSwitcher] : []),
    ...builtins,
  ]
}
