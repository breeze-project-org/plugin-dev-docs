---
id: runtime-api
slug: /guide/runtime-api
sidebar_label: Runtime API Overview
---

# Runtime API

Breeze plugins run in the QuickJS-NG engine — not Node.js and not a browser.
Below are the extra globals provided by the runtime beyond standard ECMAScript.


## Global Objects

Globals available after plugin startup:

- `fetch` / `Request` / `Response` / `Headers`
- `AbortController` / `AbortSignal`
- `URL` / `URLSearchParams`
- `Blob` / `File` / `FormData`
- `structuredClone`
- `console`
- `crypto`
- `TextEncoder` / `TextDecoder`
- `Buffer`
- `path`
- `native`
- `bridge`
- `uuidv4`
- `Temporal`
- `Intl` (time-focused subset; see [Temporal & Intl](/guide/runtime-api/time-and-intl#intl))
- `BreezeHtml`
- `bytesToBase64` / `bytesFromBase64`
- `hostCrypto`
- `__web`
- `fronting` (host fronting: `setHosts` / `getHosts` / `clearHosts` / `probe`)

> ⚠️ **Note: `fs` is not available.** `breeze-plugin-kit` keeps `fs` type declarations for running plugin code in pure Node.js test environments, but Breeze **does not inject an `fs` API into the real plugin runtime**. This is intentional for security: direct host filesystem access is too risky. Plugins should talk to the outside world via `fetch` and similar network APIs — do not use `fs` in plugins.

## Subchapters

Choose a focused page below when you need a specific runtime API.

- [Core Runtime APIs](/guide/runtime-api/core)
- [Crypto API](/guide/runtime-api/crypto)
- [Temporal & Intl](/guide/runtime-api/time-and-intl)
- [Built-ins & Utilities](/guide/runtime-api/built-ins)
- [BreezeHtml & Development Pattern](/guide/runtime-api/html-and-patterns)
- [Host Fronting & Network Measurement](/guide/runtime-api/network-fronting) (IP direct, latency probing, `Response.hostMeta`)
