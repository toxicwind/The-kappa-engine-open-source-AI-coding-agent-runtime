---
"@kappacode/cli": patch
---

Fix stalled retries on OpenRouter privacy/guardrail blocks: a `404` carrying OpenRouter's policy-block metadata (`failed_routing_step: "Filter by Guardrails"` or an `ineligibility_reasons[].reason` of `model-ignored-by-guardrail` / `zdr-violation-by-account` / `zdr-violation-by-guardrail`) is now treated as a permanent model-block and fails fast (or triggers model fallback immediately) instead of retrying three times and reporting "Retry budget exhausted after 3 retries: 404". The error message now tells you the model is blocked by your account privacy settings and points to openrouter.ai/settings/privacy.
