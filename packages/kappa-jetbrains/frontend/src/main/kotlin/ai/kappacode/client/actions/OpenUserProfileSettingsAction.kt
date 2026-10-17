package ai.kappacode.client.actions

import ai.kappacode.client.plugin.KiloBundle
import ai.kappacode.client.settings.profile.UserProfileConfigurable
import com.intellij.openapi.actionSystem.AnActionEvent

class OpenUserProfileSettingsAction : OpenSettingsPageAction(
    KiloBundle.message("action.Kilo.OpenUserProfileSettings.text"),
    KiloBundle.message("action.Kilo.OpenUserProfileSettings.description"),
    surface = "tool_window_profile",
) {
    internal override fun page(e: AnActionEvent): String = UserProfileConfigurable.ID
}
