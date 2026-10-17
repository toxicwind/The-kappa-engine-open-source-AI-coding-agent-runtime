package ai.kappacode.backend.dev

import ai.kappacode.log.KiloLog

object KiloDevMode {
    fun enabled(): Boolean = KiloLog.sandbox()
}
