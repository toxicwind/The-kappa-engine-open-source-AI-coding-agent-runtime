package ai.kappacode.client.settings

import ai.kappacode.client.app.KiloAppService
import ai.kappacode.log.LogConfig
import ai.kappacode.rpc.dto.LogConfigDto
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service

@Service(Service.Level.APP)
@State(
    name = "KiloLogSettings",
    storages = [Storage("kappaLogSettings.xml")],
)
class KiloLogSettingsService : PersistentStateComponent<KiloLogSettingsService.State> {

    data class State(
        var level: String? = null,
        var contentMode: String? = null,
        var previewMax: Int? = null,
    )

    private var state = State()

    override fun getState(): State = state

    override fun loadState(state: State) {
        this.state = state
    }

    fun update(
        level: LogConfig.LogLevel,
        mode: LogConfig.ContentMode,
        preview: Int,
    ) {
        state.level = level.value
        state.contentMode = mode.value
        state.previewMax = preview.coerceIn(LogConfig.MIN_PREVIEW, LogConfig.MAX_PREVIEW)
    }

    fun dto(): LogConfigDto = LogConfigDto(
        level = state.level,
        contentMode = state.contentMode,
        previewMax = state.previewMax,
    )

    fun applyLocal() {
        LogConfig.apply(state.level, state.contentMode, state.previewMax)
    }

    fun apply(app: KiloAppService = service()) {
        applyLocal()
        app.applyLogConfigAsync(dto())
    }

    companion object {
        fun getInstance(): KiloLogSettingsService = service()
    }
}
