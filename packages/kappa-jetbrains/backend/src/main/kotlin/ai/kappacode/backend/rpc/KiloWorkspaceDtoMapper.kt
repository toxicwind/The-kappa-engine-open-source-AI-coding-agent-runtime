package ai.kappacode.backend.rpc

import ai.kappacode.backend.app.ConfigWarning
import ai.kappacode.backend.app.LoadError
import ai.kappacode.backend.workspace.AgentData
import ai.kappacode.backend.workspace.AgentInfo
import ai.kappacode.backend.workspace.CommandInfo
import ai.kappacode.backend.workspace.KiloWorkspaceLoadProgress
import ai.kappacode.backend.workspace.ModelInfo
import ai.kappacode.backend.workspace.ProviderData
import ai.kappacode.backend.workspace.ProviderInfo
import ai.kappacode.backend.workspace.SkillInfo
import ai.kappacode.rpc.dto.ModelAutoRoutingDto
import ai.kappacode.rpc.dto.ModelCacheCostDto
import ai.kappacode.rpc.dto.ModelCapabilitiesDto
import ai.kappacode.rpc.dto.ModelCostDto
import ai.kappacode.rpc.dto.AgentDto
import ai.kappacode.rpc.dto.AgentsDto
import ai.kappacode.rpc.dto.CommandDto
import ai.kappacode.rpc.dto.ConfigWarningDto
import ai.kappacode.rpc.dto.KiloWorkspaceLoadProgressDto
import ai.kappacode.rpc.dto.LoadErrorDto
import ai.kappacode.rpc.dto.ModelDto
import ai.kappacode.rpc.dto.ModelInputCapabilitiesDto
import ai.kappacode.rpc.dto.ModelLimitDto
import ai.kappacode.rpc.dto.ModelOptionsDto
import ai.kappacode.rpc.dto.ModelTerminalBenchDto
import ai.kappacode.rpc.dto.ProviderDto
import ai.kappacode.rpc.dto.ProvidersDto
import ai.kappacode.rpc.dto.SkillDto

internal object KiloWorkspaceDtoMapper {
    fun error(e: LoadError) = LoadErrorDto(
        resource = e.resource,
        status = e.status,
        detail = e.detail,
    )

    fun progress(p: KiloWorkspaceLoadProgress) = KiloWorkspaceLoadProgressDto(
        providers = p.providers,
        agents = p.agents,
        commands = p.commands,
        skills = p.skills,
    )

    fun providers(d: ProviderData) = ProvidersDto(
        providers = d.providers.map(::provider),
        connected = d.connected,
        defaults = d.defaults,
    )

    fun agents(d: AgentData) = AgentsDto(
        agents = d.agents.map(::agent),
        all = d.all.map(::agent),
        default = d.default,
    )

    fun command(c: CommandInfo) = CommandDto(
        name = c.name,
        description = c.description,
        agent = c.agent,
        model = c.model,
        variant = c.variant,
        source = c.source,
        hints = c.hints,
        subtask = c.subtask,
    )

    fun skill(s: SkillInfo) = SkillDto(
        name = s.name,
        description = s.description,
        location = s.location,
        content = s.content,
        editable = false,
    )

    fun warning(w: ConfigWarning) = ConfigWarningDto(
        path = w.path,
        message = w.message,
        detail = w.detail,
    )

    private fun provider(p: ProviderInfo) = ProviderDto(
        id = p.id,
        name = p.name,
        source = p.source,
        models = p.models.mapValues { (_, m) -> model(m) },
    )

    private fun model(m: ModelInfo) = ModelDto(
        id = m.id,
        name = m.name,
        inputPrice = m.inputPrice,
        outputPrice = m.outputPrice,
        contextLength = m.contextLength,
        releaseDate = m.releaseDate,
        latest = m.latest,
        attachment = m.attachment,
        reasoning = m.reasoning,
        temperature = m.temperature,
        toolCall = m.toolCall,
        free = m.free,
        byok = m.byok,
        status = m.status,
        recommendedIndex = m.recommendedIndex,
        variants = m.variants,
        limit = m.limit?.let { ModelLimitDto(it.context, it.input, it.output) },
        cost = m.cost?.let { cost ->
            ModelCostDto(
                input = cost.input,
                output = cost.output,
                cache = cost.cache?.let { ModelCacheCostDto(it.read, it.write) },
            )
        },
        capabilities = m.capabilities?.let { cap ->
            ModelCapabilitiesDto(
                reasoning = cap.reasoning,
                input = cap.input?.let { ModelInputCapabilitiesDto(it.text, it.image, it.audio, it.video, it.pdf) },
            )
        },
        options = m.options?.let { ModelOptionsDto(it.description) },
        autoRouting = m.autoRouting?.let { ModelAutoRoutingDto(it.models) },
        terminalBench = m.terminalBench?.let { ModelTerminalBenchDto(it.overallScore, it.avgAttemptCostUsd) },
        mayTrainOnYourPrompts = m.mayTrainOnYourPrompts,
    )

    private fun agent(a: AgentInfo) = AgentDto(
        name = a.name,
        displayName = a.displayName,
        description = a.description,
        mode = a.mode,
        native = a.native,
        hidden = a.hidden,
        color = a.color,
        deprecated = a.deprecated,
    )
}
