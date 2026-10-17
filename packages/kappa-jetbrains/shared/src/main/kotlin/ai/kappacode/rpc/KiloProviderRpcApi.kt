@file:Suppress("UnstableApiUsage")

package ai.kappacode.rpc

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
import com.intellij.platform.rpc.RemoteApiProviderService
import fleet.rpc.RemoteApi
import fleet.rpc.Rpc
import fleet.rpc.remoteApiDescriptor

@Rpc
interface KiloProviderRpcApi : RemoteApi<Unit> {
    companion object {
        suspend fun getInstance(): KiloProviderRpcApi {
            return RemoteApiProviderService.resolve(remoteApiDescriptor<KiloProviderRpcApi>())
        }
    }

    suspend fun state(directory: String): ProviderSettingsDto
    suspend fun connect(input: ProviderConnectDto): ProviderActionResultDto
    suspend fun authorize(input: ProviderOAuthAuthorizeDto): ProviderOAuthReadyDto
    suspend fun callback(input: ProviderOAuthCallbackDto): ProviderActionResultDto
    suspend fun disconnect(input: ProviderDisconnectDto): ProviderActionResultDto
    suspend fun enable(input: ProviderEnableDto): ProviderActionResultDto
    suspend fun saveCustom(input: CustomProviderSaveDto): ProviderActionResultDto
    suspend fun fetchCustomModels(input: CustomModelFetchDto): CustomModelFetchResultDto
}
