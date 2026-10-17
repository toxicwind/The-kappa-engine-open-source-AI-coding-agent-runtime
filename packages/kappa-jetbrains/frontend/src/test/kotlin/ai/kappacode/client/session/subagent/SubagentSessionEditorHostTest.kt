package ai.kappacode.client.session.subagent

import ai.kappacode.client.app.KiloAppService
import ai.kappacode.client.app.KiloSessionService
import ai.kappacode.client.app.KiloWorkspaceService
import ai.kappacode.client.session.SessionActivityKind
import ai.kappacode.client.session.SessionUi
import ai.kappacode.client.testing.FakeAppRpcApi
import ai.kappacode.client.testing.FakeSessionRpcApi
import ai.kappacode.client.testing.FakeWorkspaceRpcApi
import ai.kappacode.client.testing.TestCoroutines
import ai.kappacode.client.util.UiTimers
import ai.kappacode.rpc.dto.KiloAppStateDto
import ai.kappacode.rpc.dto.KiloAppStatusDto
import ai.kappacode.rpc.dto.KiloWorkspaceStateDto
import ai.kappacode.rpc.dto.KiloWorkspaceStatusDto
import com.intellij.testFramework.fixtures.BasePlatformTestCase

class SubagentSessionEditorHostTest : BasePlatformTestCase() {
    private lateinit var coroutines: TestCoroutines

    override fun setUp() {
        super.setUp()
        coroutines = TestCoroutines()
    }

    override fun tearDown() {
        try {
            coroutines.close()
        } finally {
            super.tearDown()
        }
    }

    fun testSubagentHostCapabilities() {
        val host = host()

        assertTrue(host.readonly)
        assertTrue(host.hostedInEditorTab)
        assertFalse(host.showsBranchDock)
    }

    fun testOpenPresentsSessionUi() {
        val host = host()

        host.open("ses_child")
        coroutines.drain()

        assertTrue(host.component.components.any { it is SessionUi })
        assertNotNull(host.currentFocus())
    }

    fun testNewSessionAndHistoryAreNoOps() {
        val host = host()

        host.newSession()
        host.showHistory()

        assertEquals(0, host.component.componentCount)
    }

    private fun host(): SubagentSessionEditorHost {
        val sessions = KiloSessionService(project, coroutines.scope, FakeSessionRpcApi())
        val app = KiloAppService(coroutines.scope, FakeAppRpcApi().also {
            it.state.value = KiloAppStateDto(KiloAppStatusDto.READY)
        })
        val workspaces = KiloWorkspaceService(coroutines.scope, FakeWorkspaceRpcApi().also {
            it.state.value = KiloWorkspaceStateDto(KiloWorkspaceStatusDto.READY)
        })
        val workspace = workspaces.workspace("/test")
        return SubagentSessionEditorHost(
            parent = testRootDisposable,
            project = project,
            workspace = workspace,
            create = { project, workspace, manager, ref, timers ->
                SessionUi(
                    project = project,
                    workspace = workspace,
                    sessions = sessions,
                    app = app,
                    cs = coroutines.scope,
                    ref = ref,
                    manager = manager,
                    workspaces = workspaces,
                    timers = timers,
                )
            },
            status = { emptyMap<String, SessionActivityKind>() },
            timers = UiTimers,
            request = {},
        )
    }
}
