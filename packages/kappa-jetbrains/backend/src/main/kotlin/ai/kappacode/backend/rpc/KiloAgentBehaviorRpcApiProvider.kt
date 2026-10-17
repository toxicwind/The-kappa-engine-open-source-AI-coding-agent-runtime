@file:Suppress("UnstableApiUsage")

package ai.kappacode.backend.rpc

import ai.kappacode.rpc.KiloAgentBehaviorRpcApi
import com.intellij.platform.rpc.backend.RemoteApiProvider
import fleet.rpc.remoteApiDescriptor

internal class KiloAgentBehaviorRpcApiProvider : RemoteApiProvider {
    override fun RemoteApiProvider.Sink.remoteApis() {
        remoteApi(remoteApiDescriptor<KiloAgentBehaviorRpcApi>()) {
            KiloAgentBehaviorRpcApiImpl()
        }
    }
}
