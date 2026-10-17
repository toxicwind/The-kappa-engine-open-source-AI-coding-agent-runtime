package ai.kilocode.client.agentManager.worktree

import ai.kilocode.rpc.dto.SetupScriptKind
import ai.kilocode.rpc.dto.SetupScriptTargetDto
import com.intellij.testFramework.fixtures.BasePlatformTestCase

class WorktreeSetupScriptTest : BasePlatformTestCase() {
    fun `test posix command invokes sh with a quoted path`() {
        val script = SetupScriptTargetDto("/repo/.kappa/setup-script", "/repo/.kappa/setup-script", true, SetupScriptKind.POSIX)

        assertEquals("sh '/repo/.kappa/setup-script'", setupScriptCommand(script))
    }

    fun `test powershell command uses NoProfile and Bypass with a quoted path`() {
        val script = SetupScriptTargetDto("C:\\repo\\.kappa\\setup-script.ps1", "C:\\repo\\.kappa\\setup-script.ps1", true, SetupScriptKind.POWERSHELL)

        assertEquals(
            "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File \"C:\\repo\\.kappa\\setup-script.ps1\"",
            setupScriptCommand(script),
        )
    }

    fun `test cmd command uses d s c with a quoted path`() {
        val script = SetupScriptTargetDto("C:\\repo\\.kappa\\setup-script.cmd", "C:\\repo\\.kappa\\setup-script.cmd", true, SetupScriptKind.CMD)

        assertEquals("cmd.exe /d /s /c \"C:\\repo\\.kappa\\setup-script.cmd\"", setupScriptCommand(script))
    }

    fun `test posix quoting escapes an embedded single quote`() {
        val script = SetupScriptTargetDto("/repo/it's/.kappa/setup-script", "/repo/it's/.kappa/setup-script", true, SetupScriptKind.POSIX)

        assertEquals("sh '/repo/it'\\''s/.kappa/setup-script'", setupScriptCommand(script))
    }

    fun `test windows quoting doubles an embedded double quote`() {
        val script = SetupScriptTargetDto("C:\\repo \"copy\"\\.kappa\\setup-script.ps1", "", true, SetupScriptKind.POWERSHELL)

        assertEquals(
            "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File \"C:\\repo \"\"copy\"\"\\.kappa\\setup-script.ps1\"",
            setupScriptCommand(script),
        )
    }

    fun `test posix quoting handles a path containing spaces`() {
        val script = SetupScriptTargetDto("/repo/my worktree/.kappa/setup-script", "", true, SetupScriptKind.POSIX)

        assertEquals("sh '/repo/my worktree/.kappa/setup-script'", setupScriptCommand(script))
    }
}
