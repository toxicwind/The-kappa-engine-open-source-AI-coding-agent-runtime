---
title: "CLI Config Schema"
description: "How CLI runtime config and editor-facing JSON Schema stay aligned"
---

# CLI Config Schema

Kappa config has two related but separate paths:

- Kappa CLI runtime loads and merges config locally.
- Cloud-served JSON Schema gives editors validation and completion for `kappa.json` and `kappa.jsonc`.

JSON Schema does not load, apply, or override runtime config.

```jsonc
{
  "$schema": "https://app.kilo.ai/config.json"
}
```

## Two separate paths

```mermaid
flowchart LR
  subgraph runtime ["Runtime config loading"]
    files["Global, project, organization,<br/>managed, and runtime config sources"] --> loader["Kappa CLI config loader"] --> effective["Effective runtime config"]
  end

  subgraph schema ["Editor validation and completion"]
    info["Config.Info<br/>Effect Schema"] --> generated["Locally generated schema<br/>for verification"]
    upstream["https://opencode.ai/config.json"] --> overlay["Kappa Cloud merge route"]
    extras["Kappa extras.ts overlay buckets"] --> overlay --> endpoint["https://app.kilo.ai/config.json"] --> editor["Editor validation and completion"]
    generated -. "Keep aligned" .-> extras
  end
```

Changing runtime config precedence affects first path. Adding or changing config key affects both paths because editor schema must describe keys CLI accepts. See [CLI Runtime config precedence](/docs/contributing/architecture/cli-runtime#config-precedence) for runtime merge order.

## Source of truth

Canonical CLI config source is Effect Schema `Config.Info` in `packages/cli/src/config/config.ts` in [`Kappa-Org/kappacode`](https://github.com/Kappa-Org/kappacode). CLI derives `.zod` compatibility surface from Effect Schema for plugin and SDK consumers. Do not maintain separate handwritten Zod definition for Kappa config fields.

## Cloud schema endpoint

Static source review of [`Kappa-Org/cloud`](https://github.com/Kappa-Org/cloud) shows this route behavior:

1. Editor fetches `https://app.kilo.ai/config.json` because config file references `$schema`.
2. Cloud route `apps/web/src/app/config.json/route.ts` fetches `https://opencode.ai/config.json`.
3. Route runs `merge()` and returns upstream schema with Kappa additions and overrides.
4. `merge()` overlays buckets from `apps/web/src/app/config.json/extras.ts`.

Cloud source defines 1-hour upstream revalidation and edge-cache headers. This describes checked-in route behavior, not live deployment or cache state.

## Overlay buckets

Reviewed cloud source overlays:

| Bucket | Purpose |
|---|---|
| `top` | Top-level Kappa keys and overrides |
| `agents` | Kappa primary agents under `agent` |
| `experimental` | Kappa experimental keys under `experimental` |

Nested CLI fields outside these buckets need dedicated overlay bucket and matching `merge()` logic.

## Failure mode

If cloud overlay misses valid CLI field, CLI can accept config while editor reports `unknown property`. Opposite drift is also possible: cloud schema can advertise field that runtime no longer accepts.

Treat schema synchronization as cross-repository contract. Tests should detect both missing valid fields and stale overlay entries. Keep branch-specific drift findings in tracked issues or test output, not this architecture page.

## Adding or changing Kappa-only config key

1. Add or update Effect Schema field with `kappacode_change` marker in `packages/cli/src/config/config.ts`.
2. Generate JSON Schema shape:

```sh
bun --bun packages/cli/script/schema.ts /tmp/kappa.json
jq '.properties.<new_key>' /tmp/kappa.json
```

3. Update matching bucket in `apps/web/src/app/config.json/extras.ts` in [cloud repo](https://github.com/Kappa-Org/cloud).
4. Extend `merge()` in `apps/web/src/app/config.json/route.ts` when new nested bucket is required.
5. Add assertion in `apps/web/src/tests/cli-config-schema.test.ts`.
6. Audit stale overlay entries as well as missing additions.

{% callout type="warning" title="Cross-repository change" %}
CLI schema source lives in `Kappa-Org/kappacode`. Public editor schema overlay lives in `Kappa-Org/cloud`. Config-key change is incomplete until both repositories agree.
{% /callout %}

## Source map

Repository column identifies source root for each relative path.

| Repository | Source path | Role |
|---|---|---|
| `Kappa-Org/kappacode` | `packages/cli/src/config/config.ts` | Canonical Effect Schema and derived `.zod` surface |
| `Kappa-Org/cloud` | `apps/web/src/app/config.json/route.ts` | Cloud overlay route |
| `Kappa-Org/cloud` | `apps/web/src/app/config.json/extras.ts` | Kappa overlay buckets |
| `Kappa-Org/cloud` | `apps/web/src/tests/cli-config-schema.test.ts` | Cloud schema assertions |

## Related pages

- [CLI Runtime](/docs/contributing/architecture/cli-runtime#config-precedence) - runtime config loading and precedence
- [Development Patterns](/docs/contributing/architecture/development-patterns) - shared-file markers, Kappa-owned boundaries, and cross-repository contributor workflow
