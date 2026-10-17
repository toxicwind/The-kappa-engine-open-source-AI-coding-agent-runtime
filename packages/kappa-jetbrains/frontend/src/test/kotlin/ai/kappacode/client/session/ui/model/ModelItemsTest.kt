package ai.kappacode.client.session.ui.model

import ai.kappacode.rpc.dto.ModelDto
import ai.kappacode.rpc.dto.ProviderDto
import ai.kappacode.rpc.dto.ProvidersDto
import com.intellij.testFramework.fixtures.BasePlatformTestCase

class ModelItemsTest : BasePlatformTestCase() {

    private fun providers(): ProvidersDto = ProvidersDto(
        providers = listOf(
            ProviderDto(
                "kappa", "Kilo",
                models = mapOf(
                    "gpt-5" to ModelDto("gpt-5", "GPT-5", variants = listOf("low", "high"), attachment = true),
                    "auto-small" to ModelDto("auto-small", "Auto Small"),
                ),
            ),
            ProviderDto("openai", "OpenAI", models = mapOf("o3" to ModelDto("o3", "o3"))),
            ProviderDto("anthropic", "Anthropic", models = mapOf("claude" to ModelDto("claude", "Claude"))),
        ),
        connected = listOf("openai"),
        defaults = emptyMap(),
    )

    fun `test drops small models and providers that are not connected`() {
        assertEquals(listOf("kappa/gpt-5", "openai/o3"), modelItems(providers()).map { it.key })
    }

    fun `test keeps small models when requested`() {
        assertEquals(
            setOf("kappa/gpt-5", "kappa/auto-small", "openai/o3"),
            modelItems(providers(), includeSmall = true).map { it.key }.toSet(),
        )
    }

    fun `test carries variants and attachment onto the item`() {
        val gpt = modelItems(providers()).first { it.key == "kappa/gpt-5" }
        assertEquals(listOf("low", "high"), gpt.variants)
        assertTrue(gpt.attachment)
    }

    fun `test null providers yields no items`() {
        assertTrue(modelItems(null).isEmpty())
    }
}
