package ai.kappacode.client.settings.marketplace

import ai.kappacode.client.plugin.KiloBundle
import ai.kappacode.client.settings.base.DirectoryReadyConfigurable
import javax.swing.JComponent
import kotlinx.coroutines.CoroutineScope

class MarketplaceConfigurable : DirectoryReadyConfigurable<JComponent>() {
    override fun getId(): String = ID
    override fun getDisplayName(): String = KiloBundle.message("settings.marketplace.displayName")
    override fun create(cs: CoroutineScope, dir: String): JComponent = MarketplaceSettingsUi(cs, dir)
    override fun update(ui: JComponent, dir: String) {
        (ui as? MarketplaceSettingsUi)?.setDirectory(dir)
    }
    override fun scrollReadyShell() = false

    companion object { const val ID = "ai.kappacode.jetbrains.settings.marketplace" }
}
