package ai.kappacode.client.agentManager.worktree

import ai.kappacode.rpc.dto.WorktreeDto
import com.intellij.openapi.actionSystem.DataKey

object WorktreeDataKeys {
    val WORKTREE: DataKey<WorktreeDto> = DataKey.create("ai.kappacode.client.agentManager.worktree.Worktree")
}
