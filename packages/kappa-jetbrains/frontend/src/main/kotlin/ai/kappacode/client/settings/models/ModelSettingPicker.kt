package ai.kappacode.client.settings.models

import ai.kappacode.client.plugin.KiloBundle
import ai.kappacode.client.session.ui.model.ModelPicker
import ai.kappacode.client.ui.layout.Stack
import ai.kappacode.client.ui.layout.StackAxis

internal class ModelSettingPicker : Stack(StackAxis.HORIZONTAL) {
    val picker = ModelPicker()
    private var active = true
    private var available = false

    init {
        picker.allowEmpty = true
        picker.emptyText = KiloBundle.message("settings.models.notSet")
        next(picker)
    }

    fun setItems(items: List<ModelPicker.Item>, selected: String?) {
        available = items.isNotEmpty() || picker.allowEmpty
        picker.setItems(items, selected)
        picker.isEnabled = active && available
    }

    override fun setEnabled(value: Boolean) {
        active = value
        super.setEnabled(value)
        picker.isEnabled = active && available
    }
}
