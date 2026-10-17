package ai.kappacode.client.plugin

import ai.kappacode.KiloPlugin
import ai.kappacode.client.KILO_TOOL_WINDOW_ID
import ai.kappacode.client.agentManager.worktree.unregisterWorktreeSessionEditorKind
import ai.kappacode.client.session.ui.attachment.unregisterAttachmentEditorKind
import ai.kappacode.client.ui.diagram.ui.DiagramWindows
import ai.kappacode.client.ui.diagram.ui.unregisterDiagramEditorKind
import ai.kappacode.client.vfs.KiloEditorKindRegistry
import ai.kappacode.client.vfs.KiloVirtualFileSystem
import ai.kappacode.log.KiloLog
import com.intellij.ide.plugins.DynamicPluginListener
import com.intellij.ide.plugins.IdeaPluginDescriptor
import com.intellij.openapi.components.service
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.ProjectManager
import com.intellij.openapi.wm.ToolWindowManager
import javax.swing.SwingUtilities

class KiloFrontendDynamicPluginListener : DynamicPluginListener {
    override fun beforePluginUnload(pluginDescriptor: IdeaPluginDescriptor, isUpdate: Boolean) {
        if (pluginDescriptor.pluginId != KiloPlugin.id) return
        KiloFrontendUnloadCleanup.cleanup(isUpdate)
    }
}

object KiloFrontendUnloadCleanup {
    private val log = KiloLog.create(KiloFrontendUnloadCleanup::class.java)

    fun cleanup(isUpdate: Boolean) {
        log.info("Cleaning up Kilo frontend for plugin unload (isUpdate=$isUpdate)")
        runEdt {
            ProjectManager.getInstance().openProjects.forEach { project ->
                if (project.isDisposed) return@forEach
                project.getServiceIfCreated(DiagramWindows::class.java)?.closeAll()
                ToolWindowManager.getInstance(project).getToolWindow(KILO_TOOL_WINDOW_ID)
                    ?.contentManager
                    ?.removeAllContents(true)
                val editors = FileEditorManager.getInstance(project).openFiles
                    .filter { it.fileSystem === KiloVirtualFileSystem.getInstance() }
                editors.forEach { file -> FileEditorManager.getInstance(project).closeFile(file) }
            }
        }
        unregisterAttachmentEditorKind()
        unregisterWorktreeSessionEditorKind()
        unregisterDiagramEditorKind()
        service<KiloEditorKindRegistry>().clear()
        KiloVirtualFileSystem.getInstance().clear()
    }

    private fun runEdt(block: () -> Unit) {
        if (SwingUtilities.isEventDispatchThread()) {
            block()
            return
        }
        SwingUtilities.invokeAndWait(block)
    }
}
