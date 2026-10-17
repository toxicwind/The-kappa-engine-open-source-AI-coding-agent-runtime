package ai.kappacode.client

import ai.kappacode.client.agentManager.SidePanelKeys
import ai.kappacode.client.agentManager.SidePanelMode
import ai.kappacode.client.agentManager.applySidePanelMode
import ai.kappacode.client.plugin.KiloBundle
import ai.kappacode.client.util.edtWait
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.intellij.ui.content.ContentFactory
import javax.swing.JPanel

class KiloToolWindowFactoryTest : BasePlatformTestCase() {
    fun `test content labels are short`() {
        assertEquals("Chat", KiloBundle.message("sidePanel.mode.branch"))
        assertEquals("Agents", KiloBundle.message("sidePanel.mode.agentManager"))
    }

    fun `test content records side panel mode`() = edtWait {
        val content = ContentFactory.getInstance().createContent(JPanel(), "Chat", false)

        content.applySidePanelMode(SidePanelMode.CHAT)

        assertEquals(SidePanelMode.CHAT, content.getUserData(SidePanelKeys.CONTENT_MODE))
    }
}
