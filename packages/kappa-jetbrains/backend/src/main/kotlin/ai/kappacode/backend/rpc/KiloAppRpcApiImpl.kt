@file:Suppress("UnstableApiUsage")

package ai.kappacode.backend.rpc

import ai.kappacode.backend.app.KiloAppState
import ai.kappacode.backend.app.KiloBackendAppService
import ai.kappacode.backend.telemetry.KiloBackendTelemetry
import ai.kappacode.backend.app.LoadError
import ai.kappacode.backend.app.LoadProgress
import ai.kappacode.backend.app.ProfileResult
import ai.kappacode.backend.cli.KiloCliPlatform
import ai.kappacode.backend.cli.KiloProps
import ai.kappacode.backend.cli.KiloRepoCli
import ai.kappacode.backend.workspace.KiloWorktreeIndexSettings
import ai.kappacode.jetbrains.api.model.KiloProfile200Response
import ai.kappacode.log.KiloLog
import ai.kappacode.log.LogConfig
import ai.kappacode.rpc.dto.ConfigPatchDto
import ai.kappacode.rpc.KiloAppRpcApi
import ai.kappacode.rpc.dto.DeviceAuthDto
import ai.kappacode.rpc.dto.HealthDto
import ai.kappacode.rpc.dto.KiloAppStateDto
import ai.kappacode.rpc.dto.KiloAppStatusDto
import ai.kappacode.rpc.dto.LoadErrorDto
import ai.kappacode.rpc.dto.LoadProgressDto
import ai.kappacode.rpc.dto.LogConfigDto
import ai.kappacode.rpc.dto.LogFileDto
import ai.kappacode.rpc.dto.ModelFavoriteUpdateDto
import ai.kappacode.rpc.dto.ModelSelectionUpdateDto
import ai.kappacode.rpc.dto.ModelStateDto
import ai.kappacode.rpc.dto.ModelVariantUpdateDto
import ai.kappacode.rpc.dto.ProfileBalanceDto
import ai.kappacode.rpc.dto.ProfileDto
import ai.kappacode.rpc.dto.ProfileKiloPassDto
import ai.kappacode.rpc.dto.ProfileOrganizationDto
import ai.kappacode.rpc.dto.ProfileStatusDto
import ai.kappacode.rpc.dto.RetentionStatusDto
import ai.kappacode.rpc.dto.TelemetryCaptureDto
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.writeAction
import com.intellij.openapi.components.service
import com.intellij.openapi.project.ProjectManager
import com.intellij.openapi.project.RootsChangeRescanningInfo
import com.intellij.openapi.roots.ex.ProjectRootManagerEx
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import java.nio.file.Files

/**
 * Backend implementation of [KiloAppRpcApi].
 *
 * Delegates directly to the app-level [KiloBackendAppService] —
 * no project resolution needed since all operations are app-scoped.
 */
class KiloAppRpcApiImpl : KiloAppRpcApi {

    private val app: KiloBackendAppService get() = service()

    override suspend fun connect() = app.connect()

    override suspend fun state(): Flow<KiloAppStateDto> =
        combine(app.appState, app.capabilities) { state, caps -> appStateDto(state, caps) }
            .distinctUntilChanged()

    override suspend fun health(): HealthDto = app.health()

    override suspend fun cliVersion(): String = KiloProps.cliVersion()

    override suspend fun cliPlatform(): String = KiloCliPlatform.current()

    override suspend fun cliBundled(): Boolean = KiloRepoCli.available()

    override suspend fun retry() = app.retry()

    override suspend fun restart() = app.restart()

    override suspend fun reinstall() = app.reinstall()

    override suspend fun modelState(): ModelStateDto {
        app.requireReady()
        return app.models.state()
    }

    override suspend fun updateModelFavorite(update: ModelFavoriteUpdateDto): ModelStateDto {
        app.requireReady()
        return app.models.favorite(update)
    }

    override suspend fun updateModelSelection(update: ModelSelectionUpdateDto): ModelStateDto {
        app.requireReady()
        return app.models.selection(update)
    }

    override suspend fun clearModelSelection(agent: String): ModelStateDto {
        app.requireReady()
        return app.models.clear(agent)
    }

    override suspend fun updateModelVariant(update: ModelVariantUpdateDto): ModelStateDto {
        app.requireReady()
        return app.models.variant(update)
    }

    override suspend fun updateConfig(patch: ConfigPatchDto): KiloAppStateDto {
        app.requireReady()
        return appStateDto(app.updateConfig(patch), app.capabilities.value)
    }

    override suspend fun retentionStatus(): RetentionStatusDto = app.retention.status()

    override suspend fun runRetention(force: Boolean): RetentionStatusDto = app.retention.run(force)

    override suspend fun applyLogConfig(config: LogConfigDto) {
        LogConfig.apply(config.level, config.contentMode, config.previewMax)
    }

    override suspend fun indexWorktrees(): Boolean = KiloWorktreeIndexSettings.get()

    override suspend fun setIndexWorktrees(value: Boolean) {
        if (KiloWorktreeIndexSettings.get() == value) return
        KiloWorktreeIndexSettings.set(value)
        if (ApplicationManager.getApplication() == null) return
        for (project in ProjectManager.getInstance().openProjects) {
            if (project.isDisposed) continue
            writeAction {
                ProjectRootManagerEx.getInstanceEx(project)
                    .makeRootsChange({}, RootsChangeRescanningInfo.RESCAN_DEPENDENCIES_IF_NEEDED)
            }
        }
    }

    override suspend fun backendLogFile(): LogFileDto? = withContext(Dispatchers.IO) {
        val path = KiloLog.logFile()
        if (!Files.exists(path)) return@withContext null
        LogFileDto(path.fileName.toString(), Files.readString(path))
    }

    override suspend fun refreshProfile(): ProfileDto? = app.refreshProfile()?.let(::profileDto)

    override suspend fun startLogin(directory: String?): DeviceAuthDto = app.startLogin(directory)

    override suspend fun completeLogin(directory: String?): ProfileDto? = app.completeLogin(directory)?.let(::profileDto)

    override suspend fun logout(): Boolean = app.logout()

    override suspend fun setOrganization(organizationId: String?): ProfileDto? =
        app.setOrganization(organizationId)?.let(::profileDto)

    override suspend fun captureTelemetry(capture: TelemetryCaptureDto) {
        service<KiloBackendTelemetry>().capture(app.http, app.port, capture.event, capture.properties)
    }

}

internal fun appStateDto(state: KiloAppState, backgroundSubagents: Boolean = false): KiloAppStateDto =
    when (state) {
        KiloAppState.Disconnected -> KiloAppStateDto(KiloAppStatusDto.DISCONNECTED)
        is KiloAppState.Downloading -> KiloAppStateDto(
            status = KiloAppStatusDto.DOWNLOADING,
            downloadPercent = state.percent,
            downloadVersion = state.version,
            downloadPlatform = state.platform,
        )
        KiloAppState.Connecting -> KiloAppStateDto(KiloAppStatusDto.CONNECTING)
        is KiloAppState.Loading -> KiloAppStateDto(
            status = KiloAppStatusDto.LOADING,
            progress = progress(state.progress),
        )
        is KiloAppState.MigrationRequired -> KiloAppStateDto(
            status = KiloAppStatusDto.MIGRATION_REQUIRED,
            migration = MigrationRpcMapper.toDto(state.detection),
        )
        is KiloAppState.Ready -> KiloAppStateDto(
            status = KiloAppStatusDto.READY,
            progress = LoadProgressDto(
                config = true,
                notifications = true,
                profile = if (state.data.profile != null) ProfileStatusDto.LOADED
                    else ProfileStatusDto.NOT_LOGGED_IN,
            ),
            config = state.data.config,
            profile = state.data.profile?.let(::profileDto),
            backgroundSubagents = backgroundSubagents,
        )
        is KiloAppState.Error -> KiloAppStateDto(
            status = KiloAppStatusDto.ERROR,
            error = state.message,
            errors = state.errors.map(::error),
        )
    }

internal fun profileDto(p: KiloProfile200Response): ProfileDto = ProfileDto(
    email = p.profile.email,
    name = p.profile.name,
    organizations = p.profile.organizations.orEmpty().map { org ->
        ProfileOrganizationDto(id = org.id, name = org.name, role = org.role)
    },
    // The pinned CLI release does not expose hasPersonalAccount yet, so default to
    // showing the personal account. Flip back to p.profile.hasPersonalAccount once a
    // CLI release ships the field.
    hasPersonalAccount = true,
    balance = p.balance?.balance?.let { ProfileBalanceDto(balance = it) },
    kappaPass = p.kappaPass?.let {
        val base = it.currentPeriodBaseCreditsUsd ?: return@let null
        val usage = it.currentPeriodUsageUsd ?: return@let null
        val bonus = it.currentPeriodBonusCreditsUsd ?: return@let null
        ProfileKiloPassDto(
            currentPeriodBaseCreditsUsd = base,
            currentPeriodUsageUsd = usage,
            currentPeriodBonusCreditsUsd = bonus,
            nextBillingAt = it.nextBillingAt,
        )
    },
    currentOrgId = p.currentOrgId,
)

private fun progress(p: LoadProgress) = LoadProgressDto(
    config = p.config,
    notifications = p.notifications,
    profile = when (p.profile) {
        ProfileResult.PENDING -> ProfileStatusDto.PENDING
        ProfileResult.LOADED -> ProfileStatusDto.LOADED
        ProfileResult.NOT_LOGGED_IN -> ProfileStatusDto.NOT_LOGGED_IN
    },
)

private fun error(e: LoadError) = LoadErrorDto(
    resource = e.resource,
    status = e.status,
    detail = e.detail,
)
