package ai.kappacode.client.session.views.tool

import ai.kappacode.client.plugin.KiloBundle
import ai.kappacode.client.session.model.Tool
import ai.kappacode.client.session.ui.selection.SessionSelection

/** Renders glob calls with a stacked, collapsible search-result header. */
class GlobToolView(
    tool: Tool,
    selection: SessionSelection? = null,
    parts: ToolParts = searchParts(2),
    repo: String? = null,
) : BaseSearchToolView(tool, selection, parts, repo) {

    companion object {
        fun canRender(tool: Tool): Boolean = tool.name == "glob"
    }

    override fun toolIcon(tool: Tool) = icon(tool)
    override fun toolTitle(tool: Tool) = KiloBundle.message("session.part.tool.glob")
    override fun targets(tool: Tool, repo: String?) = listOf(globDirectory(tool, repo), globPattern(tool)).filter { it.isNotBlank() }
    override fun viewName() = "GlobToolView"
}
