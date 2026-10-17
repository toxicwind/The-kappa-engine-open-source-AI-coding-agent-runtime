package ai.kappacode.client.ui.md

import ai.kappacode.client.session.ui.selection.SessionSelection
import ai.kappacode.client.session.ui.style.SessionEditorStyle

internal class MdViewHybrid(
    style: SessionEditorStyle = SessionEditorStyle.current(),
    selection: SessionSelection? = null,
    code: MdCodeBlockFactory = MdCodeBlockFactory.default(),
) : ai.kappacode.client.ui.md.hybrid.MdViewHybrid(style, selection, code)
