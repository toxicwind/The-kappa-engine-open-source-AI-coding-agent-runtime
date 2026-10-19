# @kappacode/kappa-gateway

Unified Kilo Gateway package for OpenCode providing authentication, AI provider integration, and API access.

## Features

- **Authentication**: Device authorization flow for Kilo Gateway
- **AI Provider**: OpenRouter-based provider with Kilo Gateway integration
- **API Integration**: Profile, balance, and model management
- **TUI Helpers**: Utilities for terminal UI components

## Installation

```bash
bun add @kappacode/kappa-gateway
```

## Usage

### Plugin Registration

```typescript
import { KappaAuthPlugin } from "@kappacode/kappa-gateway"

// Register with OpenCode
const plugins = [KappaAuthPlugin]
```

### Provider Usage

```typescript
import { createKappa } from "@kappacode/kappa-gateway"

const provider = createKappa({
  kappacodeToken: process.env.KAPPACODE_API_KEY,
  kappacodeOrganizationId: "org-123",
})

const model = provider.languageModel("anthropic/claude-sonnet-4")
```

### API Access

```typescript
import { fetchProfile, fetchBalance } from "@kappacode/kappa-gateway"

const profile = await fetchProfile(token)
const balance = await fetchBalance(token)
```

## License

MIT
