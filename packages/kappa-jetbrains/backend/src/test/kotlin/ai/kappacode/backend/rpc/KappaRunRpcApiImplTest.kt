package ai.kappacode.backend.rpc

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking

class KiloRunRpcApiImplTest : BasePlatformTestCase() {
    fun testResolvesProjectByDirectory() = runBlocking {
        val api = KiloRunRpcApiImpl()
        val dir = requireNotNull(project.basePath)
        assertNull(api.configs(dir).error)
        // A trailing slash must resolve the same project the workspace API would.
        assertNull(api.configs("$dir/").error)
        assertNotNull(api.configs("/kappa/definitely/missing").error)
        assertNotNull(api.run("/kappa/definitely/missing", "id", "/wt").error)
        assertNotNull(api.build("/kappa/definitely/missing", "/wt", false).error)
        assertFalse(api.stop("/kappa/definitely/missing", "id", "/wt"))
        assertFalse(api.focus("/kappa/definitely/missing", "id", "/wt"))
        assertFalse(api.release("/kappa/definitely/missing", "/wt"))
        // States for an unresolved project degrade to an empty list instead of failing the stream.
        assertTrue(api.states("/kappa/definitely/missing").first().isEmpty())
    }
}
