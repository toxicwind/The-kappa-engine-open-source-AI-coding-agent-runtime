package ai.kappacode.client.agentManager.worktree

import ai.kappacode.rpc.dto.SessionDto
import com.intellij.openapi.actionSystem.DataKey

object WorktreeSessionDataKeys {
    val SESSION: DataKey<SessionDto> = DataKey.create("ai.kappacode.client.agentManager.worktree.Session")
    val PANEL: DataKey<WorktreeSessionEditorPanel> = DataKey.create("ai.kappacode.client.agentManager.worktree.SessionPanel")
}
