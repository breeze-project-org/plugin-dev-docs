---
sidebar_label: BreezeHtml & Development Pattern
---

# BreezeHtml & Development Pattern

## Type Definitions

Types are provided by the `breeze-plugin-kit` package:

```bash
pnpm add breeze-plugin-kit
```

```ts
import type {
  SearchResultContract,
  ComicDetailContract,
} from "breeze-plugin-kit";
```

Main modules:

- Request/response shapes for every plugin `fnPath`
- Runtime global types (`bridge`, `crypto`, `native`, `Temporal`, `Intl`, `fs`, etc.)
- Helpers such as `hostRuntime`, `getApi`, `requireApi`

See [breeze-plugin-kit Toolkit](/guide/plugin-kit).

## Convenience Wrappers

`breeze-plugin-kit` provides wrappers for common needs:

- `cache.*` — in-process cache (lifetime follows host process)
- `pluginConfig.*` — persistent config
- `opencc.*` — Simplified/Traditional Chinese conversion
- `flutterTools.*` — Flutter host interaction (Toast, version, etc.)
- `setFrontHosts` / `probeFrontHosts` / `pickBestFrontIps` — host fronting (IP direct) and latency probing
- `runtime.*` — runtime utilities (GC, task-group cancel checks, etc.)

Details: [breeze-plugin-kit Toolkit](/guide/plugin-kit).

## Common Usage

```ts
import { requireCryptoLike } from "breeze-plugin-kit";

const crypto = requireCryptoLike();
const encoder = new TextEncoder();

// 1. fetch data
const res = await fetch("https://api.example.com/list");
const data = await res.json();

// 2. crypto digest
const md5 = await crypto.md5(encoder.encode("data"));
const sha256 = crypto
  .createHash("sha256")
  .update(encoder.encode("data"))
  .digest("hex");

// 3. console logging
console.log("result:", data);
```

## BreezeHtml

`BreezeHtml` is a **Rust-native HTML parse & manipulate API** injected by the Breeze runtime. It implements a common cheerio subset. For plugins that parse HTML pages (lists, details, chapters), prefer it over bundling cheerio-like libraries — smaller bundles and better parse performance.

### Basic Usage

```ts
const $ = BreezeHtml.load(html);

// Select elements
const title = $("title").text();
const links = $("a")
  .map((_, el) => $(el).attr("href"))
  .get()
  .filter(Boolean);
```

### Supported API

| Method | Description |
| ------ | ----------- |
| `BreezeHtml.load(html)` | Load HTML string; returns `$` selector |
| `$(selector)` | Find elements by CSS selector |
| `.find(selector)` | Find within current selection |
| `.first()` / `.last()` / `.eq(i)` | Pick nth match |
| `.closest(selector)` / `.parent()` / `.children(sel?)` / `.siblings(sel?)` / `.next(sel?)` / `.prev(sel?)` | DOM traversal |
| `.is(selector)` | Match test |
| `.filter(selector \| fn)` / `.has(selector)` / `.slice(start, end?)` / `.index()` | Filter & index |
| `.attr(name)` | Read attribute |
| `.text()` | Read plain text |
| `.html()` | Read HTML string |
| `.val()` | Read form value |
| `.toArray()` | Selection as array |
| `.each(fn)` | Iterate matches |
| `.map(fn)` | Map matches; `get()` for result array |

### Full Example: Parse Search List

```ts
import type { CheerioAPI, ComicListItem } from "breeze-plugin-kit";

function parseSearchHtml(html: string): ComicListItem[] {
  const $ = BreezeHtml.load(html);

  return $(".comic-item")
    .map((_, element) => {
      const $el = $(element);
      const id = $el.attr("data-id") ?? "";
      const title = $el.find(".title").text().trim();
      const cover = $el.find("img").attr("src") ?? "";

      return {
        source: PLUGIN_ID,
        id,
        title,
        subtitle: "",
        finished: false,
        likesCount: 0,
        viewsCount: 0,
        updatedAt: "",
        cover: {
          id,
          url: cover || "https://example.com/placeholder.jpg",
          name: "cover",
          path: cover || "https://example.com/placeholder.jpg",
          extern: {},
        },
        metadata: [],
        raw: {},
        extern: {},
      };
    })
    .get()
    .filter((item) => item.id && item.title);
}
```

### Relationship to cheerio

- `BreezeHtml` is not full cheerio; it covers selectors and traversal common in plugin work.
- For advanced cheerio features (complex DOM mutation, serialization control), you may still install and bundle cheerio.
- `breeze-plugin-kit` provides aliases: `CheerioAPI` → `BreezeApi`, `Cheerio` → `BreezeSelection`, for easier migration.

### TypeScript Types

`breeze-plugin-kit` injects global `BreezeHtml` types automatically:

```ts
import type { CheerioAPI, Cheerio } from "breeze-plugin-kit";
```

## Full Development Pattern

A typical plugin API combines these runtime APIs:

```ts
import {
  requireCryptoLike,
  bytesToBase64,
  bytesFromBase64,
} from "breeze-plugin-kit";
import type {
  SearchComicPayload,
  SearchResultContract,
} from "breeze-plugin-kit";

const crypto = requireCryptoLike();

async function searchComic(
  payload: SearchComicPayload,
): Promise<SearchResultContract> {
  // 1. Build request
  const url = `https://api.example.com/search?q=${encodeURIComponent(payload.keyword ?? "")}&page=${payload.page ?? 1}`;

  // 2. Fetch HTML
  const res = await fetch(url);
  const html = await res.text();

  // 3. Parse with BreezeHtml
  const $ = BreezeHtml.load(html);
  const items = $(".item")
    .map((_, el) => {
      const $el = $(el);
      return {
        id: $el.attr("data-id") ?? "",
        title: $el.find(".title").text().trim(),
        coverUrl: $el.find("img").attr("src") ?? "",
      };
    })
    .get();

  // 4. Digest / encrypt if needed
  const sign = await crypto.md5(url);

  // ... assemble SearchResultContract
}
```
