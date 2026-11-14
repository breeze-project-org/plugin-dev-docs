# Plugin API Contract

TypeScript types and call semantics for every Breeze plugin `fnPath`.

## 0. Common Conventions

### 0.1 Input Model

The host always passes a flat object. Primary business fields at the top level; passthrough fields in `extern`:

```ts
// Generic payload model
type PluginPayload<T extends Record<string, unknown>> = T & {
  extern?: Record<string, unknown>;
};
```

Example `searchComic` signature:

```ts
import type { SearchComicPayload, SearchResultContract } from "breeze-plugin-kit";

async function searchComic(payload: SearchComicPayload): Promise<SearchResultContract> {}
```

All parameter types come from `breeze-plugin-kit`. Each `fnPath` below notes its Payload and return type.

### 0.2 Return Model

Most APIs return a unified envelope:

```ts
type PluginEnvelope = {
  source: string;                       // plugin ID
  scheme?: Record<string, unknown>;     // page render protocol
  data?: Record<string, unknown>;       // business data
  extern?: Record<string, unknown>;     // passthrough context
  [key: string]: unknown;               // other flat fields (comicId, paging, etc.)
};
```

The host uses `scheme` for “what the page looks like” and `data` for “what the values are”. Fill fields by type.

### 0.3 Error Handling

- Return values must be JSON-serializable objects (non-objects trigger “invalid return format”)
- Thrown `Error` strings are shown directly in the client
- Always return `source` when possible for easier debugging

### 0.4 `init` (Optional)

The host may call `init` after runtime start. Skip if unimplemented. If implemented, prefer `{ source, data: { ok: true } }`.

Note: on hot reload the QJS instance is rebuilt and `init` runs again. Do not use `init` for one-time-only setup.

### 0.5 Type Sources

All types come from `breeze-plugin-kit`. Payload and Contract types below can be imported from that package.

---

## 1. fnPath Overview

Host-invoked functions are triggered by scene; callbacks are invoked by the host when the user acts in the UI.

| fnPath | When triggered |
| ------ | -------------- |
| `getInfo` | Discover page loads plugin card |
| `searchComic` | Search keyword / page / advanced search |
| `getComicDetail` | Open comic detail |
| `getPreview` | Load comic previews on the detail page |
| `getReadSnapshot` | Reader init / chapter switch |
| `getChapter` | Download chapter content |
| `getDownloadConcurrency` | Get image download concurrency before downloading a chapter |
| `fetchImageBytes` | Read/download image binary |
| `toggleLike` | Like on detail page |
| ~~`toggleFavorite`~~ ⚠️Deprecated | Legacy detail-page favorite compat entry; do not implement, use `startFavoriteAction` |
| ~~`listFavoriteFolders`~~ ⚠️Deprecated | Legacy post-favorite folder picker; do not implement, use `startFavoriteAction` |
| ~~`moveFavoriteToFolder`~~ ⚠️Deprecated | Legacy user-confirmed folder move; do not implement, use `startFavoriteAction` |
| `getCommentFeed` | Open comments / page |
| `loadCommentReplies` | Expand comment replies |
| `postComment` | Post main comment |
| `postCommentReply` | Reply to a comment |
| `getAdvancedSearchScheme` | Open advanced search filters |
| `getComicListSceneBundle` | Discover default list by source |
| `getFunctionPage` | Custom page after tapping a function entry |
| `getRankingData` (example name) | List page body request (actual name from `scene.body.request.fnPath`) |
| `getRankingFilterBundle` (example name, optional) | List page filter button (only when `scene` sets `filter.fnPath`) |

Callbacks: plugins set `fnPath` on settings / capabilities; the host calls them on user action:

| fnPath | When |
| ------ | ---- |
| `onAuthChanged` etc. | Settings field changed |
| `clearPluginCache` | Capability action button clicked |

---

## 2. Core APIs

### `getInfo()` (types: `InfoContract` in kit)

Returns plugin metadata and feature entries.

```ts
import type { InfoContract } from "breeze-plugin-kit";

async function getInfo(): Promise<InfoContract> {}
```

```ts
type InfoContract = {
  name: string;
  uuid: string;
  iconUrl: string;
  describe: string;
  version: string;
  home?: string;
  /** Update channel: GitHub Release–like latest URL. Only api.github.com uses host proxies. */
  updateUrl?: string;
  /** Update channel: npm package name. Preferred for latest lookup and CDN download. */
  npmName?: string;
  function: PluginFunctionItem[];
};

// Update behavior: see Debug & Release → Plugin Updates.
// - Listed plugins: silent update uses catalog coordinates only
// - Unlisted plugins: silent update / Sync use getInfo npmName / updateUrl

type PluginFunctionItem = {
  /** Entry key shown as a Discover button. The outer `id` of `openPluginFunction` matches its `payload.id`. */
  id: string;
  /** Button label on the Discover page. */
  title: string;
  /** Action the host runs on tap. Authoritative shapes: `PluginAction` / `Open*Action` in breeze-plugin-kit. */
  action: PluginAction;
};
```

Prefer `openComicList` as feature entries. Examples: [Quick Start](/guide/quick-start).

Entry shapes are defined in this section; after tapping: list page style → `getRankingData(payload)`,
list filtering → `getRankingFilterBundle()` (example name, optional),
function page style → `getFunctionPage(payload)`, call chain → 6.5.
```ts
type PluginAction =
  // Open a paged comic list. `scene.body.request.fnPath` is the exported list data fn
  // (e.g. `getRankingData`), called per page by the host; the name is free to choose.
  // `scene.filter` is an optional filter config, only set when the list needs filtering:
  // once set, it must name a real callable filter fn (e.g. `getRankingFilterBundle`),
  // called when the user opens filtering. `core` holds fixed params,
  // `extern` holds passthrough context; merge rules: 6.2 / 6.5.
  | { type: "openComicList"; payload: { scene: ComicListScene } }
  // Open a custom plugin page. Also implement `getFunctionPage`, and `payload.id` must
  // match an `id` it handles, otherwise the host reports "unknown function".
  // `presentation` is `"page"` fullscreen or `"dialog"` popup. Layout nodes: see
  // `FunctionPageBodyNode` (`chip-list` / `action-grid` / `comic-section-list` / `comic-grid`);
  // grid taps usually route on to `openSearch` / `openComicList`.
  | {
      type: "openPluginFunction";
      payload: {
        id: string;
        title?: string;
        presentation?: "page" | "dialog";
        source?: string;
      };
    }
  // `openCloudFavorite` is deprecated, kept for compatibility only; new plugins needing a favorites entry use `openComicList` with their own list.
  | { type: "openCloudFavorite"; payload: { title: string; source?: string } }
  // `openSearch` as a function entry is deprecated, kept for compatibility only; new plugins need no search entry, search is provided by `searchComic`.
  // The same action remains usable as a detail-page metadata / titleMeta chip `onTap`.
  | {
      type: "openSearch";
      payload: { source?: string; keyword?: string; extern?: Record<string, unknown> };
    }
  // Jump straight to a comic. `comicId` is the target comic, `source` defaults to the
  // current plugin, `extern` is passthrough context.
  | {
      type: "openComicInfo";
      payload: {
        comicId: string;
        source?: string;
        extern: Record<string, unknown>;
      };
    }
  // Open the built-in WebView. `url` is the target, `title` the title.
  // Usually not a Discover entry; used in settings / capability callbacks for external pages.
  | { type: "openWeb"; payload: { title?: string; url: string } };

type ComicListScene = {
  title: string;
  source?: string; // conventionally the current plugin ID
  body: {
    type: "pluginPagedComicList";
    request: ComicListRequest;
  };
  filter?: ComicListRequest;
};

type ComicListRequest = {
  fnPath: string; // list data function name
  core?: Record<string, unknown>; // fixed request params
  extern?: Record<string, unknown>; // passthrough context
};
```

`function` field behavior:

- Empty array allowed: no Discover buttons for the plugin; search / detail still work.
- Independent of `getComicListSceneBundle`: the former is the "entry button group", the latter the "default Discover scene"; either one alone works.
- Editing `function` entries needs a reinstall to refresh; hot-reload does not pick it up (see Quick Start notes).
- `openSearch` as a function entry is deprecated, kept for compatibility only; new plugins need no search entry, search is provided by `searchComic`.
- `openCloudFavorite` is deprecated, kept for compatibility only; new plugins needing a favorites entry use `openComicList` with their own list.
- `openComicDetail` is deprecated, use `openComicInfo`.
- The `scene.list` shape is deprecated, use `scene.body.request`.

### `searchComic(payload)` (types: `SearchComicPayload` / `SearchResultContract` in kit)

```ts
import type {
  SearchComicPayload,
  SearchResultContract,
} from "breeze-plugin-kit";

async function searchComic(
  payload: SearchComicPayload,
): Promise<SearchResultContract> {}
```

```ts
type SearchComicPayload = {
  keyword?: string;
  page?: number;
  extern?: Record<string, unknown>;
  isSearchAggregate?: boolean;
};

type SearchResultContract = {
  source: string;
  extern: Record<string, unknown> | null;
  scheme: {
    version: "1.0.0";
    type: "searchResult";
    source: string;
    list: string;
  };
  data: { paging: PagingInfo; items: ComicListItem[] };
  paging: PagingInfo;
  items: ComicListItem[];
};

type PagingInfo = {
  page: number;
  pages: number;
  total: number;
  hasReachedMax: boolean;
};

type ComicListItem = {
  source: string;
  id: string;
  title: string;
  subtitle: string;
  finished: boolean;
  likesCount: number;
  viewsCount: number;
  updatedAt: string;
  cover: ImageItem;
  metadata: MetadataListItem[];
  raw: Record<string, unknown>;
  extern: Record<string, unknown>;
};
```

`extern` may include advanced search selections.

`extern` is passed through verbatim by the host: whatever the request carries,
the response can carry back, and the next request will carry it again. Besides
filter selections, plugins can use it to keep any custom state (paging cursors,
session info, …) — the host never reads or rewrites it.

One ready-made use is search bookmarks: when the user saves a bookmark from the
search result page (bottom-right button), the host records the `extern` at the
time; tapping the bookmark replays it, and if the anchor is not on the landed
page, the response `extern`'s `nextUrl` / `prevUrl` can be used to probe
neighboring pages. So cursor links, current-page URLs and the like can all ride
along in the response `extern` — the next request will have them.

#### Non-page-number pagination can also support search bookmarks

Pure page-number pagination (stable `page=N`, e.g. JM / Bika) can do nothing:
replay and probing re-request by `page` and results are naturally consistent.

URL-cursor pagination (next page via a server-returned link, e.g. E-hentai's
`?next=`), if you want bookmark jumps to land on the right page, can follow the
E-hentai example:

1. Carry `currentUrl` (this page's actual request URL), `nextUrl` (next page,
   empty string if none) and `prevUrl` (previous page, empty string if none) in
   the response `extern`, forming the chain.
2. On the bookmark replay request the host sets `isSearchAggregate: true` at the
   payload top level (see kit `SearchComicPayload`, read the top level only) —
   you can then fetch `extern.currentUrl` directly instead of building a URL
   from `page`.

```ts
// E-hentai style (URL-cursor pagination)
const isAggregate = payload.isSearchAggregate === true;
const currentUrl = String(payload.extern?.currentUrl ?? "").trim();
const nextUrl = String(payload.extern?.nextUrl ?? "").trim();
const endpoint =
  isAggregate && currentUrl
    ? currentUrl // bookmark replay: fetch the recorded page directly
    : page > 1 && nextUrl
      ? nextUrl // normal paging: follow the cursor
      : buildSearchEndpoint(keyword, page); // first screen
// Echo back in the response extern:
// extern: { ...extern, currentUrl: endpoint, nextUrl, prevUrl }
```

### `getComicDetail(payload)` (types: `ComicDetailPayload` / `ComicDetailContract` in kit)

```ts
import type {
  ComicDetailContract,
  ComicDetailPayload,
} from "breeze-plugin-kit";

async function getComicDetail(
  payload: ComicDetailPayload,
): Promise<ComicDetailContract> {}
```

```ts
type ComicDetailPayload = {
  comicId?: string;
  extern?: Record<string, unknown>;
};

type ComicDetailContract = {
  source: string;
  comicId: string;
  extern: Record<string, unknown> | null;
  scheme: { version: "1.0.0"; type: "comicDetail"; source: string };
  data: { normal: ComicDetailNormal; raw: unknown };
};

type ComicDetailNormal = {
  comicInfo: {
    id: string;
    title: string;
    titleMeta: ActionItem[];
    creator: {
      id: string;
      name: string;
      avatar: ImageItem;
      onTap: Record<string, unknown>;
      extern: Record<string, unknown>;
    };
    description: string;
    cover: ImageItem;
    metadata: MetadataListItem[];
    extern: Record<string, unknown>;
  };
  preview?: PreviewCapability;
  eps: ChapterSummary[]; // chapter list
  recommend: RecommendItem[];
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  isFavourite: boolean;
  isLiked: boolean;
  allowComments: boolean;
  allowLike: boolean;
  allowCollected: boolean;
  allowDownload: boolean;
  // Reason shown to the user when the matching allow flag is false (optional).
  // Falls back to "This plugin does not support this feature" when empty or missing.
  allowCommentsReason?: string;
  allowLikeReason?: string;
  allowCollectedReason?: string;
  allowDownloadReason?: string;
  extern: Record<string, unknown>;
};

> When an `allow*` flag is `false`, the host disables the entry but keeps a
> tappable placeholder: tapping shows the matching `allow*Reason`, or the
> default message when empty. For example, with `allowDownload: false` the
> chapter row still shows a download button, and tapping it toasts the reason
> instead of starting a download.

> `creator` is required and cannot be omitted. Sources without author info fill in
> empty values; the host hides the creator card when both `name` and `avatar.url`
> are empty. Note `avatar` is the only exception: do not fill it with a placeholder
> `url` via shared image helpers (a non-empty placeholder keeps the card visible);
> write a fully empty `ImageItem` by hand instead. Set `onTap` to `null` when not clickable.

type PreviewCapability = {
  enabled: boolean;
  extern?: Record<string, unknown>;
};

// Base types
type ActionItem = {
  name: string;
  onTap: Record<string, unknown>;
  /** Long-press copy text. Falls back to name when absent or null. */
  onLongPress?: string | null;
  extern: Record<string, unknown>;
};
type ImageItem = {
  id: string;
  url: string;
  name: string;
  path: string;
  extern: Record<string, unknown>;
};
```

> `url` must be a non-empty placeholder string, not a 404 URL. The host does not download via it but validates format. Image download is fully handled by `fetchImageBytes`.

```ts
type MetadataListItem = { type: string; name: string; value: ActionItem[] };
```

### Chapter Fields

Chapter-related data uses these fields in `CommonDetail` `eps[]` and in `getReadSnapshot` / `getChapter` returns:

```ts
type ChapterSummary = {
  id: string;               // chapter id
  requestId: string;        // used by host when calling getReadSnapshot / getChapter
  logicalKey: string;       // host-internal chapter identity (often same as requestId)
  storageChapterId: string; // local download directory name (often same as requestId)
  name: string;             // chapter title
  order: number;            // order
  /** Visual group title; missing / null / blank = no grouping. See "Chapter Groups" below. */
  groupTitle?: string | null;
  extern: Record<string, unknown>; // plugin passthrough
};

type ChapterPage = {
  id: string;
  name: string;
  path: string;
  url: string;
  extern: Record<string, unknown>;
};
```

### Chapter Groups (`groupTitle`)

When a source has multiple chapter lists (e.g. "Serial" / "Extras" / "Volumes"),
give chapters of the same group the same `groupTitle`. Missing / `null` / blank
means no grouping; the host falls back to a flat single-column list.

```ts
// Example: two raw-side groups, flattened with group info preserved
const eps: ChapterSummary[] = [
  ...serialChapters.map((c, i) => ({
    ...toSummary(c),
    groupTitle: "Serial",
    order: i + 1, // order must be globally unique and stable across refreshes;
                   // never reuse the overlapping raw-side numbers directly
  })),
  ...volumeChapters.map((c, i) => ({
    ...toSummary(c),
    groupTitle: "Volumes",
    order: serialChapters.length + i + 1,
  })),
];
```

Host behavior:

- The data layer stays flat: `eps` remains the single chapter list, and `order`
  (globally unique, stable across refreshes) is the only sort key.
  Never send a nested group structure.
- Group order is derived from first appearance in `eps`; no separate order key.
  Put serial chapters first to list "Serial" first.
- Fill `name` with the bare title (e.g. `"Ch.1"`); do not prepend the group yourself
  (e.g. `"Serial—Ch.1"`): grouping is carried by `groupTitle` alone, and the host
  renders the title and the group separately.
- Free text: `groupTitle` is `string | null`, host never validates or maps it.
- Prev/next chapter, continue reading, and download selection all follow the
  global `order` and are unaffected by groups; cross-group navigation just works.

### `getReadSnapshot(payload)` (types: `ReadSnapshotPayload` / `ReadSnapshotContract` in kit)

```ts
import type {
  ReadSnapshotContract,
  ReadSnapshotPayload,
} from "breeze-plugin-kit";

async function getReadSnapshot(
  payload: ReadSnapshotPayload,
): Promise<ReadSnapshotContract> {}
```

```ts
type ReadSnapshotPayload = {
  comicId?: string;
  chapterId?: string | number;  // requestId
  extern?: Record<string, unknown>;
};

type ReadSnapshotContract = {
  source: string;
  extern: Record<string, unknown> | null;
  data: {
    comic: {
      id: string;
      source: string;
      title: string;
      extern: Record<string, unknown>;
    };
    chapter: ChapterWithPages; // current chapter + pages
    chapters: Array<{
      id: string;
      name: string;
      order: number;
      extern: Record<string, unknown>;
    }>;
  };
};


type ChapterWithPages = ChapterSummary & { pages: ChapterPage[] };
```

`chapters` is the navigation list (slim); `chapter` is the selected chapter (with `pages`).

### `fetchImageBytes(payload)` (types: `FetchImageBytesPayload` / `FetchImageBytesResult` in kit)

```ts
import type {
  FetchImageBytesPayload,
  FetchImageBytesResult,
} from "breeze-plugin-kit";

async function fetchImageBytes(
  payload: FetchImageBytesPayload,
): Promise<FetchImageBytesResult> {}
```

```ts
type FetchImageBytesPayload = {
  url?: string;
  timeoutMs?: number;
  taskGroupKey?: string;  // download task group; host can cancel in batch
  extern?: Record<string, unknown>;
};

type FetchImageBytesResult = Uint8Array<ArrayBufferLike>;
```

`url` comes from `ImageItem.url`. The host does not download with it; the plugin implements download. The `url` must still be a valid placeholder string — not empty or 404.

> ⚠️ **Binary offload header required**: always send `"x-rquickjs-host-offload-binary-v1": "1"` so the host returns raw binary instead of stringifying or re-encoding. Without it, image data often has wrong length, fails to decode, or displays incorrectly.

```ts
// Implementation sketch:
async function fetchImageBytes({
  url,
  timeoutMs = 30000,
}: FetchImageBytesPayload): Promise<Uint8Array> {
  const res = await fetch(url, {
    headers: { "x-rquickjs-host-offload-binary-v1": "1" },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    throw new Error(`Download failed: ${res.status}`);
  }

  return new Uint8Array(await res.arrayBuffer());
}
```

### `getChapter(payload)` (types: `ChapterPayload` / `ChapterContentContract` in kit)

Used for downloads. Similar to `getReadSnapshot` but with full `scheme + data + comicId/chapterId`:

```ts
import type {
  ChapterContentContract,
  ChapterPayload,
} from "breeze-plugin-kit";

async function getChapter(
  payload: ChapterPayload,
): Promise<ChapterContentContract> {}
```

```ts
type ChapterPayload = {
  comicId?: string;
  chapterId?: string | number;
  page?: number;
  extern?: Record<string, unknown>;
};

type ChapterContentContract = {
  source: string;
  comicId: string;
  chapterId: string;
  extern: Record<string, unknown> | null;
  scheme: { version: "1.0.0"; type: "chapterContent"; source: string };
  data: {
    comic: {
      id: string;
      source: string;
      title: string;
      extern: Record<string, unknown>;
    };
    chapter: ChapterWithPages;
    chapters: Array<{
      id: string;
      name: string;
      order: number;
      extern: Record<string, unknown>;
    }>;
  };
};
```

---

## 3. Optional Capabilities

### `getPreview(payload)` (types: `PreviewPayload` / `PreviewContentContract` in kit)

`preview` is an optional capability field. A source that supports previews
returns `preview: { enabled: true }` in `data.normal`; unsupported sources omit
the field.

After `normal.preview.enabled` is confirmed, the host calls `getPreview` by
page:

```ts
import type {
  PreviewContentContract,
  PreviewPayload,
} from "breeze-plugin-kit";

async function getPreview(
  payload: PreviewPayload,
): Promise<PreviewContentContract> {}
```

```ts
type PreviewPayload = {
  comicId?: string;
  page?: number;
  extern?: Record<string, unknown>;
};

type PreviewItem = {
  id: string;
  name: string;
  path: string;
  url: string;
  extern: Record<string, unknown>;
};

type PreviewContentContract = {
  source: string;
  comicId: string;
  extern: Record<string, unknown> | null;
  scheme: { version: "1.0.0"; type: "previewContent"; source: string };
  data: {
    preview: {
      items: PreviewItem[];
      paging: PagingInfo;
    };
  };
};
```

The first request uses `normal.preview.extern`. The top-level `extern` returned
by the plugin is passed through unchanged as the next request's `extern`, and
may carry pagination cursors or session state.

When `paging.hasReachedMax` is `true`, the host stops requesting more pages.

### `getDownloadConcurrency()` (types: `DownloadConcurrencyResult` in kit)

Before downloading a chapter, the host calls this function to get the image
download concurrency. **Optional**: when unimplemented, invalid, or failed,
the host falls back to `5`.

```ts
import type { DownloadConcurrencyResult } from "breeze-plugin-kit";

async function getDownloadConcurrency(): Promise<DownloadConcurrencyResult> {
  return { concurrency: 3 };
}
```

```ts
type DownloadConcurrencyResult = {
  concurrency: number;
};
```

> The host truncates the value to an integer and clamps it to `1-32`, calling
> once per chapter download.

---

## 4. Social APIs

### `toggleLike(payload)` (types: `ToggleLikePayload` / `ToggleLikeResult` in kit)

```ts
import type {
  ToggleLikePayload,
  ToggleLikeResult,
} from "breeze-plugin-kit";

async function toggleLike(
  payload: ToggleLikePayload,
): Promise<ToggleLikeResult> {}
```

```ts
type ToggleLikePayload = {
  comicId?: string;
  currentLiked?: boolean;
  extern?: Record<string, unknown>;
};

type ToggleLikeResult = { liked: boolean };

```

### ~~`toggleFavorite(payload)`~~ ⚠️Deprecated

> ⛔ **Do not implement the legacy favorite APIs**: `toggleFavorite` / `listFavoriteFolders` /
> `moveFavoriteToFolder` are all deprecated, the current host has no requirement to implement them,
> and they may be removed in a future version. New plugins only need the cloud favorite workflow
> (`startFavoriteAction` / `continueFavoriteAction`), see the Favorite Workflow guide.
> Implementing the legacy APIs even for old-host compatibility is **discouraged**—running two
> protocols side by side only adds maintenance burden.

```ts
import type {
  ToggleFavoritePayload,
  ToggleFavoriteResult,
} from "breeze-plugin-kit";

async function toggleFavorite(
  payload: ToggleFavoritePayload,
): Promise<ToggleFavoriteResult> {}
```

```ts
type ToggleFavoritePayload = {
  comicId?: string;
  currentFavorite?: boolean;
  extern?: Record<string, unknown>;
};

type ToggleFavoriteResult = {
  favorited: boolean;
  nextStep: "none" | "selectFolder";
};

```

When `nextStep` is `selectFolder`, the host continues with `listFavoriteFolders` and `moveFavoriteToFolder`.

### ~~`listFavoriteFolders()`~~ ⚠️Deprecated (types: `ListFavoriteFoldersResult` in kit)

```ts
import type { ListFavoriteFoldersResult } from "breeze-plugin-kit";

async function listFavoriteFolders(): Promise<ListFavoriteFoldersResult> {}
```

```ts
type ListFavoriteFoldersResult = { items: Array<{ id: string; name: string }> };
```

### ~~`moveFavoriteToFolder(payload)`~~ ⚠️Deprecated (types: `MoveFavoriteToFolderPayload` in kit)

```ts
import type { MoveFavoriteToFolderPayload } from "breeze-plugin-kit";

async function moveFavoriteToFolder(
  payload: MoveFavoriteToFolderPayload,
): Promise<{ ok: boolean }> {}
```

```ts
type MoveFavoriteToFolderPayload = {
  comicId?: string;
  folderId?: string;
  folderName?: string;
  extern?: Record<string, unknown>;
};

```

The three functions above belong to the legacy favorite protocol, which is **deprecated**: there is
currently no requirement to implement them. New plugins only need `startFavoriteAction` and
`continueFavoriteAction`. To avoid behavior divergence between two protocols, do **not** implement
both the new and legacy favorite entries.

### Comment feed (types: CommentFeedPayload / CommentFeedContract etc. in kit)

```ts
import type {
  CommentFeedContract,
  CommentFeedPayload,
  CommentMutationContract,
  CommentPostPayload,
  CommentRepliesContract,
  CommentRepliesPayload,
  CommentReplyPayload,
} from "breeze-plugin-kit";

async function getCommentFeed(
  payload: CommentFeedPayload,
): Promise<CommentFeedContract> {}

async function loadCommentReplies(
  payload: CommentRepliesPayload,
): Promise<CommentRepliesContract> {}

async function postComment(
  payload: CommentPostPayload,
): Promise<CommentMutationContract> {}

async function postCommentReply(
  payload: CommentReplyPayload,
): Promise<CommentMutationContract> {}
```

```ts
type CommentFeedPayload = {
  comicId?: string;
  page?: number;
  extern?: Record<string, unknown>;
};

type CommentFeedContract = {
  source: string;
  extern: Record<string, unknown> | null;
  scheme: { version: "1.0.0"; type: "commentFeed" };
  data: {
    topItems: CommentItem[];
    items: CommentItem[];
    paging: { hasReachedMax: boolean };
    replyMode: "lazy" | "embedded"; // lazy: load replies on demand; embedded: replies inline
    canComment: { comic: boolean; reply: boolean };
  };
};

type CommentItem = {
  id: string;
  author: { name: string; avatar: { url: string; path: string } };
  content: string;
  createdAt: string;
  replyCount: number;
  replies: CommentItem[];
  extern: Record<string, unknown>;
};

type CommentRepliesPayload = {
  comicId?: string;
  commentId?: string;
  page?: number;
  extern?: Record<string, unknown>;
};

type CommentRepliesContract = {
  source: string;
  extern: Record<string, unknown> | null;
  scheme: { version: "1.0.0"; type: "commentReplies" };
  data: {
    commentId: string;
    items: CommentItem[];
    paging: { hasReachedMax: boolean };
  };
};

type CommentPostPayload = {
  comicId?: string;
  content?: string;
  extern?: Record<string, unknown>;
};

type CommentReplyPayload = {
  comicId?: string;
  commentId?: string;
  content?: string;
  extern?: Record<string, unknown>;
};

type CommentMutationContract = {
  source: string;
  scheme: { version: "1.0.0"; type: "commentMutation" };
  data: {
    ok: boolean;
    mode: "postComment" | "postReply";
    parentId?: string;
    created: CommentItem | null;
    insertHint: {
      needsRefetch: boolean;
      strategy?: "prependAfterTop" | "prepend";
      targetCommentId?: string;
    };
  };
};
```

- `replyMode: "lazy"` — replies loaded on demand via `loadCommentReplies`
- `replyMode: "embedded"` — replies already in `replies`; no `loadCommentReplies`
- `insertHint.strategy` — `prependAfterTop` for main comments at top; `prepend` for replies

---

## 5. Discover & Lists

What you see after tapping an entry, jump as needed:

- List page look and card fields → `getRankingData(payload)`
- List filtering (with cascading example) → `getRankingFilterBundle()` (example name, optional)
- Function page block styles → `getFunctionPage(payload)`
- How filter params merge into list requests → 6.2; full call chain → 6.5

### `getAdvancedSearchScheme()` (types: `AdvancedSearchContract` in kit)

Defines advanced search fields. Selected values are passed to `searchComic` via `extern`.

```ts
import type { AdvancedSearchContract } from "breeze-plugin-kit";

async function getAdvancedSearchScheme(): Promise<AdvancedSearchContract> {}
```

```ts
type AdvancedSearchContract = {
  source: string;
  scheme: {
    version: "1.0.0";
    type: "advancedSearch";
    title?: string;
    fields: AdvancedSearchField[];
  };
  data: { values: Record<string, unknown> };
};

type AdvancedSearchField = {
  key: string;
  kind: "text" | "switch" | "choice" | "multiChoice";
  label: string;
  options?: Array<{ label: string; value: unknown }>;
};
```

### `getComicListSceneBundle()` (types: `ComicListSceneBundleContract` in kit)

Defines the default Discover list scene. Returns `data.scene`; host renders the list and calls `body.request.fnPath` / `filter.fnPath`.

```ts
import type { ComicListSceneBundleContract } from "breeze-plugin-kit";

async function getComicListSceneBundle(): Promise<ComicListSceneBundleContract> {}
```

```ts
type ComicListSceneBundleContract = {
  source: string;
  scheme: { version: "1.0.0"; type: "comicListSceneBundle" };
  data: { scene: ComicListScene };
};
```

`ComicListScene` is defined under `getInfo`.

### `getRankingData(payload)` (types: `SearchComicPayload` / `ComicPagedListContract` in kit)

List data function named by `ComicListScene.body.request.fnPath`. Called when the host pages list data.

Tapping an `openComicList` entry renders a "comic card grid" list page: each `data.items[]`
entry shows as one card ("cover + title + subtitle + metadata"); tapping a card opens
`getComicDetail`. The host stops paging when `data.hasReachedMax` is `true`.

`id` / `title` / `cover` are required per card (`cover.url` is a placeholder string; real
bytes come from `fetchImageBytes`); `subtitle` / `metadata` / `likesCount` / `viewsCount` /
`updatedAt` / `finished` are recommended, otherwise left blank.

```ts
import type {
  ComicPagedListContract,
  SearchComicPayload,
} from "breeze-plugin-kit";

async function getRankingData(
  payload: SearchComicPayload,
): Promise<ComicPagedListContract> {}
```

```ts
type ComicPagedListContract = {
  source: string;
  extern?: Record<string, unknown> | null;
  scheme?: Record<string, unknown>;
  data: { items: ComicListItem[]; hasReachedMax: boolean };
};
```

### `getRankingFilterBundle()` (example name, optional, types: `FilterBundleContract` in kit)

List filter function named by `ComicListScene.filter.fnPath`. `filter` itself is optional:
omit `scene.filter` when the list needs no filtering and the list page shows no filter button;
only set `filter: { fnPath, core?, extern? }` when filtering is needed, and `fnPath` must name
a real exported callable, otherwise tapping the filter button fails.

Once set, the host calls it when the user opens list filters.

The filter panel renders `scheme.fields[]`: one group per `field`, `label` as the group title,
`options[].label` as option text. `kind: "choice"` renders grouped single-selects; `kind: "dropdown"`
renders a click-to-expand dropdown for long lists (dozens or hundreds of options), with `children`
indented under their parent (the parent remains selectable). `data.values` keyed by
`field.key` gives each group's default selection (`value` semantics are plugin-defined;
the host only compares opaquely); empty means no default. `option.result.core` /
`result.extern` merge into the next list request on confirm; merge rules: 6.2.

```ts
import type { FilterBundleContract } from "breeze-plugin-kit";

async function getRankingFilterBundle(): Promise<FilterBundleContract> {}
```

```ts
type FilterBundleContract = {
  source: string;
  scheme: {
    version: "1.0.0";
    type?: string;
    title?: string;
    fields: FilterField[];
  };
  data: { values: Record<string, unknown> };
};

type FilterField = {
  key: string;
  kind: "choice" | "dropdown";
  label: string;
  options: FilterOption[];
};

type FilterOption = {
  label: string;
  value: unknown;
  result?: {
    core?: Record<string, unknown>;   // merged into list request top-level
    extern?: Record<string, unknown>; // merged into list request extern
    params?: Record<string, unknown>; // UI params
    [key: string]: unknown;
  };
  children?: FilterOption[];
};
```

Example (cascading: some parents carry `children`, some don't; children open only after tapping a parent that has them):

```ts
async function getRankingFilterBundle(): Promise<FilterBundleContract> {
  return {
    source: PLUGIN_ID,
    scheme: {
      version: "1.0.0",
      type: "rankingFilter",
      title: "Filter comics",
      fields: [
        {
          key: "category",
          kind: "choice",
          label: "Category",
          options: [
            // No children: selecting applies immediately
            { label: "Latest", value: "latest", result: { extern: { type: "0" } } },
            // With children: tapping the parent opens children for a second pick
            {
              label: "Doujin",
              value: "doujin",
              result: { extern: { type: "doujin" } },
              children: [
                { label: "Chinese", value: "doujin_chinese", result: { extern: { type: "doujin_chinese" } } },
                { label: "Japanese", value: "doujin_japanese", result: { extern: { type: "doujin_japanese" } } },
              ],
            },
            {
              label: "Oneshot",
              value: "single",
              result: { extern: { type: "single" } },
              children: [
                { label: "Chinese", value: "single_chinese", result: { extern: { type: "single_chinese" } } },
                { label: "Japanese", value: "single_japanese", result: { extern: { type: "single_japanese" } } },
              ],
            },
          ],
        },
        {
          key: "order",
          kind: "choice",
          label: "Sort",
          options: [
            { label: "Newest", value: "new", result: { extern: { order: "new" } } },
            { label: "Hottest", value: "hot", result: { extern: { order: "hot" } } },
          ],
        },
      ],
    },
    data: { values: { category: "latest", order: "new" } },
  };
}

// Picking "Doujin → Chinese" merges extern { ..., type: "doujin_chinese" } into the next list request;
// picking "Latest" merges { ..., type: "0" } with no second panel. Merge rules: 6.2.
```

### `getFunctionPage(payload)` (types: `GetFunctionPagePayload` / `FunctionPageContract` in kit)

Function-page data function named by `openPluginFunction`'s `payload.id`. Called after the
entry is tapped, with `{ id, page, core, extern }` (`id` is the entry's `payload.id`); throw
for unknown `id`.

Page style comes from `scheme.body`; `data` fills the `key`s referenced by `body`.
`scheme.body` is always a `{ type: "list", children: [...] }` container; each child
declares one block and its data source:

- `{ type: "chip-list", key }`: tag strip. `data[key]` is `{ items: [{ label, action }] }`,
  horizontally laid out tappable tags; tap runs `action` (usually `openSearch`).
- `{ type: "action-grid", key }`: icon grid. `data[key]` is
  `{ items: [{ title, cover, action }] }`, `cover` with `url` / `path` / `extern`;
  tap runs `action` (usually `openSearch` / `openComicList`).
- `{ type: "comic-section-list", key }`: comic sections. `data[key]` is
  `{ sections: [{ title, subtitle, action, items: ComicListItem[] }] }`,
  each section renders "title + horizontal comic cards" with the same card fields as list pages.
- `{ type: "comic-grid", key }`: comic grid. `data[key]` is `{ items: ComicListItem[] }`,
  same style as list pages, optionally with `title` / `action` as the section header.

`hasReachedMax: true` stops the host paging that `key`. `presentation: "dialog"` suits
light blocks like `chip-list`; `"page"` suits grids / sections / grids.

```ts
import type {
  FunctionPageContract,
  GetFunctionPagePayload,
} from "breeze-plugin-kit";

async function getFunctionPage(
  payload: GetFunctionPagePayload,
): Promise<FunctionPageContract> {}
```

```ts
type GetFunctionPagePayload = {
  id?: string;
  page?: number;
  core?: Record<string, unknown>;
  extern?: Record<string, unknown>;
};

type FunctionPageContract = {
  source: string;
  scheme: {
    version: "1.0.0";
    type: "page";
    title: string;
    body: FunctionPageBodyNode;
  };
  data: FunctionPageData; // items / sections per body key, see above
};
```

---

## 6. Settings

> The host **always calls** `getSettingsBundle` when opening the plugin settings page;
> a missing export breaks the page (`target is not function: getSettingsBundle`).
> Plugins without settings must still export it with a minimal bundle:
>
> ```ts
> async function getSettingsBundle(): Promise<SettingsBundleContract> {
>   return {
>     source: PLUGIN_ID,
>     scheme: { version: "1.0.0", type: "settings", sections: [] },
>     data: { canShowUserInfo: false, values: {} },
>   };
> }
>
> async function getCapabilitiesBundle(): Promise<CapabilitiesBundleContract> {
>   return {
>     source: PLUGIN_ID,
>     scheme: { version: "1.0.0", type: "capabilities", actions: [] },
>     data: {},
>   };
> }
> ```

### `getSettingsBundle()` (types: `SettingsBundleContract` in kit)

```ts
import type { SettingsBundleContract } from "breeze-plugin-kit";

async function getSettingsBundle(): Promise<SettingsBundleContract> {}
```

```ts
type SettingsBundleContract = {
  source: string;
  scheme: { version: "1.0.0"; type: "settings"; sections: SettingsSection[] };
  data: {
    canShowUserInfo: boolean;
    /** Declare login-page support; the settings page shows a login entry. */
    canLogin?: boolean;
    /** Login entry title; falls back to the host default. */
    loginTitle?: string | null;
    /** Login entry subtitle; falls back to the host default. */
    loginSubtitle?: string | null;
    /** Declare detail-page support; the settings page shows a detail entry calling `getPluginDetail` on demand. */
    canShowDetail?: boolean;
    values: Record<string, unknown>;
  };
};

type SettingsSection = {
  id?: string;
  title: string;
  fields: SettingsField[];
};

type SettingsField = OptionField | PlainField;

type OptionField = BaseField & {
  kind: "select" | "choice" | "multiChoice";
  options?: Array<{ label: string; value: unknown }>;
};

type PlainField = BaseField & { kind: "text" | "password" | "switch" };

type BaseField = {
  key: string; // config key in values and callback payload
  kind: FieldKind; // "text" | "password" | "switch" | "select" | "choice" | "multiChoice"
  label: string; // display label
  fnPath?: string; // callback on change
  persist?: boolean; // client persistence; default true
};
```

When the user changes a field with `fnPath`, the host calls that function with `{ extern: Record<string, unknown>, key: string, value: unknown }`.

### `getCapabilitiesBundle()` (types: `CapabilitiesBundleContract` / `CapabilityAction` in kit)

Bottom “Actions” section on the settings page; click calls the matching `fnPath`.

```ts
import type {
  CapabilitiesBundleContract,
  CapabilityAction,
} from "breeze-plugin-kit";

async function getCapabilitiesBundle(): Promise<CapabilitiesBundleContract> {}
```

```ts
type CapabilitiesBundleContract = {
  source: string;
  scheme: {
    version: "1.0.0";
    type: "capabilities";
    actions: CapabilityAction[];
  };
  data: Record<string, unknown>;
};

type CapabilityAction = { key?: string; title: string; fnPath: string };
```

### `getUserInfoBundle()` (types: `UserInfoBundleContract` in kit)

User info card on the settings page.

```ts
import type { UserInfoBundleContract } from "breeze-plugin-kit";

async function getUserInfoBundle(): Promise<UserInfoBundleContract> {}
```

```ts
type UserInfoBundleContract = {
  source: string;
  scheme: { version: "1.0.0"; type: "userInfo" };
  data: {
    title?: string;
    avatar: ImageItem;
    lines: string[];
    extern?: Record<string, unknown>;
  };
};
```

---

## 6.5 Login

The login page is declared by the plugin and rendered by the host. Flow: the
plugin throws a `type: "unauthorized"` error carrying only `source` and
`message` → the host shows a confirm dialog → on confirm it navigates to the
login page, which fetches the form via `getLoginBundle` → submit calls
`action.fnPath`, closing on success and showing the failure reason on error.

### `getLoginBundle()` (types: `LoginBundleContract` / `LoginField` in kit)

Returns the login form. Field `kind` is `text` / `password` / `multiline` /
`captcha-image` / `slider-captcha` for plain input, password input, multi-line
input, image captcha, and puzzle slider (the host pops a verification dialog
on submit; requires host 3.0.37+).
`data.values` holds prefilled values (prefill account only, leave password empty).

```ts
import type {
  LoginBundleContract,
  LoginBundleInit,
  LoginField,
} from "breeze-plugin-kit";

async function getLoginBundle(): Promise<LoginBundleContract> {}
```

Full shape (matches kit types; `buildLoginBundle` takes `LoginBundleInit`):

```ts
type LoginBundleInit = {
  title: string;
  fields: LoginField[];
  submitFnPath: string;
  submitText?: string;
  values?: Record<string, unknown>;
};
```

```ts
// Returns LoginBundleContract
type LoginBundleContract = {
  source: string;
  scheme: {
    version: "1.0.0";
    type: "login";
    title?: string;
    fields: LoginField[];
    action: { fnPath: string; submitText?: string; label?: string };
  };
  data?: { values?: Record<string, unknown> } & Record<string, unknown>;
};

type LoginField = {
  key: string;
  kind?: "text" | "password" | "multiline" | "captcha-image" | "slider-captcha";
  label?: string;
  required?: boolean;
  placeholder?: string;
  help?: string;
  captcha?: LoginCaptchaConfig;
  slider?: LoginSliderConfig;
};

type LoginCaptchaConfig = {
  fetchFnPath: string; // fetch fn, returns `{ imageBase64: string; mimeType?: string }`
  refreshText?: string;
};

type LoginSliderConfig = {
  createFnPath: string; // challenge fn, returns `{ token, bg, piece, y, w, h, s }` (bg/piece are dataURLs)
  verifyFnPath: string; // verify fn, takes `{ token, x, track }` (track is `[t,x,y][]`), returns `{ pass }`
  refreshText?: string;
};
```

Puzzle slider: the host calls `createFnPath` (with current form values) →
dialog verification → `verifyFnPath` → puts the one-time `pass` into the
field value on submit. Passes are one-time; retry on failure.

On submit the host calls `action.fnPath` with the form values in `core.values`
(read them with the kit `readLoginValues`). Login state persistence stays in
the plugin via `pluginConfig`; the host never touches it. The login function
may return `message?: string | null` as the success toast (absent/null/blank
falls back to the host default), see the kit `LoginSubmitResult`:

```ts
type LoginSubmitResult = {
  source: string;
  message?: string | null;
  data?: { message?: string | null } & Record<string, unknown>;
} & Record<string, unknown>;
```
### need-login error

Throw a JSON-string error when login is needed; the host recognizes
`type: "unauthorized"` and starts the login flow. Use the kit
`buildUnauthorizedError`:

```ts
import {
  buildLoginBundle,
  buildUnauthorizedError,
} from "breeze-plugin-kit";
import type {
  LoginBundleContract,
  LoginBundleInit,
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

// At auth failures:
throw buildUnauthorizedError(PLUGIN_ID, "Login expired, please log in again");
```

### Settings login entry

Declare `canLogin: true` in `getSettingsBundle` `data` and the settings user
info area gains an "Account login" row opening the login page. Prefer this for
login or auth-secret setup. The title/subtitle can be customized with
`data.loginTitle` / `data.loginSubtitle` (e.g. cookie or API-key login);
absent/blank values fall back to the host defaults.

### Plugin detail page (types: `PluginDetailContract` in kit)

Declare `canShowDetail: true` in `getSettingsBundle` `data` and the settings
page shows a "Plugin detail" entry opening the new detail page. The content is
fetched on demand via `getPluginDetail`, never prefetched in lists. `describe`
supports markdown rendering (links open in the external browser):

```ts
type PluginDetailContract = {
  source: string;
  data: {
    creator?: {
      name: string;
      describe?: string | null;
      iconUrl?: string | null;
    } | null;
    describe: string;
  };
};

async function getPluginDetail(): Promise<PluginDetailContract> {}
```

Author display no longer reads `getInfo.creator` (removed): the store shows the
owner from the cloud `repo` (owner/name), and the detail page shows
`data.creator.name` from `getPluginDetail`.

---

## 7. Data Flow & Call Chains

### 6.1 Search: Advanced Search → `searchComic`

```
User opens search → host calls getAdvancedSearchScheme() → render advanced UI
User picks filters → no request yet
User searches / pages → host calls searchComic({ keyword, page, extern: { sortBy, categories, ... } })
                                                              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                                              selected advanced filters in extern
```

Details:

- `getAdvancedSearchScheme().scheme.fields[].key` defines filter param names (e.g. `sortBy`, `categories`)
- Selected key-values go into `searchComic` `extern`
- Plugin reads `extern.sortBy` / `extern.categories` inside `searchComic`

### 6.2 Filters: Filter Bundle → List Request

```
List loads → host calls body.request.fnPath (e.g. getRankingData) for initial data
User opens filter → host calls filter.fnPath (e.g. getRankingFilterBundle)
User picks option → host merges option.result into the next list request
```

Merge rules:

- `result.core` fields are written **onto the top level** of the next list request
- `result.extern` fields are **merged into** the next list request `extern`

```ts
// Example FilterOption:
{ label: "Daily", value: "day", result: { core: { type: "comic" }, extern: { rankType: "day" } } }

// After selection, next getRankingData payload becomes:
{ page: 1, type: "comic", extern: { source: "ranking", rankType: "day" } }
//       ^^^^^^^^^^^^                                    ^^^^^^^^^^^^^^^^
//       result.core flattened                           result.extern merged
```

### 6.3 Settings Field Callbacks

Settings fields may set `fnPath`. On change, the host calls it with:

```ts
type SettingsFieldCallbackPayload = {
  extern: Record<string, unknown>;
  key: string;           // field key, e.g. "auth.account"
  value: unknown;        // new value; may be scalar or array
};
```

Examples:

```ts
{ extern: {}, key: "auth.remember", value: true }
{ extern: {}, key: "display.theme", value: "dark" }
{ extern: {}, key: "content.hiddenTags", value: ["tag-b", "tag-c", "tag-d"] }
```

- Plain fields (text / password / switch / choice): `value` is a single value.
- `multiChoice`: `value` is an array (e.g. `onHiddenTagsChanged` receives a tag array).

Example repo callbacks:

- Text/password → `onAuthChanged`
- Switch → `onRememberChanged`, `onAdultChanged`
- Choice → `onThemeChanged`, `onQualityChanged`
- multiChoice → `onHiddenTagsChanged`

Plugins can validate and persist config in these callbacks.

### 6.4 Capability Action Callbacks

Each `fnPath` in `getCapabilitiesBundle().scheme.actions[]` is called by the host on click, with no arguments.

### 6.5 Feature Entry Call Chain

`getInfo().function[]` defines buttons on the plugin card. For `openComicList`:

```
User taps "Ranking"
  → host reads action.payload.scene
  → renders list page (title, etc.; filter button only when scene sets filter)
  → calls scene.body.request.fnPath (e.g. getRankingData) for list data
  → user opens filter → calls scene.filter.fnPath (e.g. getRankingFilterBundle)
```

`scene.body.request.core` and `scene.body.request.extern` are fixed params on every list request, merged with dynamic filter params.

For `openPluginFunction`:

```
User taps a function button
  → host reads action.payload.id / presentation, opens a page or dialog
  → calls getFunctionPage({ id }) for scheme.body + data
  → renders chip-list / action-grid / comic-section-list / comic-grid per body.children
  → user taps a cell → runs that cell's action (e.g. openSearch / openComicList) into the matching list or search page
```

### 6.6 Practical Tips

- **`core` vs `extern`**: business params (page, type, sort) in `core`; session/context passthrough in `extern`. Prefer `core` when possible.
- **Keep filter `options.value` stable**: changing semantics breaks saved user filters.
- **Always default `data.values`**: empty options lead to missing request params; host does not fill defaults.
- **Keep public `fnPath` keys compatible**: when renaming, export both `snake_case` and `camelCase` if needed.
