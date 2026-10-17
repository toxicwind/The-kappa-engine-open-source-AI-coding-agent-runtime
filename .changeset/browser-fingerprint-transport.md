---
"@kilocode/cli": minor
---

Add a browser fingerprint HTTP transport so the CLI can reach Cloudflare-guarded inference providers (e.g. `freeinference.org` returning 403 1010). Opt any provider in with `"http": { "fingerprint": "chrome" }`; Kilo then forwards with Chrome-aligned headers and a browser HTTP signature instead of the runtime default.