import { Config } from "@/config/config"
import { AppRuntime } from "@/effect/app-runtime"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Installation } from "@/installation"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { GlobalBus } from "@/bus/global"

export async function upgrade() {
  const config = await AppRuntime.runPromise(Config.Service.use((cfg) => cfg.getGlobal()))
  // kappacode_change start - fork/permanent: only auto-update when the user EXPLICITLY
  // opts in (config.autoupdate === true). This is a source-built fork: defaulting to
  // `undefined`/nothin' letting npm auto-upgrade would clobber the local build. Agents do
  // NOT need KAPPA_DISABLE_AUTOUPDATE=1 anywhere — it is off unless opted in.
  if (config.autoupdate !== true || Flag.KAPPA_DISABLE_AUTOUPDATE) return
  // kappacode_change end
  const method = await Installation.method()
  // kappacode_change start - only auto-upgrade for npm/yarn/pnpm/bun (we only publish @kappacode/cli via npm registry)
  if (method !== "npm" && method !== "yarn" && method !== "pnpm" && method !== "bun") return
  // kappacode_change end
  const latest = await Installation.latest(method).catch(() => {})
  if (!latest) return

  if (Flag.KAPPA_ALWAYS_NOTIFY_UPDATE) {
    GlobalBus.emit("event", {
      directory: "global",
      payload: {
        type: Installation.Event.UpdateAvailable.type,
        properties: { version: latest },
      },
    })
    return
  }

  if (InstallationVersion === latest) return

  const kind = Installation.getReleaseType(InstallationVersion, latest)

  if (kind !== "patch") {
    GlobalBus.emit("event", {
      directory: "global",
      payload: {
        type: Installation.Event.UpdateAvailable.type,
        properties: { version: latest },
      },
    })
    return
  }

  await Installation.upgrade(method, latest)
    .then(() =>
      GlobalBus.emit("event", {
        directory: "global",
        payload: {
          type: Installation.Event.Updated.type,
          properties: { version: latest },
        },
      }),
    )
    .catch(() => {})
}
