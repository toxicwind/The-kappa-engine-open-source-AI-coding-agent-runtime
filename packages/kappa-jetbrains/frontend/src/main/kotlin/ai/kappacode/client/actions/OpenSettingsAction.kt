package ai.kappacode.client.actions

import ai.kappacode.client.plugin.KiloBundle
import ai.kappacode.client.settings.KiloSettingsSelection
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.ProjectManager

class OpenSettingsAction : OpenSettingsPageAction(
    KiloBundle.message("action.Kilo.OpenSettings.text"),
    KiloBundle.message("action.Kilo.OpenSettings.description"),
    surface = "tool_window",
) {
    /** Reopens wherever the user last was, so this entry resumes rather than jumps somewhere fixed. */
    internal override fun page(e: AnActionEvent): String =
        KiloSettingsSelection.target(e.project ?: ProjectManager.getInstance().defaultProject)
}
