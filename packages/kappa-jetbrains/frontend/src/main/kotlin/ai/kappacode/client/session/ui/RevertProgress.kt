package ai.kappacode.client.session.ui

import ai.kappacode.client.plugin.KiloBundle
import ai.kappacode.client.session.SpinnerIcon
import ai.kappacode.client.session.ui.style.SessionEditorStyle
import ai.kappacode.client.session.ui.style.SessionEditorStyleTarget
import ai.kappacode.client.session.ui.style.SessionUiStyle
import ai.kappacode.client.ui.UiStyle
import ai.kappacode.client.ui.layout.Stack
import com.intellij.ui.components.ActionLink
import com.intellij.ui.components.JBLabel
import com.intellij.util.concurrency.annotations.RequiresEdt
import javax.swing.JPanel

class RevertProgress(onCancel: () -> Unit) : JPanel(), SessionEditorStyleTarget {
    private val label = JBLabel()
    private val cancel = ActionLink(KiloBundle.message("session.action.cancel")) { onCancel() }
    private var style = SessionEditorStyle.current()

    init {
        isOpaque = false
        add(Stack.horizontal(UiStyle.Gap.sm())
            .next(JBLabel(SpinnerIcon.icon))
            .next(label)
            .next(cancel))
        applyStyle(style)
    }

    @RequiresEdt
    fun setText(text: String) {
        if (label.text == text) return
        label.text = text
        revalidate()
        repaint()
    }

    override fun applyStyle(style: SessionEditorStyle) {
        this.style = style
        label.font = style.regularFont
        label.foreground = SessionUiStyle.Colors.foreground()
        cancel.font = style.regularFont
        revalidate()
        repaint()
    }
}
