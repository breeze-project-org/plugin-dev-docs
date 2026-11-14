# breeze-plugin-kit Toolkit

`breeze-plugin-kit` is the official Breeze plugin toolkit. It includes:

1. **TypeScript type declarations**: contract types for every `fnPath` and runtime global API types.
2. **Common helpers**: wrappers over `bridge` routes such as `cache`, `pluginConfig`, `opencc`, `flutterTools`, `runtime`, and `pictureTools`.

The example repository ships it as a standalone npm package that new plugins can install directly.

## Install

```bash
pnpm add breeze-plugin-kit
```

Ensure `tsconfig.json` can resolve ESM:

```json
{
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler"
  }
}
```

## Using Types

All plugin contract types are exported from the package entry:

```ts
import type {
  InfoContract,
  SearchComicPayload,
  SearchResultContract,
  ComicDetailContract,
  PreviewPayload,
  PreviewContentContract,
  ChapterContentContract,
  ReadSnapshotContract,
  FetchImageBytesPayload,
  ToggleLikePayload,
  ToggleFavoritePayload,
  CommentFeedContract,
  CommentPostPayload,
  AdvancedSearchContract,
  ComicListSceneBundleContract,
  FilterBundleContract,
  SettingsBundleContract,
  CapabilitiesBundleContract,
  UserInfoBundleContract,
  FunctionPageContract,
  LoginBundleContract,
  LoginBundleInit,
  LoginField,
  LoginSubmitPayload,
} from "breeze-plugin-kit";
```

Runtime global types are also injected automatically — e.g. `bridge`, `crypto`, `native`, `Temporal`, `Intl`, `BreezeHtml`, `bytesToBase64`, `bytesFromBase64` — no extra declarations needed.

`FilterField.kind` supports `"choice"` and `"dropdown"`; use `"dropdown"` for long lists (e.g. weekly issue numbers) — the filter function still returns `FilterBundleContract`.

### Temporal Types

After installing `breeze-plugin-kit`, use global `Temporal` with IDE completion and type checks:

```ts
const d: Temporal.PlainDate = Temporal.PlainDate.from("2024-03-15");
const zdt: Temporal.ZonedDateTime =
  Temporal.Now.zonedDateTimeISO("Asia/Shanghai");
const instant: Temporal.Instant = new Date().toTemporalInstant();
```

Full runtime notes: [Runtime API · Temporal](/guide/runtime-api/time-and-intl#temporal).

### Time-focused Intl Types

The host provides time-focused `Intl.DateTimeFormat` (no Collator / NumberFormat). Types are injected automatically:

```ts
const text = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "long",
  timeZone: "Asia/Shanghai",
}).format(Date.now());

const zones = Intl.supportedValuesOf("timeZone"); // string[]
```

Full notes: [Runtime API · Intl](/guide/runtime-api/time-and-intl#intl).

To type the return value of `BreezeHtml.load()`, import compatibility aliases:

```ts
import type { CheerioAPI, Cheerio } from "breeze-plugin-kit";

function parseSearchPage(html: string): ComicListItem[] {
  const $: CheerioAPI = BreezeHtml.load(html);

  return $(".item")
    .map((_, el) => {
      const $el: Cheerio = $(el);
      // ...
    })
    .get();
}
```

## HTML Parsing

`breeze-plugin-kit` provides full TypeScript support for `BreezeHtml`. `BreezeHtml` is the Rust-native HTML parser injected by the Breeze runtime, with an API compatible with a common cheerio subset.

### Why Prefer BreezeHtml

- **No bundling**: provided by the runtime; no need to ship cheerio in the bundle.
- **Better performance**: Rust-backed parsing is typically faster than pure JS parsers.
- **Type-friendly**: `CheerioAPI` / `Cheerio` compatibility aliases.

### Typical Usage

```ts
import type { CheerioAPI, ComicListItem } from "breeze-plugin-kit";

function parseList(html: string): ComicListItem[] {
  const $: CheerioAPI = BreezeHtml.load(html);

  return $(".comic-list > li")
    .map((_, el) => {
      const $el = $(el);
      return {
        source: PLUGIN_ID,
        id: $el.attr("data-id") ?? "",
        title: $el.find(".title").text().trim(),
        // ... other fields
      };
    })
    .get();
}
```

### Migrating from cheerio

Existing cheerio plugins usually only need to change:

```ts
import * as cheerio from "cheerio";
const $ = cheerio.load(html);
```

to:

```ts
const $ = BreezeHtml.load(html);
```

and import types from `import type { CheerioAPI, Cheerio } from "breeze-plugin-kit"`.

> `BreezeHtml` does not implement every advanced cheerio feature. If you need them, you can still bundle full cheerio.

## Helpers

### `cache` — In-Process Cache

Cache lifetime follows the **host app process**, not a single QuickJS instance. Even if the QJS instance is destroyed or the plugin hot-reloads, cache data remains until the Breeze app itself restarts. Suitable for short-lived results across pages/calls.

```ts
import { cache } from "breeze-plugin-kit";

async function searchComic(payload: SearchComicPayload) {
  const cacheKey = `search:${payload.keyword}:${payload.page}`;

  const cached = await cache.get<SearchResultContract | null>(cacheKey, null);
  if (cached) return cached;

  const result = await fetchSearchResult(payload);
  await cache.set(cacheKey, result);
  return result;
}
```

Methods:

| Method                                     | Description          |
| ------------------------------------------ | -------------------- |
| `cache.get<T>(key, fallback)`              | Async read           |
| `cache.getSync(key, fallback)`             | Sync read            |
| `cache.set(key, value)`                    | Async write          |
| `cache.setSync(key, value)`                | Sync write           |
| `cache.setIfAbsent(key, value)`            | Write only if absent |
| `cache.compareAndSet(key, expected, next)` | CAS update           |
| `cache.delete(key)`                        | Delete               |

### `pluginConfig` — Persistent Config

Config is persisted in the host database across restarts. Use for accounts, theme, quality, etc.

```ts
import { pluginConfig } from "breeze-plugin-kit";

// Save
await pluginConfig.save("auth.account", JSON.stringify({ value: "user" }));

// Load: returns '{"ok":true,"value":...}' string; JSON.parse required
const raw = await pluginConfig.load("auth.account", "");
const { value } = JSON.parse(raw);
```

> Note: `save` `value` is a string. The Dart side tries `jsonDecode`: on success it stores the decoded value; on failure it stores the raw string.

### `authConfig` / Login Helpers — Login Forms & need-login Errors

`authConfig` is a string-friendly wrapper over `pluginConfig` that handles ok-envelope
encode/decode, so account/password access needs no manual `JSON.parse` / `JSON.stringify`:

```ts
import { authConfig } from "breeze-plugin-kit";

await authConfig.save("auth.account", account);
const account = await authConfig.load("auth.account", "");
```

Full login helpers (see API Contract §6.5 Login):

```ts
import {
  authConfig,
  buildLoginBundle,
  buildUnauthorizedError,
  readLoginValues,
} from "breeze-plugin-kit";
import type {
  LoginBundleContract,
  LoginBundleInit,
  LoginSubmitPayload,
} from "breeze-plugin-kit";

async function getLoginBundle(): Promise<LoginBundleContract> {
  return buildLoginBundle(PLUGIN_ID, {
    title: "Example login",
    fields: [
      { key: "account", kind: "text", label: "Username", required: true },
      { key: "password", kind: "password", label: "Password", required: true },
    ],
    submitFnPath: "loginWithPassword",
    values: { account: await authConfig.load("auth.account") },
  } satisfies LoginBundleInit);
}

async function loginWithPassword(payload: LoginSubmitPayload = {}) {
  const { account, password } = readLoginValues(payload);
  // ... call the login API, then persist on success
  await authConfig.save("auth.account", account);
  await authConfig.save("auth.password", password);
}

// At auth failures:
throw buildUnauthorizedError(PLUGIN_ID, "Login expired, please log in again");
```

| Export | Description |
| ------ | ----------- |
| `readLoginValues(payload)` | Extract form values from `core.values` |
| `buildLoginBundle(source, init)` | Build the `getLoginBundle` return value |
| `buildUnauthorizedError(source, message?)` | Build a host-recognized need-login error |
| `authConfig.load/save` | Persistent config access with encode/decode |
### `runtime` — Runtime Utilities

```ts
import { runtime } from "breeze-plugin-kit";

// Trigger host GC
await runtime.gc();

// Check whether a download task group was cancelled
const cancelled = await runtime.isTaskGroupCancelled(taskGroupKey);
if (cancelled) return new Uint8Array(0);
```

### `opencc` — Simplified/Traditional Conversion

```ts
import { opencc } from "breeze-plugin-kit";

const simplified = await opencc.convert("繁體字", "t2s.json");
// returns "繁体字"
```

Supported config files:

- `s2t.json`: Simplified → Traditional
- `t2s.json`: Traditional → Simplified
- `s2tw.json`: Simplified → Taiwan Traditional
- `tw2s.json`: Taiwan Traditional → Simplified
- `s2hk.json`: Simplified → Hong Kong Traditional
- `hk2s.json`: Hong Kong Traditional → Simplified

### `flutterTools` — Flutter Host Interaction

```ts
import { flutterTools } from "breeze-plugin-kit";

// App version
const version = await flutterTools.getAppVersion();

// Locale and time zone info (JSON string; JSON.parse required)
const raw = await flutterTools.getLocaleInfo();
const info = JSON.parse(raw);
console.log(info.language); // "zh"
console.log(info.locale); // "zh-CN"
console.log(info.systemLocale); // "zh-CN"
console.log(info.timeZone); // "Asia/Shanghai"
console.log(info.timezoneOffset); // "+08:00"
console.log(info.timezoneOffsetMinutes); // 480
console.log(info.timezoneName); // "CST"

// Toast
await flutterTools.showToast({
  message: "Saved",
  title: "Notice",
  seconds: 2,
  level: "success", // "info" | "success" | "warning" | "error"
});
```

`getLocaleInfo` fields:

| Field                   | Type     | Description                                            |
| ----------------------- | -------- | ------------------------------------------------------ |
| `language`              | `string` | App language code, e.g. `zh` / `en`                    |
| `locale`                | `string` | App locale as `languageCode_COUNTRYCODE`, e.g. `zh-CN` |
| `systemLocale`          | `string` | Preferred system locale raw string, e.g. `zh-CN`       |
| `timeZone`              | `string` | IANA time zone, e.g. `Asia/Shanghai`                   |
| `timeZoneIANA`          | `string` | Same as `timeZone`                                     |
| `timezoneOffset`        | `string` | Offset string, e.g. `+08:00` / `-05:00`                |
| `timezoneOffsetMinutes` | `number` | Offset in minutes                                      |
| `timezoneName`          | `string` | System zone abbreviation, e.g. `CST` / `EST`           |

### `fronting` — Host Fronting & Network Measurement {#fronting}

The host provides host fronting (IP direct): requests are rewritten into "connect to the real IP + send no SNI + carry a `Host` header", which bypasses DNS poisoning and SNI blocking.

```ts
import {
  clearFrontHosts,
  getFrontHosts,
  pickBestFrontIps,
  probeFrontHosts,
  setFrontHosts,
} from "breeze-plugin-kit";

// Install a built-in table: values are IP literals, IPv6 bare or in [...]
setFrontHosts({ "e-hentai.org": ["172.66.132.196", "2606:4700::1"] });

// Read back the table plus per-IP health (healthy=false means 5-min cooldown)
const table = getFrontHosts();

// Probe candidate IPs (no prior registration needed)
const report = await probeFrontHosts({
  host: "e-hentai.org",
  ips: ["172.66.132.196", "172.66.140.62"],
  samples: 2,
});

// Write back the best few
const best = pickBestFrontIps(report, { limit: 3, maxLossRate: 0.34 });
if (best.length > 0) setFrontHosts({ "e-hentai.org": best });

// Disable fronting
clearFrontHosts();
```

| Export | Notes |
| --- | --- |
| `setFrontHosts(table)` | Install the front table; returns `{ ok, hosts, ips, rejected, allowPrivateNetwork }` |
| `getFrontHosts()` | Read back the table and per-IP health |
| `clearFrontHosts()` | Clear the front table (same as disabling) |
| `probeFrontHosts(payload, { signal })` | Probe latency; returns `{ ok, results }` and supports `AbortSignal` cancellation |
| `rankFrontHosts(report, opts)` / `pickBestFrontIps(report, opts)` | Filter unusable IPs and sort by latency |
| `setEchHosts(table)` / `getEchHosts()` / `clearEchHosts()` | Register domains for ECH (encrypted SNI); for Cloudflare sites that require SNI |

Full parameters, response fields, error codes and rate limits are in [Host Fronting & Network Measurement](/guide/runtime-api/network-fronting#front-probe). Rate limits are per plugin (4 concurrent samples, 2 concurrent batches) — do not treat probing as a high-frequency polling API.

ECH usage (both ECHConfig and IPs are optional; the host fills them in via DoH HTTPS records):

```ts
import { setEchHosts } from "breeze-plugin-kit";

setEchHosts({ "picaapi.part26.art": {} });
```

Difference from fronting: fronting sends no SNI plus a `Host` header; ECH encrypts SNI and keeps the domain URL. Do not register the same domain for both. See [Host Fronting & Network Measurement · ECH](/guide/runtime-api/network-fronting#ech).

If you prefer not to depend on the kit, the runtime also injects a `fronting` object (`fronting.setHosts` / `getHosts` / `clearHosts` / `probe` / `setEchHosts`) with the same parameters and return values.

`hostMeta` on `fetch` responses is typed by the kit (`HostMeta`) and reports the IP actually used plus split timings:

```ts
const res = await fetch(url);
const meta = res.hostMeta;
if (meta?.ip && meta.bodyMs > 0) {
  throughput.set(meta.ip, meta.bytes / meta.bodyMs);
}
```

| Field | Notes |
| --- | --- |
| `ip` / `host` | Fronted IP / domain for this request; `null` when not fronted |
| `peerIp` | Actual TCP peer IP (the proxy address when a proxy is used) |
| `bytes` | Response body size |
| `ttfbMs` | Request sent → response headers (connect + TLS handshake + first byte) |
| `bodyMs` | Headers → body fully read; `bytes / bodyMs` is this request's throughput |

### `pictureTools.cropImageByRegions` — Crop Image Regions

`cropImageByRegions` cuts multiple regions from one image into independent images. The coordinate origin is the top-left corner of the source image. Each returned `imgData` contains WebP bytes.

```ts
import { pictureTools } from "breeze-plugin-kit";
import type { ImageCropRegion } from "breeze-plugin-kit";

async function cropImage(imageData: Uint8Array) {
  const regions: ImageCropRegion[] = [
    { number: 1, x: 0, y: 0, width: 200, height: 300 },
    { number: 2, x: 200, y: 0, width: 200, height: 300 },
  ];

  const images = await pictureTools.cropImageByRegions(imageData, regions);
  for (const image of images) {
    console.log(image.number, image.imgData); // Uint8Array containing WebP bytes
  }
  return images;
}
```

Inputs:

- `imageData`: source image bytes as `Uint8Array`, `ArrayBuffer`, `ArrayBufferView`, or `number[]`.
- `regions`: crop regions; each item contains an identifier `number`, top-left coordinates `x` / `y`, and dimensions `width` / `height`.

The function returns a Promise whose items contain `number` and `imgData: Uint8Array`; each number corresponds to its input region.

### `crypto` — Encryption / Decryption

> ⚠️ **Important: Breeze `crypto` is neither Web Crypto API nor Node.js `crypto`.** It is a custom object injected by the Breeze runtime. **Do not use global `crypto` directly** — TypeScript / tsserver will infer Web/Node types and mismatch runtime behavior.
>
> Always obtain it via `breeze-plugin-kit`:

```ts
import { requireCryptoLike, hostRuntime } from "breeze-plugin-kit";

// Recommended: Breeze runtime crypto
const crypto = requireCryptoLike();

// Or via hostRuntime
const crypto = hostRuntime.crypto;
```

Common methods:

```ts
// Digests
const md5 = await crypto.md5("hello");
const sha256 = await crypto.sha256("hello");
const hmac = await crypto.hmacSha256("key", "hello");

// AES-CBC-PKCS7 (input string / Uint8Array / etc.; output Uint8Array)
const encrypted = await crypto.aesCbcPkcs7Encrypt(plainText, key, iv);
const decrypted = await crypto.aesCbcPkcs7Decrypt(encrypted, key, iv);

// AES-GCM
const encrypted = await crypto.aesGcmEncrypt(plainText, key, nonce, aad);
const decrypted = await crypto.aesGcmDecrypt(encrypted, key, nonce, aad);

// AES-ECB-PKCS7 (encrypt and decrypt; ECB is weak — avoid for new data)
const encrypted = await crypto.aesEcbPkcs7Encrypt(plainText, key);
const decrypted = await crypto.aesEcbPkcs7Decrypt(encrypted, key);

// Streaming hash
const hash = crypto.createHash("sha256").update("hello").digest("hex");

// Random
const buf = crypto.randomBytes(16);
const uuid = crypto.randomUUID();
```

For Base64, pair with the global `bytesToBase64` / `bytesFromBase64`
(injected by the runtime, no import needed; `breeze-plugin-kit` only provides their types):

```ts
import { requireCryptoLike } from "breeze-plugin-kit";

const crypto = requireCryptoLike();

const encrypted = await crypto.aesCbcPkcs7Encrypt("hello", key, iv);
const b64 = bytesToBase64(encrypted);

const decrypted = await crypto.aesCbcPkcs7Decrypt(
  bytesFromBase64(b64),
  key,
  iv,
);
```

If you prefer Base64-input helpers, deprecated wrappers on `hostRuntime` still exist:

```ts
import { hostRuntime } from "breeze-plugin-kit";

const plainB64 = await hostRuntime.aesCbcPkcs7DecryptB64(b64Cipher, key, iv);
```

> New plugins should prefer `crypto.aesCbcPkcs7Encrypt` / `crypto.aesCbcPkcs7Decrypt`.

## Runtime API Wrappers

If you prefer not to touch globals, use `hostRuntime`, `getApi`, `requireApi`, and `requireCryptoLike`:

```ts
import {
  hostRuntime,
  getApi,
  requireApi,
  requireCryptoLike,
} from "breeze-plugin-kit";

// Require an API (throws if missing)
const bridge = requireApi("bridge");

// Get crypto (compatible with globalThis.crypto and runtime injection)
const crypto = requireCryptoLike();

// hostRuntime helpers
const md5 = await hostRuntime.md5Hex("hello");
const compressed = await hostRuntime.gzipCompress(new Uint8Array([1, 2, 3]));
```

> `@deprecated` methods on `hostRuntime` exist for legacy code; new plugins should use `crypto.*` or `bridge.call`.

> ⚠️ **Note: `fs` has type declarations but Breeze does not inject `fs` into plugins.** This is intentional for security. Use `fetch` and other network APIs — do not use `getApi("fs")` or `hostRuntime.fs`.

## Combining in Settings Callbacks

```ts
import { pluginConfig, flutterTools } from "breeze-plugin-kit";

async function onThemeChanged(payload: SettingChangedPayload<string>) {
  await pluginConfig.save(
    payload.key,
    JSON.stringify({ value: payload.value }),
  );

  await flutterTools.showToast({
    message: `Theme switched to ${payload.value}`,
    level: "info",
    seconds: 2,
  });

  return {};
}
```

## Full Example: Download Image

```ts
import { runtime } from "breeze-plugin-kit";

async function fetchImageBytes({
  url,
  timeoutMs = 30000,
  taskGroupKey = "",
}: FetchImageBytesPayload): Promise<Uint8Array> {
  if (taskGroupKey && (await runtime.isTaskGroupCancelled(taskGroupKey))) {
    return new Uint8Array(0);
  }

  const res = await fetch(url, {
    // Required: force host to return raw binary image bytes
    headers: { "x-rquickjs-host-offload-binary-v1": "1" },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    throw new Error(`Download failed: ${res.status}`);
  }

  return new Uint8Array(await res.arrayBuffer());
}
```

> Without `x-rquickjs-host-offload-binary-v1: 1`, the host may stringify or re-encode the response so the `Uint8Array` is not raw image data, causing decode failures, blank images, or wrong dimensions.

## Best Practices

- **`cache` lifetime follows the host process** — good for short-lived data across QJS instances; use `pluginConfig` for data that must survive app restarts.
- **`pluginConfig.save` values are strings** — `JSON.stringify` objects before saving.
- **`pluginConfig.load` results also need `JSON.parse`** to read `value`.
- **`ImageItem.url` must be a valid non-empty string**, even when the plugin handles downloads itself.
- **`fetchImageBytes` must send `x-rquickjs-host-offload-binary-v1: 1`** for raw binary image data.
- **Check `runtime.isTaskGroupCancelled` before download** to stop cancelled task groups.
