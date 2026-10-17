import type { TuiPlugin } from "@kappacode/plugin/tui"
import type { InternalTuiPlugin } from "@/plugin/tui/internal"
import { MemoryPermission } from "@/kappacode/cli/cmd/tui/permissions"

const id = "internal:kappa-permissions"

const tui: TuiPlugin = async () => {
  MemoryPermission.register()
}

const plugin: InternalTuiPlugin = {
  id,
  tui,
}

export default plugin
