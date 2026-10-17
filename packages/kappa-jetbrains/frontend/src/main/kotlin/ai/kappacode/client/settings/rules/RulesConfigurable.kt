package ai.kappacode.client.settings.rules

import ai.kappacode.client.plugin.KiloBundle
import ai.kappacode.client.settings.base.DraftReadyConfigurable
import kotlinx.coroutines.CoroutineScope
import javax.swing.JComponent

class RulesConfigurable : DraftReadyConfigurable<JComponent>() {
    override fun getId(): String = ID

    override fun getDisplayName(): String = KiloBundle.message("settings.agentBehavior.rules.displayName")

    override fun create(cs: CoroutineScope): JComponent = RulesSettingsUi(cs, root = project?.basePath)

    override fun scrollReadyShell() = false

    companion object {
        const val ID = "ai.kappacode.jetbrains.settings.agentBehavior.rules"
    }
}
