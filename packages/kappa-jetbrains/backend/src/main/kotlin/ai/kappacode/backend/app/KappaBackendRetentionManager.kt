package ai.kappacode.backend.app

import ai.kappacode.jetbrains.api.model.KappacodeRetentionRun200Response
import ai.kappacode.jetbrains.api.model.KappacodeRetentionRunRequest
import ai.kappacode.jetbrains.api.model.KappacodeRetentionStatus200Response
import ai.kappacode.rpc.dto.RetentionPolicyDto
import ai.kappacode.rpc.dto.RetentionProgressDto
import ai.kappacode.rpc.dto.RetentionResultDto
import ai.kappacode.rpc.dto.RetentionStatusDto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull

class KiloBackendRetentionManager(private val app: KiloBackendAppService) {
    suspend fun status(): RetentionStatusDto {
        app.requireReady()
        val api = app.api ?: throw IllegalStateException("Kilo API client is unavailable")
        return withContext(Dispatchers.IO) { api.kappacodeRetentionStatus(null, null) }.dto()
    }

    suspend fun run(force: Boolean): RetentionStatusDto {
        app.requireReady()
        val api = app.api ?: throw IllegalStateException("Kilo API client is unavailable")
        return withContext(Dispatchers.IO) {
            api.kappacodeRetentionRun(null, null, KappacodeRetentionRunRequest(force))
        }.dto()
    }
}

private fun KappacodeRetentionStatus200Response.dto() = RetentionStatusDto(
    policy = RetentionPolicyDto(policy.enabled, policy.maxAgeDays.int(30)),
    last = last?.let { RetentionResultDto(
        at = it.at.long(), scanned = it.scanned.int(), deleted = it.deleted.int(),
        skippedActive = it.skippedActive.int(), failed = it.failed.int(), durationMs = it.durationMs.long(),
    ) },
    progress = progress?.let { RetentionProgressDto(
        phase = it.phase.value, total = it.total.toInt(), processed = it.processed.toInt(),
        deleted = it.deleted.toInt(), failed = it.failed.toInt(), skippedActive = it.skippedActive.toInt(),
    ) },
)

private fun KappacodeRetentionRun200Response.dto() = RetentionStatusDto(
    policy = RetentionPolicyDto(policy.enabled, policy.maxAgeDays.int(30)),
    last = last?.let { RetentionResultDto(
        at = it.at.long(), scanned = it.scanned.int(), deleted = it.deleted.int(),
        skippedActive = it.skippedActive.int(), failed = it.failed.int(), durationMs = it.durationMs.long(),
    ) },
    progress = progress?.let { RetentionProgressDto(
        phase = it.phase.value, total = it.total.toInt(), processed = it.processed.toInt(),
        deleted = it.deleted.toInt(), failed = it.failed.toInt(), skippedActive = it.skippedActive.toInt(),
    ) },
)

private fun Any?.long(fallback: Long = 0): Long = when (this) {
    is JsonElement -> jsonPrimitive.longOrNull ?: fallback
    is Number -> toLong()
    is String -> toLongOrNull() ?: fallback
    else -> fallback
}
private fun Any?.int(fallback: Int = 0): Int =
    long(fallback.toLong()).takeIf { it in Int.MIN_VALUE..Int.MAX_VALUE }?.toInt() ?: fallback
