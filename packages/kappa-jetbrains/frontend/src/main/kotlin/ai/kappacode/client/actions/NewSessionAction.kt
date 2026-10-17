package ai.kappacode.client.actions

import ai.kappacode.client.plugin.KiloBundle
import ai.kappacode.client.session.SessionManager
import ai.kappacode.client.telemetry.Telemetry
import ai.kappacode.client.agentManager.SidePanelKeys
import ai.kappacode.client.agentManager.SidePanelMode
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.Presentation
import com.intellij.openapi.actionSystem.ex.CustomComponentAction
import com.intellij.openapi.project.DumbAware
import javax.swing.JComponent

class NewSessionAction : AnAction(
    KiloBundle.message("action.Kilo.NewSession.text"),
    KiloBundle.message("action.Kilo.NewSession.description"),
    KiloActionIcons.add,
), DumbAware, CustomComponentAction {
    override fun actionPerformed(e: AnActionEvent) {
        Telemetry.send("New Session Clicked", mapOf("surface" to "tool_window"))
        e.getData(SessionManager.KEY)?.newSession()
    }

    override fun update(e: AnActionEvent) {
        e.presentation.isVisible = e.getData(SidePanelKeys.MODE) != SidePanelMode.AGENT_MANAGER
        e.presentation.isEnabled = e.getData(SessionManager.KEY) != null
        e.presentation.icon = KiloActionIcons.add
        if (!e.isFromActionToolbar) return
        e.presentation.text = KiloBundle.message("action.Kilo.NewSession.toolbar")
    }

    override fun createCustomComponent(presentation: Presentation, place: String): JComponent =
        titleButton(presentation, place)
}
