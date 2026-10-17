package ai.kappacode.client.app

import ai.kappacode.rpc.dto.KiloWorkspaceStateDto
import kotlinx.coroutines.flow.StateFlow

/**
 * A workspace for a single directory. Mirrors the CLI concept of a
 * workspace — a directory with its providers, agents, commands, skills.
 *
 * Immutable reference — [state] flows internally as the workspace loads.
 * Lifecycle managed by [KiloWorkspaceService].
 */
class Workspace(
    val directory: String,
    val state: StateFlow<KiloWorkspaceStateDto>,
    val reload: () -> Unit,
    val refreshConfigFiles: () -> Unit = {},
)
