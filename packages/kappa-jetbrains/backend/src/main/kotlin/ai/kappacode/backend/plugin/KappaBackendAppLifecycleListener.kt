package ai.kappacode.backend.plugin

import ai.kappacode.backend.app.KiloBackendAppService
import ai.kappacode.log.KiloLog
import com.intellij.ide.AppLifecycleListener
import com.intellij.openapi.components.serviceIfCreated

class KiloBackendAppLifecycleListener : AppLifecycleListener {
    private val log = KiloLog.create(KiloBackendAppLifecycleListener::class.java)

    override fun appWillBeClosed(isRestart: Boolean) {
        log.info("appWillBeClosed(isRestart=$isRestart) — stopping Kilo CLI")
        runCatching {
            serviceIfCreated<KiloBackendAppService>()?.shutdownForAppClose()
        }.onFailure { log.warn("Failed to stop CLI on app close", it) }
    }
}
