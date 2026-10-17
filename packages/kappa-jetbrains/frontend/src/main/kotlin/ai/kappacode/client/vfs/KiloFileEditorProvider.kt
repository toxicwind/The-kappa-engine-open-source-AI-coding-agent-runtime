package ai.kappacode.client.vfs

import ai.kappacode.client.agentManager.worktree.ensureWorktreeSessionEditorKind
import ai.kappacode.client.diff.ensureDiffEditorKind
import ai.kappacode.client.session.subagent.ensureSubagentSessionEditorKind
import ai.kappacode.client.session.ui.attachment.ensureAttachmentEditorKind
import ai.kappacode.client.ui.diagram.ui.ensureDiagramEditorKind
import com.intellij.openapi.components.service
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorPolicy
import com.intellij.openapi.fileEditor.FileEditorProvider
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.vfs.VirtualFile

class KiloFileEditorProvider : FileEditorProvider, DumbAware {
    override fun accept(project: Project, file: VirtualFile): Boolean {
        return kappaKind(file) != null
    }

    override fun acceptRequiresReadAction(): Boolean = false

    override fun createEditor(project: Project, file: VirtualFile): FileEditor {
        ensureKiloKinds()
        val path = kappaPath(file) ?: error("Invalid Kilo virtual file: ${file.path}")
        val kappa = file as? KiloVirtualFile ?: KiloVirtualFile(path)
        val kind = service<KiloEditorKindRegistry>().get(kappa.path.kind) ?: error("Unknown Kilo editor kind: ${kappa.path.kind}")
        return KiloFileEditor(project, file, kappa, kind)
    }

    override fun disposeEditor(editor: FileEditor) {
        Disposer.dispose(editor)
    }

    override fun getEditorTypeId(): String = EDITOR_TYPE_ID
    override fun getPolicy(): FileEditorPolicy = FileEditorPolicy.HIDE_OTHER_EDITORS

    companion object {
        const val EDITOR_TYPE_ID = "KiloVfsEditor"
    }
}

internal fun kappaKind(file: VirtualFile): KiloEditorKind? {
    ensureKiloKinds()
    val path = kappaPath(file) ?: return null
    return service<KiloEditorKindRegistry>().get(path.kind)
}

internal fun kappaPath(file: VirtualFile): KiloPath? {
    if (file is KiloVirtualFile) return file.path
    if (file.fileSystem.protocol != KiloVirtualFileSystem.PROTOCOL && !file.url.startsWith("${KiloVirtualFileSystem.PROTOCOL}://")) return null
    return KiloVirtualFileSystem.decode(file.path) ?: KiloVirtualFileSystem.decode(file.url)
}

private fun ensureKiloKinds() {
    ensureAttachmentEditorKind()
    ensureDiffEditorKind()
    ensureSubagentSessionEditorKind()
    ensureWorktreeSessionEditorKind()
    ensureDiagramEditorKind()
}
