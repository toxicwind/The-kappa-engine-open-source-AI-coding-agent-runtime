package ai.kilocode.backend.cli

import java.util.Properties

object KiloProps {
    private val props by lazy {
        val stream = KiloProps::class.java.classLoader.getResourceAsStream("kappa.properties")
            ?: throw IllegalStateException("kappa.properties resource not found")
        stream.use {
            Properties().apply { load(it) }
        }
    }

    fun cliVersion(): String = props.getProperty("cli.version")
        ?: throw IllegalStateException("cli.version missing from kappa.properties")

    fun pinned(): Boolean = pinned(props)

    internal fun pinned(props: Properties): Boolean = props.getProperty("cli.pinned")?.toBoolean() ?: true
}
