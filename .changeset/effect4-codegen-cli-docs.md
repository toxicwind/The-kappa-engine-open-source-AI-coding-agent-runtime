---
"@opencode-ai/httpapi-codegen": patch
"@kappacode/cli": patch
"@kappacode/kappa-docs": patch
"@opencode-ai/llm": patch
"@opencode-ai/codemode": patch
"@opencode-ai/protocol": patch
"@opencode-ai/server": patch
"@opencode-ai/core": patch
---

Restore client generation and package typechecks under Effect 4: expand bare class declarations and restore the Schema.Json rendering in Promise types, drop the unresolvable OpenTelemetry import in the CLI agent, declare the docsearch CSS module for the docs typecheck, fix the LLM package's Effect 4 renames, class static overrides, SSE error mapping, and closed tool schemas, collapse Effect 4's merged number sentinels in codemode's TypeScript renderer, and migrate core to Effect 4's capitalized Config constructors, bigint file metadata, new sqlite connection/client members, plain-boolean flags, OTLP Flusher wiring, object-form schedule bounds, and representation-based Zod filter translation with order-preserving permission decode.
