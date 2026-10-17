package ai.kappacode.client.actions

import ai.kappacode.client.plugin.KiloBundle
import ai.kappacode.client.session.history.HistoryDataKeys
import ai.kappacode.client.session.SessionManager
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages

class DeleteSessionAction : AnAction(), DumbAware {
    /** Overridable in tests to avoid showing a real modal dialog. */
    internal var confirm: (project: Project?, msg: String) -> Boolean = { project, msg ->
        Messages.showYesNoDialog(
            project,
            msg,
            KiloBundle.message("history.delete.confirm.title"),
            Messages.getWarningIcon(),
        ) == Messages.YES
    }

    override fun getActionUpdateThread() = ActionUpdateThread.EDT

    override fun update(e: AnActionEvent) {
        val selection = e.getData(HistoryDataKeys.SELECTION)
        val manager = e.getData(SessionManager.KEY)
        e.presentation.isEnabledAndVisible = manager != null &&
            selection != null &&
            selection.selectedLocal.isNotEmpty()
    }

    override fun actionPerformed(e: AnActionEvent) {
        val selection = e.getData(HistoryDataKeys.SELECTION) ?: return
        val controller = e.getData(HistoryDataKeys.CONTROLLER) ?: return
        val items = selection.selectedLocal.filter { !controller.deleting(it) }
        if (items.isEmpty()) return

        val msg = if (items.size == 1)
            KiloBundle.message("history.delete.confirm.message", ai.kappacode.client.session.history.title(items[0]))
        else
            KiloBundle.message("history.delete.confirm.message.multiple", items.size)

        controller.requestDelete(items.size)
        if (!confirm(e.project, msg)) {
            controller.cancelDelete(items.size)
            return
        }
        items.forEach { controller.delete(it) }
    }
}
