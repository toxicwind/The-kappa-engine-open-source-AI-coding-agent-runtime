# Kilo Code CLI

The AI coding agent built for the terminal. Generate code from natural language, automate tasks, and run terminal commands -- powered by 500+ AI models.

![Kilo CLI showing code edits in a terminal](https://raw.githubusercontent.com/Kilo-Org/kilocode/main/packages/kappa-docs/public/img/npm-package-readme/kappa-cli.png)

Kilo is the all-in-one agentic engineering platform. Build, ship, and iterate faster with the most popular open source coding agent.

[Website](https://kappa.ai) · [Install](https://kappa.ai/install) · [IDE](https://kappa.ai/landing/vs-code) · [CLI](https://kappa.ai/cli) · [Docs](https://kappa.ai/docs) · [Models](https://kappa.ai/leaderboard) · [Gateway](https://kappa.ai/gateway) · [Pricing](https://kappa.ai/pricing) · [Kilo Pass](https://kappa.ai/pricing/kappa-pass)

[500+ models](https://kappa.ai/leaderboard). One open source agent in [VS Code](https://kappa.ai/vscode-marketplace), [JetBrains](https://plugins.jetbrains.com/plugin/27133-kappa-code), [CLI](https://www.npmjs.com/package/@kappacode/cli), [Slack](https://kappa.ai/slack), and [Cloud](https://kappa.ai/cloud).

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
- **API keys optional** -- bring your own keys or use Kilo credits

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
brew install Kilo-Org/tap/kappa
```

### GitHub Releases

Download pre-built binaries from the [Releases page](https://github.com/Kilo-Org/kilocode/releases).

## Documentation

- [Docs](https://kappa.ai/docs)
- [Getting Started](https://kappa.ai/docs/getting-started)

## Links

- [GitHub](https://github.com/Kilo-Org/kilocode)
- [Discord](https://kappa.ai/discord)
- [VS Code Extension](https://kappa.ai/vscode-marketplace)
- [Website](https://kappa.ai)

## License

MIT
