package ai.kappacode.client.session.controller

import ai.kappacode.client.plugin.KiloPluginSettings
import ai.kappacode.rpc.dto.AgentDto
import ai.kappacode.rpc.dto.AgentConfigDto
import ai.kappacode.rpc.dto.ConfigDto
import ai.kappacode.rpc.dto.KiloAppStateDto
import ai.kappacode.rpc.dto.KiloAppStatusDto
import ai.kappacode.rpc.dto.ModelDto
import ai.kappacode.rpc.dto.ModelSelectionDto
import ai.kappacode.rpc.dto.ModelStateDto
import ai.kappacode.rpc.dto.ProviderDto

class ConfigSelectionTest : SessionControllerTestBase() {

    fun `test selectModel stays in its session`() {
        projectRpc.state.value = workspaceReady(
            providers = listOf(
                ProviderDto(
                    id = "kappa",
                    name = "Kilo",
                    models = mapOf(
                        "gpt-5" to ModelDto(id = "gpt-5", name = "GPT-5"),
                        "opus" to ModelDto(id = "opus", name = "Opus"),
                    ),
                ),
            ),
        )
        val first = controller()
        val second = controller()
        collect(first)
        collect(second)
        flush()

        edt { first.selectModel("kappa", "opus") }
        flush()

        assertTrue(appRpc.selections.isEmpty())
        assertSession(
            """
            [code] [kappa/opus] [app: DISCONNECTED] [workspace: READY]
            """,
            first,
            show = false,
        )
        assertSession(
            """
            [code] [kappa/gpt-5] [app: DISCONNECTED] [workspace: READY]
            """,
            second,
            show = false,
        )
        assertTrue(first.model.modelOverride)

        app.toggleModelFavorite("kappa", "opus")
        flush()

        assertEquals("kappa/opus", first.model.model)
        assertTrue(first.model.modelOverride)
        assertEquals("kappa/gpt-5", second.model.model)
    }

    /**
     * A mode switch must stay client-side. Writing it to the CLI's global config made the CLI dispose
     * every instance it held, cancelling every running turn in every worktree.
     */
    fun `test selectAgent stays local and never patches CLI config`() {
        val m = controller()
        collect(m)
        flush()

        edt { m.selectAgent("plan") }
        flush()

        assertEquals("plan", KiloPluginSettings.getAgent())
        assertSession(
            """
            [plan] [app: DISCONNECTED] [workspace: PENDING]
            """,
            m,
            show = false,
        )
    }

    fun `test remembered mode seeds a new session ahead of the CLI default`() {
        edt { KiloPluginSettings.setAgent("plan") }
        projectRpc.state.value = workspaceReady(
            agents = listOf(
                AgentDto(name = "code", displayName = "Code", mode = "code"),
                AgentDto(name = "plan", displayName = "Plan", mode = "code"),
            ),
            default = "code",
        )
        val m = controller()
        collect(m)
        flush()

        assertEquals("plan", m.model.agent)
    }

    fun `test CLI default wins when the remembered mode no longer exists`() {
        edt { KiloPluginSettings.setAgent("removed-mode") }
        projectRpc.state.value = workspaceReady(default = "code")
        val m = controller()
        collect(m)
        flush()

        assertEquals("code", m.model.agent)
    }

    fun `test selectModel fires WorkspaceReady event`() {
        projectRpc.state.value = workspaceReady()
        val m = controller()
        val events = collect(m)
        flush()
        events.clear()

        edt { m.selectModel("kappa", "gpt-5") }
        flush()

        assertControllerEvents("WorkspaceReady", events)
    }

    fun `test clearModelOverride restores default model`() {
        appRpc.models = ModelStateDto(model = mapOf("code" to ModelSelectionDto("openai", "gpt")))
        appRpc.state.value = KiloAppStateDto(
            KiloAppStatusDto.READY,
            config = ConfigDto(agent = mapOf("code" to AgentConfigDto(model = "anthropic/claude"))),
        )
        projectRpc.state.value = workspaceReady(
            providers = listOf(
                ProviderDto(
                    id = "kappa",
                    name = "Kilo",
                    models = mapOf("kappa-auto/free" to ModelDto(id = "kappa-auto/free", name = "Auto")),
                ),
                ProviderDto(
                    id = "anthropic",
                    name = "Anthropic",
                    models = mapOf("claude" to ModelDto(id = "claude", name = "Claude")),
                ),
                ProviderDto(
                    id = "openai",
                    name = "OpenAI",
                    models = mapOf("gpt" to ModelDto(id = "gpt", name = "GPT")),
                ),
            ),
            connected = listOf("kappa", "anthropic", "openai"),
            defaults = emptyMap(),
        )
        val m = controller()
        collect(m)
        flush()

        assertEquals("openai/gpt", m.model.model)
        assertTrue(m.model.modelOverride)

        edt { m.clearModelOverride() }
        flush()

        assertEquals("anthropic/claude", m.model.model)
        assertFalse(m.model.modelOverride)
        assertEquals(listOf("code"), appRpc.cleared)
        assertFalse("code" in app.models.value.model)
    }

    /**
     * The reported bug: the persisted pick outranks every config default, so a reset that left it on
     * disk looked like it worked until the next mode switch resurrected it.
     */
    fun `test clearModelOverride survives a mode switch`() {
        appRpc.models = ModelStateDto(model = mapOf("plan" to ModelSelectionDto("openai", "gpt")))
        appRpc.state.value = KiloAppStateDto(
            KiloAppStatusDto.READY,
            config = ConfigDto(model = "anthropic/claude"),
        )
        projectRpc.state.value = workspaceReady(
            agents = listOf(
                AgentDto(name = "code", displayName = "Code", mode = "code"),
                AgentDto(name = "plan", displayName = "Plan", mode = "code"),
            ),
            providers = listOf(
                ProviderDto(
                    id = "anthropic",
                    name = "Anthropic",
                    models = mapOf("claude" to ModelDto(id = "claude", name = "Claude")),
                ),
                ProviderDto(
                    id = "openai",
                    name = "OpenAI",
                    models = mapOf("gpt" to ModelDto(id = "gpt", name = "GPT")),
                ),
            ),
            connected = listOf("anthropic", "openai"),
            defaults = emptyMap(),
        )
        val m = controller()
        collect(m)
        flush()

        edt { m.selectAgent("plan") }
        flush()
        assertEquals("openai/gpt", m.model.model)
        assertTrue(m.model.modelOverride)

        edt { m.clearModelOverride() }
        flush()
        assertEquals("anthropic/claude", m.model.model)

        edt { m.selectAgent("code") }
        flush()
        edt { m.selectAgent("plan") }
        flush()

        assertEquals("anthropic/claude", m.model.model)
        assertFalse(m.model.modelOverride)
    }

    fun `test clearModelOverride without a saved pick skips the RPC`() {
        appRpc.state.value = KiloAppStateDto(
            KiloAppStatusDto.READY,
            config = ConfigDto(model = "kappa/gpt-5"),
        )
        projectRpc.state.value = workspaceReady(
            providers = listOf(
                ProviderDto(
                    id = "kappa",
                    name = "Kilo",
                    models = mapOf(
                        "gpt-5" to ModelDto(id = "gpt-5", name = "GPT-5"),
                        "opus" to ModelDto(id = "opus", name = "Opus"),
                    ),
                ),
            ),
        )
        val m = controller()
        collect(m)
        flush()

        edt { m.selectModel("kappa", "opus") }
        flush()
        assertTrue(m.model.modelOverride)

        edt { m.clearModelOverride() }
        flush()

        assertEquals("kappa/gpt-5", m.model.model)
        assertFalse(m.model.modelOverride)
        assertTrue(appRpc.cleared.isEmpty())
    }

    fun `test global config supplies computed default`() {
        appRpc.state.value = KiloAppStateDto(
            KiloAppStatusDto.READY,
            config = ConfigDto(model = "openai/gpt"),
        )
        projectRpc.state.value = workspaceReady(
            providers = listOf(
                ProviderDto(
                    id = "kappa",
                    name = "Kilo",
                    models = mapOf("kappa-auto/free" to ModelDto(id = "kappa-auto/free", name = "Auto")),
                ),
                ProviderDto(
                    id = "openai",
                    name = "OpenAI",
                    models = mapOf("gpt" to ModelDto(id = "gpt", name = "GPT")),
                ),
            ),
            connected = listOf("kappa", "openai"),
            defaults = emptyMap(),
        )
        val m = controller()
        collect(m)
        flush()

        assertEquals("openai/gpt", m.model.defaultModel)
        assertEquals("openai/gpt", m.model.model)
        assertFalse(m.model.modelOverride)
    }

    fun `test recent supplies computed default when config is absent`() {
        appRpc.models = ModelStateDto(recent = listOf(ModelSelectionDto("anthropic", "claude")))
        appRpc.state.value = KiloAppStateDto(KiloAppStatusDto.READY)
        projectRpc.state.value = workspaceReady(
            providers = listOf(
                ProviderDto(
                    id = "kappa",
                    name = "Kilo",
                    models = mapOf("kappa-auto/free" to ModelDto(id = "kappa-auto/free", name = "Auto")),
                ),
                ProviderDto(
                    id = "anthropic",
                    name = "Anthropic",
                    models = mapOf("claude" to ModelDto(id = "claude", name = "Claude")),
                ),
            ),
            connected = listOf("kappa", "anthropic"),
            defaults = emptyMap(),
        )
        val m = controller()
        collect(m)
        flush()

        assertEquals("anthropic/claude", m.model.defaultModel)
        assertEquals("anthropic/claude", m.model.model)
        assertFalse(m.model.modelOverride)
    }

    fun `test invalid config falls through to recent`() {
        appRpc.models = ModelStateDto(recent = listOf(ModelSelectionDto("anthropic", "claude")))
        appRpc.state.value = KiloAppStateDto(
            KiloAppStatusDto.READY,
            config = ConfigDto(model = "openai/gpt"),
        )
        projectRpc.state.value = workspaceReady(
            providers = listOf(
                ProviderDto(
                    id = "kappa",
                    name = "Kilo",
                    models = mapOf("kappa-auto/free" to ModelDto(id = "kappa-auto/free", name = "Auto")),
                ),
                ProviderDto(
                    id = "anthropic",
                    name = "Anthropic",
                    models = mapOf("claude" to ModelDto(id = "claude", name = "Claude")),
                ),
                ProviderDto(
                    id = "openai",
                    name = "OpenAI",
                    models = mapOf("gpt" to ModelDto(id = "gpt", name = "GPT")),
                ),
            ),
            connected = listOf("kappa", "anthropic"),
            defaults = emptyMap(),
        )
        val m = controller()
        collect(m)
        flush()

        assertEquals("anthropic/claude", m.model.defaultModel)
        assertEquals("anthropic/claude", m.model.model)
    }

    fun `test no valid candidates falls back to kappa auto`() {
        appRpc.models = ModelStateDto(recent = listOf(ModelSelectionDto("openai", "gpt")))
        appRpc.state.value = KiloAppStateDto(
            KiloAppStatusDto.READY,
            config = ConfigDto(model = "missing/model"),
        )
        projectRpc.state.value = workspaceReady(
            providers = listOf(
                ProviderDto(
                    id = "kappa",
                    name = "Kilo",
                    models = mapOf("kappa-auto/free" to ModelDto(id = "kappa-auto/free", name = "Auto")),
                ),
                ProviderDto(
                    id = "openai",
                    name = "OpenAI",
                    models = mapOf("gpt" to ModelDto(id = "gpt", name = "GPT")),
                ),
            ),
            connected = listOf("kappa"),
            defaults = emptyMap(),
        )
        val m = controller()
        collect(m)
        flush()

        assertEquals("kappa/kappa-auto/free", m.model.defaultModel)
        assertEquals("kappa/kappa-auto/free", m.model.model)
        assertFalse(m.model.modelOverride)
    }

    fun `test reset recomputes variants for computed model`() {
        appRpc.models = ModelStateDto(
            model = mapOf("code" to ModelSelectionDto("openai", "gpt")),
            variant = mapOf("anthropic/claude" to "high"),
        )
        appRpc.state.value = KiloAppStateDto(
            KiloAppStatusDto.READY,
            config = ConfigDto(agent = mapOf("code" to AgentConfigDto(model = "anthropic/claude"))),
        )
        projectRpc.state.value = workspaceReady(
            providers = listOf(
                ProviderDto(
                    id = "anthropic",
                    name = "Anthropic",
                    models = mapOf("claude" to ModelDto(id = "claude", name = "Claude", variants = listOf("low", "high"))),
                ),
                ProviderDto(
                    id = "openai",
                    name = "OpenAI",
                    models = mapOf("gpt" to ModelDto(id = "gpt", name = "GPT", variants = listOf("fast"))),
                ),
            ),
            connected = listOf("anthropic", "openai"),
            defaults = emptyMap(),
        )
        val m = controller()
        collect(m)
        flush()

        assertEquals("openai/gpt", m.model.model)
        assertEquals(listOf("fast"), m.model.variants)

        edt { m.clearModelOverride() }
        flush()

        assertEquals("anthropic/claude", m.model.model)
        assertEquals(listOf("low", "high"), m.model.variants)
        assertEquals("high", m.model.variant)
    }

    fun `test selectAgent uses saved model for selected agent`() {
        appRpc.models = ModelStateDto(model = mapOf("plan" to ModelSelectionDto("openai", "gpt")))
        appRpc.state.value = KiloAppStateDto(KiloAppStatusDto.READY, config = ConfigDto(model = "kappa/gpt-5"))
        projectRpc.state.value = workspaceReady(
            agents = listOf(
                AgentDto(name = "code", displayName = "Code", mode = "code"),
                AgentDto(name = "plan", displayName = "Plan", mode = "code"),
            ),
            providers = listOf(
                ProviderDto(
                    id = "kappa",
                    name = "Kilo",
                    models = mapOf("gpt-5" to ModelDto(id = "gpt-5", name = "GPT-5")),
                ),
                ProviderDto(
                    id = "openai",
                    name = "OpenAI",
                    models = mapOf("gpt" to ModelDto(id = "gpt", name = "GPT")),
                ),
            ),
            connected = listOf("kappa", "openai"),
            defaults = mapOf("code" to "kappa/gpt-5", "plan" to "kappa/gpt-5"),
        )
        val m = controller()
        collect(m)
        flush()

        edt { m.selectAgent("plan") }
        flush()

        assertEquals("openai/gpt", m.model.model)
        assertTrue(m.model.modelOverride)
    }

    fun `test selectVariant stays in its session`() {
        projectRpc.state.value = workspaceReady(
            providers = listOf(
                ProviderDto(
                    id = "kappa",
                    name = "Kilo",
                    models = mapOf(
                        "gpt-5" to ModelDto(id = "gpt-5", name = "GPT-5", variants = listOf("low", "medium", "high")),
                    ),
                ),
            ),
        )
        val first = controller()
        val second = controller()
        collect(first)
        collect(second)
        flush()

        edt { first.selectVariant("high") }
        flush()

        assertEquals("high", first.model.variant)
        assertEquals("low", second.model.variant)
        assertTrue(appRpc.variants.isEmpty())
    }
}
