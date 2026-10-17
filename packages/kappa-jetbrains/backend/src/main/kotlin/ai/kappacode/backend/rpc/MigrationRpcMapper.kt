package ai.kappacode.backend.rpc

import ai.kappacode.backend.migration.LegacyAutocompleteSettings
import ai.kappacode.backend.migration.LegacyCleanupReport
import ai.kappacode.backend.migration.LegacyCleanupTargets
import ai.kappacode.backend.migration.LegacyMigrationDetection
import ai.kappacode.backend.migration.LegacyMigrationItemProgress
import ai.kappacode.backend.migration.LegacyMigrationResultItem
import ai.kappacode.backend.migration.LegacyMigrationSelections
import ai.kappacode.backend.migration.LegacyMigrationSessionProgress
import ai.kappacode.backend.migration.LegacyMigrationStatus
import ai.kappacode.backend.migration.LegacySettings
import ai.kappacode.backend.migration.MigrationAutoApprovalSelections
import ai.kappacode.backend.migration.MigrationCustomModeInfo
import ai.kappacode.backend.migration.MigrationDefaultModelInfo
import ai.kappacode.backend.migration.MigrationItemCategory
import ai.kappacode.backend.migration.MigrationItemProgressStatus
import ai.kappacode.backend.migration.MigrationItemStatus
import ai.kappacode.backend.migration.MigrationMcpServerInfo
import ai.kappacode.backend.migration.MigrationProviderInfo
import ai.kappacode.backend.migration.MigrationSessionInfo
import ai.kappacode.backend.migration.MigrationSessionPhase
import ai.kappacode.backend.migration.MigrationSettingsSelections
import ai.kappacode.backend.migration.MigrationSessionSelection
import ai.kappacode.rpc.dto.LegacyAutocompleteSettingsDto
import ai.kappacode.rpc.dto.LegacyCleanupReportDto
import ai.kappacode.rpc.dto.LegacyCleanupTargetsDto
import ai.kappacode.rpc.dto.LegacyMigrationDetectionDto
import ai.kappacode.rpc.dto.LegacyMigrationItemProgressDto
import ai.kappacode.rpc.dto.LegacyMigrationResultItemDto
import ai.kappacode.rpc.dto.LegacyMigrationSelectionsDto
import ai.kappacode.rpc.dto.LegacyMigrationSessionProgressDto
import ai.kappacode.rpc.dto.LegacyMigrationStatusDto
import ai.kappacode.rpc.dto.LegacySettingsDto
import ai.kappacode.rpc.dto.MigrationAutoApprovalSelectionsDto
import ai.kappacode.rpc.dto.MigrationCustomModeInfoDto
import ai.kappacode.rpc.dto.MigrationDefaultModelInfoDto
import ai.kappacode.rpc.dto.MigrationItemCategoryDto
import ai.kappacode.rpc.dto.MigrationItemProgressStatusDto
import ai.kappacode.rpc.dto.MigrationItemStatusDto
import ai.kappacode.rpc.dto.MigrationMcpServerInfoDto
import ai.kappacode.rpc.dto.MigrationProviderInfoDto
import ai.kappacode.rpc.dto.MigrationSessionInfoDto
import ai.kappacode.rpc.dto.MigrationSessionPhaseDto
import ai.kappacode.rpc.dto.MigrationSessionSelectionDto
import ai.kappacode.rpc.dto.MigrationSettingsSelectionsDto

internal object MigrationRpcMapper {

    // -----------------------------------------------------------------------
    // Status
    // -----------------------------------------------------------------------

    fun toDto(status: LegacyMigrationStatus): LegacyMigrationStatusDto = when (status) {
        LegacyMigrationStatus.Completed -> LegacyMigrationStatusDto.completed
        LegacyMigrationStatus.CompletedWithErrors -> LegacyMigrationStatusDto.completed_with_errors
        LegacyMigrationStatus.Skipped -> LegacyMigrationStatusDto.skipped
    }

    fun fromDto(dto: LegacyMigrationStatusDto): LegacyMigrationStatus = when (dto) {
        LegacyMigrationStatusDto.completed -> LegacyMigrationStatus.Completed
        LegacyMigrationStatusDto.completed_with_errors -> LegacyMigrationStatus.CompletedWithErrors
        LegacyMigrationStatusDto.skipped -> LegacyMigrationStatus.Skipped
    }

    // -----------------------------------------------------------------------
    // Detection
    // -----------------------------------------------------------------------

    fun toDto(detection: LegacyMigrationDetection): LegacyMigrationDetectionDto =
        LegacyMigrationDetectionDto(
            providers = detection.providers.map(::toDto),
            mcpServers = detection.mcpServers.map(::toDto),
            customModes = detection.customModes.map(::toDto),
            sessions = detection.sessions.map(::toDto),
            defaultModel = detection.defaultModel?.let(::toDto),
            settings = detection.settings?.let(::toDto),
            hasData = detection.hasData,
        )

    private fun toDto(p: MigrationProviderInfo): MigrationProviderInfoDto =
        MigrationProviderInfoDto(
            profileName = p.profileName,
            provider = p.provider,
            model = p.model,
            hasApiKey = p.hasApiKey,
            supported = p.supported,
            newProviderName = p.newProviderName,
        )

    private fun toDto(m: MigrationMcpServerInfo): MigrationMcpServerInfoDto =
        MigrationMcpServerInfoDto(name = m.name, type = m.type, disabled = m.disabled)

    private fun toDto(c: MigrationCustomModeInfo): MigrationCustomModeInfoDto =
        MigrationCustomModeInfoDto(name = c.name, slug = c.slug, nativeSlug = c.nativeSlug)

    fun toDto(s: MigrationSessionInfo): MigrationSessionInfoDto =
        MigrationSessionInfoDto(id = s.id, title = s.title, directory = s.directory, time = s.time)

    private fun toDto(d: MigrationDefaultModelInfo): MigrationDefaultModelInfoDto =
        MigrationDefaultModelInfoDto(provider = d.provider, model = d.model)

    private fun toDto(s: LegacySettings): LegacySettingsDto =
        LegacySettingsDto(
            autoApprovalEnabled = s.autoApprovalEnabled,
            allowedCommands = s.allowedCommands,
            deniedCommands = s.deniedCommands,
            alwaysAllowReadOnly = s.alwaysAllowReadOnly,
            alwaysAllowReadOnlyOutsideWorkspace = s.alwaysAllowReadOnlyOutsideWorkspace,
            alwaysAllowWrite = s.alwaysAllowWrite,
            alwaysAllowExecute = s.alwaysAllowExecute,
            alwaysAllowMcp = s.alwaysAllowMcp,
            alwaysAllowModeSwitch = s.alwaysAllowModeSwitch,
            alwaysAllowSubtasks = s.alwaysAllowSubtasks,
            language = s.language,
            autocomplete = s.autocomplete?.let(::toDto),
        )

    private fun toDto(a: LegacyAutocompleteSettings): LegacyAutocompleteSettingsDto =
        LegacyAutocompleteSettingsDto(
            enableAutoTrigger = a.enableAutoTrigger,
            enableSmartInlineTaskKeybinding = a.enableSmartInlineTaskKeybinding,
            enableChatAutocomplete = a.enableChatAutocomplete,
        )

    // -----------------------------------------------------------------------
    // Selections (DTO → domain)
    // -----------------------------------------------------------------------

    fun fromDto(dto: LegacyMigrationSelectionsDto): LegacyMigrationSelections =
        LegacyMigrationSelections(
            providers = dto.providers,
            mcpServers = dto.mcpServers,
            customModes = dto.customModes,
            sessions = dto.sessions.map(::fromDto),
            defaultModel = dto.defaultModel,
            settings = fromDto(dto.settings),
            keepLegacySettingsFile = dto.keepLegacySettingsFile,
        )

    private fun fromDto(dto: MigrationSessionSelectionDto): MigrationSessionSelection =
        MigrationSessionSelection(id = dto.id)

    private fun fromDto(dto: MigrationSettingsSelectionsDto): MigrationSettingsSelections =
        MigrationSettingsSelections(
            autoApproval = fromDto(dto.autoApproval),
            language = dto.language,
            autocomplete = dto.autocomplete,
        )

    private fun fromDto(dto: MigrationAutoApprovalSelectionsDto): MigrationAutoApprovalSelections =
        MigrationAutoApprovalSelections(
            commandRules = dto.commandRules,
            readPermission = dto.readPermission,
            writePermission = dto.writePermission,
            executePermission = dto.executePermission,
            mcpPermission = dto.mcpPermission,
            taskPermission = dto.taskPermission,
        )

    // -----------------------------------------------------------------------
    // Progress / result
    // -----------------------------------------------------------------------

    fun toDto(p: LegacyMigrationItemProgress): LegacyMigrationItemProgressDto =
        LegacyMigrationItemProgressDto(item = p.item, status = toDto(p.status), message = p.message)

    fun toDto(p: LegacyMigrationSessionProgress): LegacyMigrationSessionProgressDto =
        LegacyMigrationSessionProgressDto(
            session = p.session?.let(::toDto),
            index = p.index,
            total = p.total,
            phase = toDto(p.phase),
            error = p.error,
        )

    fun toDto(r: LegacyMigrationResultItem): LegacyMigrationResultItemDto =
        LegacyMigrationResultItemDto(
            item = r.item,
            category = toDto(r.category),
            status = toDto(r.status),
            message = r.message,
        )

    private fun toDto(s: MigrationItemProgressStatus): MigrationItemProgressStatusDto = when (s) {
        MigrationItemProgressStatus.migrating -> MigrationItemProgressStatusDto.migrating
        MigrationItemProgressStatus.success -> MigrationItemProgressStatusDto.success
        MigrationItemProgressStatus.warning -> MigrationItemProgressStatusDto.warning
        MigrationItemProgressStatus.error -> MigrationItemProgressStatusDto.error
    }

    private fun toDto(p: MigrationSessionPhase): MigrationSessionPhaseDto = when (p) {
        MigrationSessionPhase.preparing -> MigrationSessionPhaseDto.preparing
        MigrationSessionPhase.storing -> MigrationSessionPhaseDto.storing
        MigrationSessionPhase.skipped -> MigrationSessionPhaseDto.skipped
        MigrationSessionPhase.done -> MigrationSessionPhaseDto.done
        MigrationSessionPhase.summary -> MigrationSessionPhaseDto.summary
        MigrationSessionPhase.error -> MigrationSessionPhaseDto.error
    }

    private fun toDto(c: MigrationItemCategory): MigrationItemCategoryDto = when (c) {
        MigrationItemCategory.provider -> MigrationItemCategoryDto.provider
        MigrationItemCategory.mcpServer -> MigrationItemCategoryDto.mcpServer
        MigrationItemCategory.customMode -> MigrationItemCategoryDto.customMode
        MigrationItemCategory.session -> MigrationItemCategoryDto.session
        MigrationItemCategory.defaultModel -> MigrationItemCategoryDto.defaultModel
        MigrationItemCategory.settings -> MigrationItemCategoryDto.settings
    }

    private fun toDto(s: MigrationItemStatus): MigrationItemStatusDto = when (s) {
        MigrationItemStatus.success -> MigrationItemStatusDto.success
        MigrationItemStatus.warning -> MigrationItemStatusDto.warning
        MigrationItemStatus.error -> MigrationItemStatusDto.error
    }

    // -----------------------------------------------------------------------
    // Cleanup
    // -----------------------------------------------------------------------

    fun fromDto(dto: LegacyCleanupTargetsDto): LegacyCleanupTargets =
        LegacyCleanupTargets(
            providerProfiles = dto.providerProfiles,
            mcpSettings = dto.mcpSettings,
            customModes = dto.customModes,
            globalState = dto.globalState,
            taskHistory = dto.taskHistory,
            legacySettingsFile = dto.legacySettingsFile,
        )

    fun toDto(r: LegacyCleanupReport): LegacyCleanupReportDto =
        LegacyCleanupReportDto(cleaned = r.cleaned, errors = r.errors)
}
