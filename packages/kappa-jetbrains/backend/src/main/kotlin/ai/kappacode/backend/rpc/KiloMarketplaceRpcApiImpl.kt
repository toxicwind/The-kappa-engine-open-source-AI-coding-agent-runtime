@file:Suppress("UnstableApiUsage")

package ai.kappacode.backend.rpc

import ai.kappacode.backend.app.KiloBackendAppService
import ai.kappacode.backend.marketplace.KiloBackendMarketplaceManager
import ai.kappacode.rpc.KiloMarketplaceRpcApi
import ai.kappacode.rpc.dto.MarketplaceBundleDto
import ai.kappacode.rpc.dto.MarketplaceItemDto
import ai.kappacode.rpc.dto.MarketplaceListDto
import ai.kappacode.rpc.dto.MarketplaceResultDto

class KiloMarketplaceRpcApiImpl(
    backend: KiloBackendAppService? = null,
    private val manager: KiloBackendMarketplaceManager = KiloBackendMarketplaceManager(backend),
) : KiloMarketplaceRpcApi {
    override suspend fun list(directory: String): MarketplaceListDto = manager.list(directory)

    override suspend fun bundles(directory: String): List<MarketplaceBundleDto> = manager.bundles(directory)

    override suspend fun install(
        directory: String,
        item: MarketplaceItemDto,
        target: String,
        parameters: Map<String, String>,
    ): MarketplaceResultDto = manager.install(directory, item, target, parameters)

    override suspend fun remove(directory: String, id: String, type: String, scope: String): MarketplaceResultDto =
        manager.remove(directory, id, type, scope)
}
