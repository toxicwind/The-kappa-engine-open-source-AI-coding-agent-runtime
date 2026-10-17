@file:Suppress("UnstableApiUsage")

package ai.kappacode.backend.rpc

import ai.kappacode.backend.provider.KiloBackendProviderSettingsManager
import ai.kappacode.rpc.KiloProviderRpcApi
import ai.kappacode.rpc.dto.CustomModelFetchDto
import ai.kappacode.rpc.dto.CustomModelFetchResultDto
import ai.kappacode.rpc.dto.CustomProviderSaveDto
import ai.kappacode.rpc.dto.ProviderActionResultDto
import ai.kappacode.rpc.dto.ProviderConnectDto
import ai.kappacode.rpc.dto.ProviderDisconnectDto
import ai.kappacode.rpc.dto.ProviderEnableDto
import ai.kappacode.rpc.dto.ProviderOAuthAuthorizeDto
import ai.kappacode.rpc.dto.ProviderOAuthCallbackDto
import ai.kappacode.rpc.dto.ProviderOAuthReadyDto
import ai.kappacode.rpc.dto.ProviderSettingsDto
import com.intellij.openapi.components.service
import ai.kappacode.backend.app.KiloBackendAppService
import ai.kappacode.log.KiloLog

internal class KiloProviderRpcApiImpl : KiloProviderRpcApi {
    companion object {
        private val LOG = KiloLog.create(KiloProviderRpcApiImpl::class.java)
    }

    private val manager: KiloBackendProviderSettingsManager
        get() = KiloBackendProviderSettingsManager(service<KiloBackendAppService>())

    override suspend fun state(directory: String): ProviderSettingsDto = logged("state dir=$directory") { manager.state(directory) }
    override suspend fun connect(input: ProviderConnectDto): ProviderActionResultDto = logged("connect provider=${input.providerId}") { manager.connect(input) }
    override suspend fun authorize(input: ProviderOAuthAuthorizeDto): ProviderOAuthReadyDto = logged("authorize provider=${input.providerId}") { manager.authorize(input) }
    override suspend fun callback(input: ProviderOAuthCallbackDto): ProviderActionResultDto = logged("callback provider=${input.providerId}") { manager.callback(input) }
    override suspend fun disconnect(input: ProviderDisconnectDto): ProviderActionResultDto = logged("disconnect provider=${input.providerId}") { manager.disconnect(input) }
    override suspend fun enable(input: ProviderEnableDto): ProviderActionResultDto = logged("enable provider=${input.providerId}") { manager.enable(input) }
    override suspend fun saveCustom(input: CustomProviderSaveDto): ProviderActionResultDto = logged("save custom provider=${input.id}") { manager.saveCustom(input) }
    override suspend fun fetchCustomModels(input: CustomModelFetchDto): CustomModelFetchResultDto = logged("fetch custom models") { manager.fetch(input) }

    private suspend fun <T> logged(name: String, block: suspend () -> T): T {
        val start = System.currentTimeMillis()
        LOG.info("provider rpc $name: start")
        return try {
            val result = block()
            LOG.info("provider rpc $name: completed durationMs=${System.currentTimeMillis() - start}")
            result
        } catch (e: Exception) {
            LOG.warn("provider rpc $name: failed durationMs=${System.currentTimeMillis() - start}", e)
            throw e
        }
    }
}
