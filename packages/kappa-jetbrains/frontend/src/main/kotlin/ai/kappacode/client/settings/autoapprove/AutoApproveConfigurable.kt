package ai.kappacode.client.settings.autoapprove

import ai.kappacode.client.plugin.KiloBundle
import ai.kappacode.client.settings.base.DraftReadyConfigurable
import kotlinx.coroutines.CoroutineScope
import javax.swing.JComponent

class AutoApproveConfigurable : DraftReadyConfigurable<JComponent>() {
    override fun getId(): String = ID

    override fun getDisplayName(): String = KiloBundle.message("settings.autoApprove.displayName")

    // The page renders its own fixed search field plus a scrollable body, so the shell must not
    // add another scroll pane around it.
    override fun scrollReadyShell(): Boolean = false

    override fun create(cs: CoroutineScope): JComponent = AutoApproveSettingsUi(cs)

    companion object {
        const val ID = "ai.kappacode.jetbrains.settings.autoApprove"
    }
}
