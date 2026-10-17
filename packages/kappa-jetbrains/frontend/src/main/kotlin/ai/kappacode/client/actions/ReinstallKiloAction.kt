package ai.kappacode.client.actions

import ai.kappacode.client.app.KiloAppService
import ai.kappacode.client.plugin.KiloBundle
import ai.kappacode.client.telemetry.Telemetry
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.components.service
import com.intellij.openapi.project.DumbAware

class ReinstallKiloAction : AnAction(), DumbAware {
    override fun actionPerformed(e: AnActionEvent) {
        if (!confirmCoreLifecycle(e.project, KiloBundle.message("action.Kilo.Reinstall.cli.text"))) return
        Telemetry.send("CLI Reinstall Clicked", mapOf("surface" to "settings"))
        service<KiloAppService>().reinstallAsync()
    }

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = true
        if (e.place == KiloActionPlaces.connectionRetryPopup()) {
            e.presentation.text = KiloBundle.message("action.Kilo.Reinstall.cli.text")
        }
    }
}
