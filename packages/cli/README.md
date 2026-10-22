# Kappa Code CLI

The AI coding agent built for the terminal. Generate code from natural language, automate tasks, and run terminal commands -- powered by 500+ AI models.

![Kappa CLI showing code edits in a terminal](https://raw.githubusercontent.com/Kappa-Org/kappacode/main/packages/kappa-docs/public/img/npm-package-readme/kappa-cli.png)

Kappa is the all-in-one agentic engineering platform. Build, ship, and iterate faster with the most popular open source coding agent.

[Website](https://kilo.ai) · [Install](https://kilo.ai/install) · [IDE](https://kilo.ai/landing/vs-code) · [CLI](https://kilo.ai/cli) · [Docs](https://kilo.ai/docs) · [Models](https://kilo.ai/leaderboard) · [Gateway](https://kilo.ai/gateway) · [Pricing](https://kilo.ai/pricing) · [Kappa Pass](https://kilo.ai/pricing/kappa-pass)

[500+ models](https://kilo.ai/leaderboard). One open source agent in [VS Code](https://kilo.ai/vscode-marketplace), [JetBrains](https://plugins.jetbrains.com/plugin/27133-kappa-code), [CLI](https://www.npmjs.com/package/@kappacode/cli), [Slack](https://kilo.ai/slack), and [Cloud](https://kilo.ai/cloud).

## Install

```bash
npm install -g @kappacode/cli
```

Or run directly with npx:

```bash
npx --package @kappacode/cli kappa
```

## Getting Started

Run `kappa` in any project directory to launch the interactive TUI:

```bash
kappa
```

Run a one-off task:

```bash
kappa run "add input validation to the signup form"
```

## Features

- **Code generation** -- describe what you want in natural language
- **Terminal commands** -- the agent can run shell commands on your behalf
- **500+ AI models** -- use models from OpenAI, Anthropic, Google, and more
- **MCP servers** -- extend agent capabilities with the Model Context Protocol
- **Multiple modes** -- Plan with Architect, code with Coder, debug with Debugger, or create your own
- **Sessions** -- resume previous conversations and export transcripts
- **Reliable session persistence** -- a stable, deterministic database name (`kappa-<channel>.db`) keeps every build's sessions in one place, so local/dev builds can never silently fork your history into a stray `kappa-.db`
- **API keys optional** -- bring your own keys or use Kappa credits

## Commands

| Command               | Description                |
| --------------------- | -------------------------- |
| `kappa`                | Launch interactive TUI     |
| `kappa run "<task>"`   | Run a one-off task         |
| `kappa auth`           | Manage authentication      |
| `kappa models`         | List available models      |
| `kappa mcp`            | Manage MCP servers         |
| `kappa session list`   | List sessions              |
| `kappa session delete` | Delete a session           |
| `kappa export`         | Export session transcripts |

Run `kappa --help` for the full list.

## Alternative Installation

### Homebrew (macOS/Linux)

```bash
brew install Kappa-Org/tap/kappa
```

### GitHub Releases

Download pre-built binaries from the [Releases page](https://github.com/Kappa-Org/kappacode/releases).

## Documentation

- [Docs](https://kilo.ai/docs)
- [Getting Started](https://kilo.ai/docs/getting-started)

## Links

- [GitHub](https://github.com/Kappa-Org/kappacode)
- [Discord](https://kilo.ai/discord)
- [VS Code Extension](https://kilo.ai/vscode-marketplace)
- [Website](https://kilo.ai)

## License

MIT
