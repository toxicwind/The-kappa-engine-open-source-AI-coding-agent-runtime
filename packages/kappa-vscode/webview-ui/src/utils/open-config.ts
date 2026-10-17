import type { LanguageContextValue } from "../context/language"
import type { OpenConfigFileRequest } from "../types/messages"

export function configMessage(scope: "local" | "global", t: LanguageContextValue["t"]): OpenConfigFileRequest {
  const label = t(scope === "global" ? "settings.config.scope.global" : "settings.config.scope.local")
  return {
    type: "openConfigFile",
    scope,
    labels: {
      scope: label,
      statusLoaded: t("settings.config.status.loaded"),
      statusLoadedLegacy: t("settings.config.status.loadedLegacy"),
      statusNotLoaded: t("settings.config.status.notLoaded"),
      statusCreate: t("settings.config.status.create"),
      title: t("settings.config.title", { scope: label }),
      placeholder: t("settings.config.placeholder"),
      noWorkspace: t("settings.config.noWorkspace"),
      openFailed: t("settings.config.openFailed", { scope: label, message: "{{message}}" }),
      sourceXdg: t("settings.config.source.xdg"),
      sourceHomeKappa: t("settings.config.source.homeKappa"),
      sourceHomeKappacode: t("settings.config.source.homeKappacode"),
      sourceHomeOpencode: t("settings.config.source.homeOpencode"),
      sourceEnvFile: t("settings.config.source.envFile"),
      sourceEnvDir: t("settings.config.source.envDir"),
      sourceEnvContent: t("settings.config.source.envContent"),
      sourceProjectKappa: t("settings.config.source.projectKappa"),
      sourceProjectRoot: t("settings.config.source.projectRoot"),
      sourceProjectKappacode: t("settings.config.source.projectKappacode"),
      sourceProjectOpencode: t("settings.config.source.projectOpencode"),
    },
  }
}
