package ai.kappacode.rpc

import ai.kappacode.rpc.dto.MarketplaceItemDto
import ai.kappacode.rpc.dto.MarketplaceBundleDto
import ai.kappacode.rpc.dto.MarketplaceListDto
import ai.kappacode.rpc.dto.MarketplaceResultDto
import com.intellij.platform.rpc.RemoteApiProviderService
import fleet.rpc.RemoteApi
import fleet.rpc.Rpc
import fleet.rpc.remoteApiDescriptor

@Rpc
interface KiloMarketplaceRpcApi : RemoteApi<Unit> {
    companion object {
        suspend fun getInstance(): KiloMarketplaceRpcApi {
            return RemoteApiProviderService.resolve(remoteApiDescriptor<KiloMarketplaceRpcApi>())
        }
    }

    suspend fun list(directory: String): MarketplaceListDto

    suspend fun bundles(directory: String): List<MarketplaceBundleDto>

    suspend fun install(
        directory: String,
        item: MarketplaceItemDto,
        target: String,
        parameters: Map<String, String>,
    ): MarketplaceResultDto

    suspend fun remove(directory: String, id: String, type: String, scope: String): MarketplaceResultDto
}
