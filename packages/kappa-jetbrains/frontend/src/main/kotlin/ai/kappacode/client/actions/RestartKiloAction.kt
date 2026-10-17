package ai.kappacode.client.actions

import ai.kappacode.client.app.KiloAppService
import ai.kappacode.client.plugin.KiloBundle
import ai.kappacode.client.telemetry.Telemetry
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.components.service
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.util.concurrency.annotations.RequiresEdt

class RestartKiloAction : AnAction(), DumbAware {
    override fun actionPerformed(e: AnActionEvent) {
        if (!confirmCoreLifecycle(e.project, KiloBundle.message("action.Kilo.Restart.cli.text"))) return
        Telemetry.send("CLI Restart Clicked", mapOf("surface" to "settings"))
        service<KiloAppService>().restartAsync()
    }

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = true
        if (e.place == KiloActionPlaces.connectionRetryPopup()) {
            e.presentation.text = KiloBundle.message("action.Kilo.Restart.cli.text")
        }
    }
}

@RequiresEdt
internal fun confirmCoreLifecycle(project: Project?, action: String) = Messages.showYesNoDialog(
    project,
    KiloBundle.message("action.Kilo.CoreLifecycle.confirm.message"),
    KiloBundle.message("action.Kilo.CoreLifecycle.confirm.title"),
    action,
    Messages.getCancelButton(),
    Messages.getWarningIcon(),
) == Messages.YES
