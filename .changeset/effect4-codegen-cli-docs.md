---
"@opencode-ai/httpapi-codegen": patch
"@kappacode/cli": patch
"@kappacode/kappa-docs": patch
"@opencode-ai/llm": patch
"@opencode-ai/codemode": patch
"@opencode-ai/protocol": patch
"@opencode-ai/server": patch
---

Restore client generation and package typechecks under Effect 4: expand bare class declarations and restore the Schema.Json rendering in Promise types, drop the unresolvable OpenTelemetry import in the CLI agent, declare the docsearch CSS module for the docs typecheck, fix the LLM package's Effect 4 renames, class static overrides, SSE error mapping, and closed tool schemas, and collapse Effect 4's merged number sentinels in codemode's TypeScript renderer.
