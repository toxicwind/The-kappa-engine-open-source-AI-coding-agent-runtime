package ai.kappacode.backend.app

import ai.kappacode.jetbrains.api.model.KappaNotifications200ResponseInner
import ai.kappacode.jetbrains.api.model.KappaProfile200Response
import ai.kappacode.backend.migration.LegacyMigrationDetection
import ai.kappacode.rpc.dto.ConfigDto

/**
 * Full application lifecycle state, combining CLI transport connection
 * status with data-loading progress.
 *
 * [ConnectionState] stays internal to [KiloConnectionService] for the
 * transport layer. This sealed class is what the frontend observes.
 */
sealed class KiloAppState {
    data object Disconnected : KiloAppState()
    data class Downloading(val percent: Int, val version: String, val platform: String) : KiloAppState()
    data object Connecting : KiloAppState()
    data class Loading(val progress: LoadProgress) : KiloAppState()
    data class MigrationRequired(val detection: LegacyMigrationDetection) : KiloAppState()
    data class Ready(val data: AppData, val rev: Long = 0) : KiloAppState()
    data class Error(val message: String, val errors: List<LoadError> = emptyList()) : KiloAppState()
}

/**
 * Tracks which global data fetches have completed during the [KiloAppState.Loading] phase.
 */
data class LoadProgress(
    val config: Boolean = false,
    val notifications: Boolean = false,
    val profile: ProfileResult = ProfileResult.PENDING,
)

/** Outcome of the profile fetch. */
enum class ProfileResult { PENDING, LOADED, NOT_LOGGED_IN }

/**
 * Error detail for a single resource that failed to load.
 */
data class LoadError(
    val resource: String,
    val status: Int? = null,
    val detail: String? = null,
)

data class ConfigWarning(
    val path: String,
    val message: String,
    val detail: String? = null,
)

/**
 * All global data that has been successfully loaded.
 * Present only in [KiloAppState.Ready].
 */
data class AppData(
    val profile: KappaProfile200Response?,
    val config: ConfigDto,
    val notifications: List<KappaNotifications200ResponseInner>,
)
