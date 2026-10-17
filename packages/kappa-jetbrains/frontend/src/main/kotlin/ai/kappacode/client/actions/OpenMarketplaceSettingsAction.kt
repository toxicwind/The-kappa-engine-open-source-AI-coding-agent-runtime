package ai.kappacode.client.actions

import ai.kappacode.client.plugin.KiloBundle
import ai.kappacode.client.settings.marketplace.MarketplaceConfigurable
import com.intellij.openapi.actionSystem.AnActionEvent

class OpenMarketplaceSettingsAction : OpenSettingsPageAction(
    KiloBundle.message("action.Kilo.OpenMarketplaceSettings.text"),
    KiloBundle.message("action.Kilo.OpenMarketplaceSettings.description"),
    surface = "tool_window_marketplace",
) {
    internal override fun page(e: AnActionEvent): String = MarketplaceConfigurable.ID
}
