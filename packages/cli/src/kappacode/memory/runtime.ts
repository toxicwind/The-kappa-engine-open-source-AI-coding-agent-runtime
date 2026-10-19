import { Global } from "@opencode-ai/core/global"
import * as Log from "@opencode-ai/core/util/log"
import { MemoryInstance } from "@kappacode/kappa-memory/effect/instance"
import { MemoryLog } from "@kappacode/kappa-memory/effect/log"
import { MemoryPaths } from "@kappacode/kappa-memory/effect/paths"
import { bind } from "@/kappacode/instance"
import { MemoryEvents } from "./events.ts"

const log = Log.create({ service: "memory" })

let installed = false

/** Wire the package's injectable seams to opencode at process startup: the instance-context binder
 * (so async package calls survive the host ALS), the diagnostic logger, host paths (resolved from
 * Global), and the Bus-backed event sink. Idempotent. */
export function installMemoryRuntime() {
  if (installed) return
  installed = true
  MemoryPaths.configure(() => ({ data: Global.Path.data }))
  MemoryInstance.setBinder((fn) => bind(fn))
  MemoryLog.setWarn((message, meta) => log.warn(message, meta))
  MemoryEvents.install()
}
