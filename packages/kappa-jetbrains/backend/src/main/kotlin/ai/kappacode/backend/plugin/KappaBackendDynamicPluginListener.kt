package ai.kappacode.backend.plugin

import ai.kappacode.KiloPlugin
import ai.kappacode.backend.app.KiloBackendAppService
import ai.kappacode.log.KiloLog
import com.intellij.ide.plugins.DynamicPluginListener
import com.intellij.ide.plugins.IdeaPluginDescriptor
import com.intellij.openapi.components.service

class KiloBackendDynamicPluginListener : DynamicPluginListener {
    private val log = KiloLog.create(KiloBackendDynamicPluginListener::class.java)

    override fun beforePluginUnload(pluginDescriptor: IdeaPluginDescriptor, isUpdate: Boolean) {
        if (pluginDescriptor.pluginId != KiloPlugin.id) return
        log.info("Shutting down Kilo backend for plugin unload (isUpdate=$isUpdate)")
        service<KiloBackendAppService>().shutdownForUnload()
    }
}
