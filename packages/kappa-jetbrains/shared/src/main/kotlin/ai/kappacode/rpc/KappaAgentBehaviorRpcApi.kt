package ai.kappacode.rpc

import ai.kappacode.rpc.dto.AgentDetailDto
import ai.kappacode.rpc.dto.AgentCreateDto
import ai.kappacode.rpc.dto.CommandFileDto
import ai.kappacode.rpc.dto.CommandDto
import ai.kappacode.rpc.dto.McpAuthEventDto
import ai.kappacode.rpc.dto.McpAuthResultDto
import ai.kappacode.rpc.dto.McpConfigDto
import ai.kappacode.rpc.dto.McpServerConfigDto
import ai.kappacode.rpc.dto.McpStatusDto
import ai.kappacode.rpc.dto.SkillDto
import com.intellij.platform.rpc.RemoteApiProviderService
import fleet.rpc.RemoteApi
import fleet.rpc.Rpc
import fleet.rpc.remoteApiDescriptor
import kotlinx.coroutines.flow.Flow

@Rpc
interface KiloAgentBehaviorRpcApi : RemoteApi<Unit> {
    companion object {
        suspend fun getInstance(): KiloAgentBehaviorRpcApi {
            return RemoteApiProviderService.resolve(remoteApiDescriptor<KiloAgentBehaviorRpcApi>())
        }
    }

    suspend fun agents(directory: String): List<AgentDetailDto>

    suspend fun skills(directory: String): List<SkillDto>

    suspend fun removeSkill(directory: String, location: String): Boolean

    suspend fun reloadSkills(directory: String): Boolean

    suspend fun saveSkill(directory: String, location: String, content: String): Boolean

    suspend fun saveSkills(directory: String, edits: Map<String, String>): Boolean

    suspend fun removeAgent(directory: String, name: String): Boolean

    suspend fun createAgent(directory: String, input: AgentCreateDto): Boolean

    suspend fun commands(directory: String): List<CommandDto>

    suspend fun commandFiles(directory: String): List<CommandFileDto>

    suspend fun removeCommand(directory: String, location: String): Boolean

    suspend fun reloadCommands(directory: String): Boolean

    suspend fun saveCommands(directory: String, edits: Map<String, String>): Boolean

    suspend fun mcpStatus(directory: String): List<McpStatusDto>

    suspend fun mcpConfig(directory: String): Map<String, McpServerConfigDto>

    suspend fun saveMcp(directory: String, name: String, scope: String, config: McpConfigDto?): Boolean

    suspend fun mcpConnect(directory: String, name: String): Boolean

    suspend fun mcpDisconnect(directory: String, name: String): Boolean

    suspend fun mcpAuthenticate(directory: String, name: String): McpAuthResultDto

    /** Cancels an in-flight sign-in, leaving any stored credentials in place. */
    suspend fun mcpAuthCancel(directory: String, name: String): Boolean

    suspend fun mcpAuthRemove(directory: String, name: String): Boolean

    suspend fun mcpAuthEvents(): Flow<McpAuthEventDto>

    suspend fun claudeCodeCompat(): Boolean

    suspend fun setClaudeCodeCompat(value: Boolean): Boolean
}
