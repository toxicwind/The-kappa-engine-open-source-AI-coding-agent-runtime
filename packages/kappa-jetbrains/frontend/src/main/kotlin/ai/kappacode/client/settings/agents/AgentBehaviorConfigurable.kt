package ai.kappacode.client.settings.agents

import ai.kappacode.client.plugin.KiloBundle
import ai.kappacode.client.settings.base.DraftReadyConfigurable
import kotlinx.coroutines.CoroutineScope
import javax.swing.JComponent

class AgentBehaviorConfigurable : DraftReadyConfigurable<JComponent>() {
    override fun getId(): String = ID

    override fun getDisplayName(): String = KiloBundle.message("settings.agentBehavior.displayName")

    override fun create(cs: CoroutineScope): JComponent = AgentBehaviorSettingsUi(cs)

    companion object {
        const val ID = "ai.kappacode.jetbrains.settings.agentBehavior"
    }
}
