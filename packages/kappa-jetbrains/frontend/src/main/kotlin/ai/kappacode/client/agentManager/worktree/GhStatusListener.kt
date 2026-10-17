package ai.kappacode.client.agentManager.worktree

import ai.kappacode.rpc.dto.GhAvailability
import com.intellij.util.messages.Topic

fun interface GhStatusListener {
    fun statusChanged(value: GhAvailability)

    companion object {
        @JvmField
        val TOPIC: Topic<GhStatusListener> = Topic.create("Kilo gh status", GhStatusListener::class.java)
    }
}
