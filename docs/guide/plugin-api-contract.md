# 插件 API 契约

本文给出 Breeze 插件每个 `fnPath` 的 TypeScript 类型定义与调用语义。

## 0. 通用约定

### 0.1 入参模型

宿主调用时总是传入一个扁平对象。顶层放业务主参数，透传字段放 `extern`：

```ts
// 泛型入参模型
type PluginPayload<T extends Record<string, unknown>> = T & {
  extern?: Record<string, unknown>;
};
```

例如 `searchComic` 的实际签名：

```ts
import type {
  SearchComicPayload,
  SearchResultContract,
} from "breeze-plugin-kit";

async function searchComic(
  payload: SearchComicPayload,
): Promise<SearchResultContract> {}
```

所有参数类型定义由 `breeze-plugin-kit` 提供。下文每个 `fnPath` 会标注其对应的 Payload 和返回类型。

### 0.2 返回模型

绝大部分接口返回统一信封结构：

```ts
type PluginEnvelope = {
  source: string; // 插件 ID
  scheme?: Record<string, unknown>; // 页面渲染协议
  data?: Record<string, unknown>; // 业务数据
  extern?: Record<string, unknown>; // 透传上下文
  [key: string]: unknown; // 其他平铺字段（如 comicId、paging）
};
```

宿主机型 `scheme` 知道"页面长什么样"，机型 `data` 知道"页面值是多少"。插件只需按类型填充即可。

### 0.3 错误处理

- 返回值必须是可 JSON 序列化的对象（非对象会触发"返回格式错误"）
- 抛出的 `Error` 字符串会直接显示在客户端
- 建议始终返回 `source` 字段，便于排查

### 0.4 `init`（可选）

宿主可能在 runtime 启动后调用 `init`。如未实现则跳过。若实现，建议返回 `{ source, data: { ok: true } }`。

注意：热更新时 QJS 实例重建，`init` 会重新调用。不要用 `init` 做一次性初始化。

### 0.5 类型引用

所有类型定义来自 `breeze-plugin-kit`。下文标注的 Payload 和 Contract 类型均可从该包导入。

---

## 1. fnPath 职责总览

下表中 Host 调用的函数是宿主按场景主动触发；回调函数是用户在 UI 上操作后宿主代调。

| fnPath                                             | 触发场景                                              |
| -------------------------------------------------- | ----------------------------------------------------- |
| `getInfo`                                          | 发现页加载插件卡片                                    |
| `searchComic`                                      | 搜索页输入关键词 / 翻页 / 高级搜索                    |
| `getComicDetail`                                   | 打开漫画详情页                                        |
| `getPreview`                                       | 详情页加载漫画预览                                    |
| `getReadSnapshot`                                  | 阅读页初始化、切章                                    |
| `getChapter`                                       | 下载章节内容                                          |
| `getDownloadConcurrency`                           | 下载章节前获取图片下载并发数                          |
| `fetchImageBytes`                                  | 阅读/下载时获取图片二进制                             |
| `toggleLike`                                       | 详情页点点赞                                          |
| `startFavoriteAction`                              | 开始云端收藏工作流                                    |
| `continueFavoriteAction`                           | 继续云端收藏工作流或处理用户输入                      |
| ~~`toggleFavorite`~~ ⚠️已废弃 | 旧版详情页收藏兼容入口，仅供兼容、不再维护，新插件请用 `startFavoriteAction` |
| ~~`listFavoriteFolders`~~ ⚠️已废弃 | 旧版收藏后选择收藏夹，仅供兼容、不再维护，新插件请用 `startFavoriteAction` |
| ~~`moveFavoriteToFolder`~~ ⚠️已废弃 | 旧版用户确认收藏夹，仅供兼容、不再维护，新插件请用 `startFavoriteAction` |
| `getCommentFeed`                                   | 打开评论面板 / 翻页                                   |
| `loadCommentReplies`                               | 展开评论回复                                          |
| `postComment`                                      | 发送主评论                                            |
| `postCommentReply`                                 | 回复某条评论                                          |
| `getAdvancedSearchScheme`                          | 搜索页打开高级筛选                                    |
| `getComicListSceneBundle`                          | 发现页按 source 加载默认列表                          |
| `getFunctionPage`                                  | 功能页入口点进后加载自定义页面                        |
| `getRankingData`（示例名）                         | 列表页 body 请求（实际以 `scene.body.request.fnPath` 为准） |
| `getRankingFilterBundle`（示例名，按需配置）       | 列表页点筛选按钮（仅当 `scene` 配置了 `filter.fnPath` 时） |

以下为回调函数，由插件在 setting / capability 中指定 `fnPath`，用户操作时宿主代调：

| fnPath             | 触发条件               |
| ------------------ | ---------------------- |
| `onAuthChanged` 等 | 设置页字段变更         |
| `clearPluginCache` | 设置页点击能力操作按钮 |

---

## 2. 核心 API

### `getInfo()`（类型见 kit：`InfoContract`）

返回插件基本信息与功能入口。

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
  /** 更新通道：类似 GitHub Release API 的 latest 地址。仅 api.github.com 会走宿主加速。 */
  updateUrl?: string;
  /** 更新通道：npm 包名。优先用于查询 latest 与 CDN 下载。 */
  npmName?: string;
  function: PluginFunctionItem[];
};

// 更新行为说明见「调试与发布 → 插件更新」：
// - 在云端列表中的插件：静默更新只读列表坐标
// - 不在列表中的插件：静默更新 /「同步」读 getInfo 的 npmName / updateUrl

type PluginFunctionItem = {
  /** 入口标识：发现页按钮的 key。`openPluginFunction` 的外层 `id` 与其 `payload.id` 保持一致。 */
  id: string;
  /** 发现页按钮文案。 */
  title: string;
  /** 点击后宿主执行的操作。权威定义见 breeze-plugin-kit 的 `PluginAction` / `Open*Action`。 */
  action: PluginAction;
};
```

目前推荐使用 `openComicList` 作为功能入口。示例见 [快速开始](/guide/quick-start)。

入口定义见本节；点进后列表页样式见 `getRankingData(payload)`，
列表筛选见 `getRankingFilterBundle()`（示例名，按需配置），
功能页样式见 `getFunctionPage(payload)`，调用链见 6.5。

```ts
type PluginAction =
  // 打开分页漫画列表页。`scene.body.request.fnPath` 为插件导出的列表数据函数
  //（如 `getRankingData`），宿主分页调用，函数名可自定。`scene.filter` 为可选的筛选配置，
  // 仅当需要列表筛选时才配置：配置后必须提供真实可调用的筛选函数（如 `getRankingFilterBundle`），
  // 用户点击筛选时调用。`core` 放固定参数，`extern` 放透传上下文，合并规则见 6.2 / 6.5。
  | { type: "openComicList"; payload: { scene: ComicListScene } }
  // 打开插件自定义功能页。需同时实现 `getFunctionPage`，且 `payload.id` 须与其
  // 可处理的 `id` 对应，否则宿主报"未知功能"。`presentation` 为 `"page"` 整页
  // 或 `"dialog"` 弹窗。功能页布局节点见 `FunctionPageBodyNode`
  //（`chip-list` / `action-grid` / `comic-section-list` / `comic-grid`），
  // 格子点击一般再跳 `openSearch` / `openComicList`。
  | {
      type: "openPluginFunction";
      payload: {
        id: string;
        title?: string;
        presentation?: "page" | "dialog";
        source?: string;
      };
    }
  // `openCloudFavorite` 不再维护，仅为兼容保留；新插件如需收藏入口，请使用 `openComicList` 自建列表。
  | { type: "openCloudFavorite"; payload: { title: string; source?: string } }
  // `openSearch` 作为 function 入口不再维护，仅为兼容保留；新插件无需配置搜索入口，搜索由 `searchComic` 提供。
  // 该动作在详情页 metadata / titleMeta chip 的 `onTap` 中仍可使用。
  | {
      type: "openSearch";
      payload: { source?: string; keyword?: string; extern?: Record<string, unknown> };
    }
  // 直达漫画详情页。`comicId` 为目标漫画标识，`source` 缺省为当前插件，`extern` 为透传上下文。
  | {
      type: "openComicInfo";
      payload: {
        comicId: string;
        source?: string;
        extern: Record<string, unknown>;
      };
    }
  // 打开内置 WebView。`url` 为目标地址，`title` 为标题。
  // 一般不作为发现页入口，多用于设置 / 能力回调中打开外部页面。
  | { type: "openWeb"; payload: { title?: string; url: string } };

type ComicListScene = {
  title: string;
  source?: string; // 习惯上填当前插件 ID
  body: {
    type: "pluginPagedComicList";
    request: ComicListRequest;
  };
  filter?: ComicListRequest;
};

type ComicListRequest = {
  fnPath: string; // 列表数据函数名
  core?: Record<string, unknown>; // 固定请求参数
  extern?: Record<string, unknown>; // 透传上下文
};
```

`function` 字段行为说明：

- 允许空数组：发现页不展示该插件的功能按钮，搜索 / 详情链路不受影响。
- 与 `getComicListSceneBundle` 独立：前者是"入口按钮组"，后者是"发现页默认场景"，可只实现其一。
- 修改 `function` 入口需重装插件才能刷新，热更新不生效（见「快速开始 → 注意事项」）。
- `openSearch` 作为 function 入口不再维护，仅为兼容保留；新插件无需配置搜索入口，搜索由 `searchComic` 提供。
- `openCloudFavorite` 不再维护，仅为兼容保留；新插件如需收藏入口，请使用 `openComicList` 自建列表。
- `openComicDetail` 不再维护，请使用 `openComicInfo`。
- `scene.list` 写法不再维护，请使用 `scene.body.request`。

### `searchComic(payload)`（类型见 kit：`SearchComicPayload` / `SearchResultContract`）

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

`extern` 中会包含高级搜索选中的筛选项。

`extern` 是宿主原样透传的字段：请求带过去什么，响应就可以带回来什么，下一次
请求又会原样传回。除了高级筛选值，插件也可以用它存任何自定义状态（分页游标、
会话信息等），宿主不解读、不改写。

一个现成的用法是搜索书签：搜索结果页（右下按钮）存书签时，宿主会记下当时的
`extern`；点书签跳转时会原样回放，落页后若锚点不在本页，还可以用响应 `extern`
里的 `nextUrl` / `prevUrl` 逐页找回。所以翻页用的游标、当前页 URL 这类东西，
都可以放在响应 `extern` 里带回来——下次请求自然就有。

#### 非页码分页也可以适配搜索书签

纯页码式分页（`page=N` 稳定，如 JM / Bika）可以什么都不做：回放和找回都按
`page` 重新请求，结果天然一致。

URL 游标式分页（翻页靠服务端返回的下一页链接，如 E-hentai 的 `?next=`）如果想
让书签跳转落在正确页，可以参考 E-hentai 的做法：

1. 响应 `extern` 里带上 `currentUrl`（本页实际请求 URL）、`nextUrl`（下一页、
   无则空字符串）、`prevUrl`（上一页、无则空字符串），形成链条。
2. 书签回放那一次请求，宿主会在 payload 顶层带 `isSearchAggregate: true`
   （见 kit `SearchComicPayload`，只读顶层即可），此时可以直抓
   `extern.currentUrl`，而不按 `page` 拼 URL。

```ts
// 以 E-hentai 为例（URL 游标式）
const isAggregate = payload.isSearchAggregate === true;
const currentUrl = String(payload.extern?.currentUrl ?? "").trim();
const nextUrl = String(payload.extern?.nextUrl ?? "").trim();
const endpoint =
  isAggregate && currentUrl
    ? currentUrl // 书签回放：直抓记录的当前页
    : page > 1 && nextUrl
      ? nextUrl // 正常翻页：跟随游标
      : buildSearchEndpoint(keyword, page); // 首屏
// 响应 extern 回传：
// extern: { ...extern, currentUrl: endpoint, nextUrl, prevUrl }
```

### `getComicDetail(payload)`（类型见 kit：`ComicDetailPayload` / `ComicDetailContract`）

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
  eps: ChapterSummary[]; // 章节列表
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
  // 对应 allow 开关为 false 时展示给用户的原因，可选；
  // 为空或缺省时宿主显示默认文案「该插件暂不支持此功能」。
  allowCommentsReason?: string;
  allowLikeReason?: string;
  allowCollectedReason?: string;
  allowDownloadReason?: string;
  extern: Record<string, unknown>;
};

> `allow*` 为 `false` 时宿主会禁用对应入口，但会保留可点击的提示位：
> 点击后优先显示同名的 `allow*Reason`，为空则显示默认文案。
> 例如 `allowDownload: false` 时章节右侧仍显示下载按钮，点击后 toast 提示原因，
> 而不会直接发起下载。

> `creator` 必填，不可省略。无作者信息的图源填空值即可；`name` 与 `avatar.url`
> 同时为空时宿主隐藏作者卡片。注意 `avatar` 是唯一的例外：不要用通用图片构造
> 逻辑给它填占位 `url`（占位非空会导致卡片一直显示），直接手写全空 `ImageItem`；
> 不可点击时 `onTap` 置 `null`。

type PreviewCapability = {
  enabled: boolean;
  extern?: Record<string, unknown>;
};

// 基础类型
type ActionItem = {
  name: string;
  onTap: Record<string, unknown>;
  /** 长按复制的文本。缺省或 null 时复制 name。 */
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

> `url` 必须是非空占位符字符串，不能为 404 地址。宿主不会用它来下载图片，但会校验格式。图片下载完全由 `fetchImageBytes` 自行处理。

```ts
type MetadataListItem = { type: string; name: string; value: ActionItem[] };
```

### 章节字段说明

章节相关数据统一使用以下字段，会同时出现在 `CommonDetail` 的 `eps[]` 和 `getReadSnapshot` / `getChapter` 的返回中：

```ts
type ChapterSummary = {
  id: string; // 章节自身标识
  requestId: string; // 宿主调用 getReadSnapshot / getChapter 时用于请求章节
  logicalKey: string; // 宿主内部用于识别章节（大部分时候可与 requestId 相同）
  storageChapterId: string; // 下载到本地后的目录名（大部分时候可与 requestId 相同）
  name: string; // 章节名
  order: number; // 章节顺序
  /** 章节视觉分组标题，缺省 / null / 空白 = 不分组。详见下节「章节分组」。 */
  groupTitle?: string | null;
  extern: Record<string, unknown>; // 插件透传数据
};

type ChapterPage = {
  id: string;
  name: string;
  path: string;
  url: string;
  extern: Record<string, unknown>;
};
```

### 章节分组（`groupTitle`）

图源存在多种章节列表时（如"连载" / "番外" / "单行本"），把同组章节的
`groupTitle` 填成相同值即可。缺省 / `null` / 空白 = 不分组，宿主走单列扁平显示。

```ts
// 例：raw 侧两组，压平时保留分组信息
const eps: ChapterSummary[] = [
  ...serialChapters.map((c, i) => ({
    ...toSummary(c),
    groupTitle: "连载",
    order: i + 1, // order 必须全局唯一且刷新稳定，不能直接用 raw 侧的重叠序号
  })),
  ...volumeChapters.map((c, i) => ({
    ...toSummary(c),
    groupTitle: "单行本",
    order: serialChapters.length + i + 1,
  })),
];
```

约定（宿主行为）：

- 数据层保持扁平：`eps` 仍是唯一的章节列表，`order` 全局唯一且刷新稳定，
  是唯一的排序真相；不要发嵌套分组结构。
- 组顺序按章节在 `eps` 中的首次出现顺序推导，不另存顺序 key。
  想让"连载"排第一，就先放连载的章节。
- `name` 只填裸标题（如 `"第1话"`），不要自己拼分组前缀（如 `"连载—第1话"`）：
  分组信息只走 `groupTitle`，宿主按组展示，标题与分组不会混在一起。
- 填什么都行：`groupTitle` 是自由文本（`string | null`），
  有几组、叫什么，全由插件决定，宿主不校验、不映射。
- 上一话 / 下一话、继续阅读、下载选中等逻辑按全局 `order` 走，不受分组影响，
  跨组跳转天然可用。

### `getReadSnapshot(payload)`（类型见 kit：`ReadSnapshotPayload` / `ReadSnapshotContract`）

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
  chapterId?: string | number; // 即 requestId
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
    chapter: ChapterWithPages; // 当前章节 + 图片列表
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

`chapters` 是章节导航列表（精简版），`chapter` 是当前选中章节（含 `pages`）。

### `fetchImageBytes(payload)`（类型见 kit：`FetchImageBytesPayload` / `FetchImageBytesResult`）

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
  taskGroupKey?: string; // 下载任务组标识，宿主可通过它批量取消
  extern?: Record<string, unknown>;
};

type FetchImageBytesResult = Uint8Array<ArrayBufferLike>;
```

`url` 来自 `ImageItem.url`，宿主不会用它下载图片，下载逻辑由插件自行实现。但传入的 `url` 必须是有效占位符字符串，不能为空或 404 地址。

> ⚠️ **必须加二进制透传头**：`fetchImageBytes` 的请求头里务必带上 `"x-rquickjs-host-offload-binary-v1": "1"`。这会让宿主把响应作为原始二进制字节流返回，而不是做字符串化或编码转换等预处理。缺少该头时，图片数据极易出现长度不对、解码失败或显示异常。

```ts
// 实现建议：
async function fetchImageBytes({
  url,
  timeoutMs = 30000,
}: FetchImageBytesPayload): Promise<Uint8Array> {
  const res = await fetch(url, {
    headers: { "x-rquickjs-host-offload-binary-v1": "1" },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    throw new Error(`下载失败: ${res.status}`);
  }

  return new Uint8Array(await res.arrayBuffer());
}
```

### `getChapter(payload)`（类型见 kit：`ChapterPayload` / `ChapterContentContract`）

下载场景使用，结构与 `getReadSnapshot` 类似但携带完整的 `scheme + data + comicId/chapterId`：

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

## 3. 可选能力

### `getPreview(payload)`（类型见 kit：`PreviewPayload` / `PreviewContentContract`）

`preview` 是可选能力字段。支持预览的图源在 `data.normal` 中返回
`preview: { enabled: true }`；不支持预览时省略该字段。

详情页确认 `normal.preview.enabled` 后，宿主按页调用插件的 `getPreview`：

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

首次请求使用详情返回的 `normal.preview.extern`；插件返回的顶层 `extern`
会作为下一次请求的 `extern` 原样传回，可用于保存分页游标或会话状态。

当 `paging.hasReachedMax` 为 `true` 时，宿主停止继续请求。

### `getDownloadConcurrency()`（类型见 kit：`DownloadConcurrencyResult`）

下载章节前，宿主调用该函数获取图片下载并发数。**可选实现**：
未实现、返回非法或调用失败时，宿主回落为 `5`。

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

> 约束：宿主会将返回值取整并钳制到 `1~32`，每下载一章调用一次。

---

## 4. 社交 API

### `toggleLike(payload)`（类型见 kit：`ToggleLikePayload` / `ToggleLikeResult`）

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

### ~~`toggleFavorite(payload)`~~ ⚠️已废弃

> ⛔ **请勿实现旧版收藏 API**：`toggleFavorite` / `listFavoriteFolders` / `moveFavoriteToFolder`
> 均已废弃，当前宿主不再要求实现它们，未来版本可能直接移除。新插件只需实现
> “云端收藏工作流”（`startFavoriteAction` / `continueFavoriteAction`），详见《云端收藏工作流》。
> 即使为了兼容旧宿主也**不建议**实现旧 API——双协议并存只会增加维护负担。


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

`nextStep` 为 `selectFolder` 时，宿主会继续调用 `listFavoriteFolders` 和 `moveFavoriteToFolder`。

### ~~`listFavoriteFolders()`~~ ⚠️已废弃

> 仅供兼容、不再维护。新插件请实现“云端收藏工作流”，详见《云端收藏工作流》。

```ts
import type { ListFavoriteFoldersResult } from "breeze-plugin-kit";

async function listFavoriteFolders(): Promise<ListFavoriteFoldersResult> {}
```

```ts
type ListFavoriteFoldersResult = { items: Array<{ id: string; name: string }> };
```

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

以上三个函数属于旧版收藏协议，**已废弃**：当前没有任何实现要求，新插件**只实现**
`startFavoriteAction` 和 `continueFavoriteAction` 即可，以支持选择/创建收藏夹、
从指定收藏夹移除、移动、取消和部分成功。为避免双协议行为分叉，**不要**同时实现新旧两套收藏入口。

完整定义和实现示例见[云端收藏工作流](/guide/favorite-workflow)。

### 评论流（类型见 kit：`CommentFeedPayload` / `CommentFeedContract` 等）

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
    replyMode: "lazy" | "embedded"; // lazy: 按需加载回复, embedded: 回复内嵌
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

- `replyMode: "lazy"` — 回复按需加载，宿主会调 `loadCommentReplies`
- `replyMode: "embedded"` — 回复直接放在 `replies` 中，不再调 `loadCommentReplies`
- `insertHint.strategy` — `prependAfterTop` 插到列表顶部（主评论），`prepend` 插为回复

---

## 5. 发现与列表

点进功能入口后看什么，按需直达：

- 列表页长什么样、卡片字段怎么填 → `getRankingData(payload)`
- 列表筛选怎么做（含二级联动示例） → `getRankingFilterBundle()`（示例名，按需配置）
- 功能页四种区块怎么做 → `getFunctionPage(payload)`
- 筛选参数如何合并进列表请求 → 6.2；完整调用链 → 6.5

### `getAdvancedSearchScheme()`（类型见 kit：`AdvancedSearchContract`）

定义搜索页的高级搜索筛选项。用户选中后，筛选值会通过 `extern` 传入 `searchComic`。

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

### `getComicListSceneBundle()`（类型见 kit：`ComicListSceneBundleContract`）

定义发现页默认列表场景，返回 `data.scene`，宿主据此渲染列表页和调用 `body.request.fnPath` / `filter.fnPath`。

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

`ComicListScene` 类型见 `getInfo` 一节。

### `getRankingData(payload)`（类型见 kit：`SearchComicPayload` / `ComicPagedListContract`）

列表数据函数，由 `ComicListScene.body.request.fnPath` 指定。宿主分页请求列表数据时调用。

点进 `openComicList` 入口后，宿主渲染"漫画卡片网格"列表页：`data.items[]` 的每项按
"封面 + 标题 + 副标题 + 元信息"展示为一张卡片，点击卡片打开 `getComicDetail`。
`data.hasReachedMax` 为 `true` 时宿主停止分页请求。

卡片字段中 `id` / `title` / `cover` 必填（`cover.url` 为占位字符串，真实图片走
`fetchImageBytes`）；建议同时填充 `subtitle` / `metadata` / `likesCount` /
`viewsCount` / `updatedAt` / `finished`，否则对应位置留空。

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

### `getRankingFilterBundle()`（示例名，按需配置，类型见 kit：`FilterBundleContract`）

列表筛选函数，由 `ComicListScene.filter.fnPath` 指定。`filter` 本身可选：
不需要列表筛选时直接省略 `scene.filter`，此时列表页不展示筛选按钮；
需要筛选时才配置 `filter: { fnPath, core?, extern? }`，且 `fnPath` 必须指向插件
实际导出的可调用函数，否则用户点击筛选按钮会失败。

配置后，用户点击列表页筛选按钮时宿主调用该函数。

筛选面板按 `scheme.fields[]` 渲染：每个 `field` 一组，`label` 为组标题，
`options[].label` 为选项文案。`kind: "choice"` 渲染为分组单选；`kind: "dropdown"`
渲染为可点击展开的下拉框，适合几十上百项的长列表，`children` 会缩进展开在父项下方
（父项本身仍可选）。`data.values` 以 `field.key` 为键给出每组的默认选中
（`value` 语义由插件自定，宿主只做透传比对），为空时该组无默认选中。
`option.result.core` / `result.extern` 在用户确认后合并进下一次列表请求，合并规则见 6.2。

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
    core?: Record<string, unknown>; // 合并到列表请求 core
    extern?: Record<string, unknown>; // 合并到列表请求 extern
    params?: Record<string, unknown>; // UI 参数
    [key: string]: unknown;
  };
  children?: FilterOption[];
};
```

示例（含二级联动：部分父选项有子选项，部分没有；选中带 `children` 的父选项后才展开子选项）：

```ts
async function getRankingFilterBundle(): Promise<FilterBundleContract> {
  return {
    source: PLUGIN_ID,
    scheme: {
      version: "1.0.0",
      type: "rankingFilter",
      title: "筛选漫画",
      fields: [
        {
          key: "category",
          kind: "choice",
          label: "分类",
          options: [
            // 无子选项：选中即生效
            { label: "最新", value: "latest", result: { extern: { type: "0" } } },
            // 有子选项：选中父选项后展开 children 再选一项
            {
              label: "同人",
              value: "doujin",
              result: { extern: { type: "doujin" } },
              children: [
                { label: "汉化", value: "doujin_chinese", result: { extern: { type: "doujin_chinese" } } },
                { label: "日语", value: "doujin_japanese", result: { extern: { type: "doujin_japanese" } } },
              ],
            },
            {
              label: "单本",
              value: "single",
              result: { extern: { type: "single" } },
              children: [
                { label: "汉化", value: "single_chinese", result: { extern: { type: "single_chinese" } } },
                { label: "日语", value: "single_japanese", result: { extern: { type: "single_japanese" } } },
              ],
            },
          ],
        },
        {
          key: "order",
          kind: "choice",
          label: "排序",
          options: [
            { label: "最新", value: "new", result: { extern: { order: "new" } } },
            { label: "最热", value: "hot", result: { extern: { order: "hot" } } },
          ],
        },
      ],
    },
    data: { values: { category: "latest", order: "new" } },
  };
}

// 用户选中「同人 → 汉化」后，下一次列表请求的 extern 合并为 { ..., type: "doujin_chinese" }；
// 选中「最新」则直接合并 { ..., type: "0" }，无二级面板。合并规则见 6.2。
```

### `getFunctionPage(payload)`（类型见 kit：`GetFunctionPagePayload` / `FunctionPageContract`）

功能页数据函数，由 `openPluginFunction` 的 `payload.id` 指定。点进功能页入口后宿主调用，
入参 `{ id, page, core, extern }`（`id` 即入口配置的 `payload.id`），未知 `id` 应抛错。

```ts
import type {
  FunctionPageContract,
  GetFunctionPagePayload,
} from "breeze-plugin-kit";

async function getFunctionPage(
  payload: GetFunctionPagePayload,
): Promise<FunctionPageContract> {}
```

页面样式由 `scheme.body` 决定，`data` 按 `body` 引用的 `key` 提供内容。`scheme.body` 固定为
`{ type: "list", children: [...] }` 容器，`children` 每项声明一种区块及其数据来源：

- `{ type: "chip-list", key }`：标签条。`data[key]` 为 `{ items: [{ label, action }] }`，
  横向排列可点击标签，点击执行 `action`（一般为 `openSearch`）。
- `{ type: "action-grid", key }`：图标宫格。`data[key]` 为
  `{ items: [{ title, cover, action }] }`，`cover` 含 `url` / `path` / `extern`，
  点击格子执行 `action`（一般为 `openSearch` / `openComicList`）。
- `{ type: "comic-section-list", key }`：漫画分区列表。`data[key]` 为
  `{ sections: [{ title, subtitle, action, items: ComicListItem[] }] }`，
  每区渲染"标题 + 横滑漫画卡片"，卡片字段与列表页一致。
- `{ type: "comic-grid", key }`：漫画网格。`data[key]` 为 `{ items: ComicListItem[] }`，
  与列表页同样式，可带 `title` / `action` 作为区头。

`hasReachedMax` 为 `true` 时宿主停止对该 `key` 的分页请求。`presentation: "dialog"` 的
功能页适合放 `chip-list` 这类轻量区块，`"page"` 整页适合放宫格 / 分区 / 网格。

实战示例（哔咔插件的热搜 + 导航，`chip-list` 配 dialog、`action-grid` 配 page）：

```ts
import type { FunctionPageContract } from "breeze-plugin-kit";

async function getFunctionPage(payload = {}): Promise<FunctionPageContract> {
  const id = String(payload.id ?? payload.extern?.id ?? "");

  // 热搜：标签条，dialog 弹窗展示，点击标签跳搜索。
  if (id === "hotSearch") {
    const home = await getHomeData(payload);
    return {
      source: PLUGIN_ID,
      scheme: {
        version: "1.0.0",
        type: "page",
        title: "热搜",
        body: { type: "list", children: [{ type: "chip-list", key: "items" }] },
      },
      data: {
        items: home.keywords.map((keyword) => ({
          label: keyword,
          action: {
            type: "openSearch",
            payload: { keyword, extern: { source: "hotSearch" } },
          },
        })),
        hasReachedMax: true,
      },
    };
  }

  // 导航：图标宫格，整页展示点击格子跳对应 openComicList。
  if (id === "navigation") {
    const home = await getHomeData(payload);
    return {
      source: PLUGIN_ID,
      scheme: {
        version: "1.0.0",
        type: "page",
        title: "导航",
        body: { type: "list", children: [{ type: "action-grid", key: "items" }] },
      },
      data: {
        items: home.navItems.map((item) => ({
          title: item.title,
          cover: { url: item.cover, path: "", extern: {} },
          action: {
            type: "openComicList",
            payload: { scene: item.scene },
          },
        })),
        hasReachedMax: true,
      },
    };
  }

  throw new Error(`未知功能: ${id}`);
}
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
  data: FunctionPageData; // 按 body 引用 key 提供 items / sections，见上
};
```

### 插件首页 / 云端收藏 bundle（类型见 kit：`PluginHomeTab` / `PluginHomePagesBundleContract`）

第一页 `getPluginHomePagesBundle`、第二页 `getPluginCloudFavoritePagesBundle`，
入参都是空参 `core: {} + extern: { source }`。返回多个 tab，宿主 TabView 切换。
tab 载荷二选一：`scene` 走 `ComicListPage` 分页列表渲染，`page` 是上面的
`FunctionPageContract` 走 scheme 渲染（热搜 / 导航直接复用）。
`header.actions` 只能引用 `getInfo functions` 已定义的功能，Dart 统一渲染。

```ts
import type {
  PluginHomePagesBundleContract,
  PluginCloudFavoritePagesBundleContract,
} from "breeze-plugin-kit";

async function getPluginHomePagesBundle(
  payload = {},
): Promise<PluginHomePagesBundleContract> {
  const extern = { ...payload.extern, source: PLUGIN_ID };
  const [hotSearch, navigation] = await Promise.all([
    getFunctionPage({ core: {}, extern: { ...extern, id: "hotSearch" } }),
    getFunctionPage({ core: {}, extern: { ...extern, id: "navigation" } }),
  ]);
  return {
    source: PLUGIN_ID,
    scheme: { version: "1.0.0", type: "homePagesBundle" },
    data: {
      tabs: [
        { id: "hotSearch", title: "热搜", page: hotSearch },
        { id: "navigation", title: "导航", page: navigation },
        { id: "ranking", title: "排行榜", page: buildRankingScene() },
      ],
    },
  };
}

async function getPluginCloudFavoritePagesBundle(): Promise<PluginCloudFavoritePagesBundleContract> {
  return {
    source: PLUGIN_ID,
    scheme: { version: "1.0.0", type: "cloudFavoritePagesBundle" },
    data: {
      tabs: [
        { id: "cloudFavorite", title: "云端收藏", page: buildCloudFavoriteScene() },
      ],
    },
  };
}
```

云端收藏入口迁移：`openCloudFavorite` 不再维护，新插件用 `openComicList`
自建 scene（`body.request.fnPath` 指向收藏数据函数，`filter` 配收藏筛选），
与排行榜同一套渲染链路。


## 6. 设置

> 打开插件设置页时宿主**必调** `getSettingsBundle`；未导出会导致设置页报错
> （`target is not function: getSettingsBundle`）。无配置项的插件也必须导出，
> 返回最小包即可：
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

### `getSettingsBundle()`（类型见 kit：`SettingsBundleContract`）

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
    /** 声明支持登录页登录，设置页显示登录入口。 */
    canLogin?: boolean;
    /** 登录入口标题，缺省用宿主默认「账号登录」。 */
    loginTitle?: string | null;
    /** 登录入口副标题，缺省用宿主默认「前往登录」。 */
    loginSubtitle?: string | null;
    /** 声明支持新详情页，设置页显示详情入口，按需调 `getPluginDetail`。 */
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
  key: string; // 配置键，会出现在 values 和回调 payload 中
  kind: FieldKind; // "text" | "password" | "switch" | "select" | "choice" | "multiChoice"
  label: string; // 展示标签
  fnPath?: string; // 字段变更时回调
  persist?: boolean; // 是否由客户端持久化，默认 true
};
```

当用户修改携带 `fnPath` 的字段值时，宿主调用该函数，入参 `{ extern: Record<string, unknown>, key: string, value: unknown }`。

### `getCapabilitiesBundle()`（类型见 kit：`CapabilitiesBundleContract` / `CapabilityAction`）

设置页底部"操作"区段，点击后调用对应 `fnPath`。

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

### `getUserInfoBundle()`（类型见 kit：`UserInfoBundleContract`）

设置页用户信息卡片。

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

## 6.5 登录

登录页由插件声明表单、宿主负责渲染。流程：插件在需要登录时抛
`type: "unauthorized"` 错误（只带 `source` 与 `message`）→ 宿主弹确认框 →
用户确认后跳转登录页，登录页调 `getLoginBundle` 现取表单 → 提交调
`action.fnPath`，成功自动关闭，失败弹失败原因。

### `getLoginBundle()`（类型见 kit：`LoginBundleContract` / `LoginField`）

返回登录表单。字段 `kind` 取 `text` / `password` / `multiline` /
`captcha-image` / `slider-captcha`，分别对应普通输入、密码框、多行输入、
图形验证码、拼图滑块（点登录后宿主自动弹窗验证，要求宿主 3.0.37+）。
`data.values` 为回填值（建议只回填账号，密码留空）。

```ts
import type {
  LoginBundleContract,
  LoginBundleInit,
  LoginField,
} from "breeze-plugin-kit";

async function getLoginBundle(): Promise<LoginBundleContract> {}
```

完整形状（与 kit 类型一致，`buildLoginBundle` 入参为 `LoginBundleInit`）：

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
  fetchFnPath: string; // 取图函数，返回 `{ imageBase64: string; mimeType?: string }`
  refreshText?: string;
};

type LoginSliderConfig = {
  createFnPath: string; // 取题函数，返回 `{ token, bg, piece, y, w, h, s }`（bg/piece 为 dataURL）
  verifyFnPath: string; // 验题函数，入参 `{ token, x, track }`（track 为 `[t,x,y][]`），返回 `{ pass }`
  refreshText?: string;
};
```

拼图滑块：宿主调 `createFnPath` 取题（透传当前表单值）→ 弹窗验证 →
调 `verifyFnPath` 验题 → 通过后把一次性 `pass` 放入该字段值随表单提交。
`pass` 一次性，失败下次重验。

提交时宿主调用 `action.fnPath`，表单值放在 `core.values` 中。登录态持久化
由插件自己经 `pluginConfig` 完成，宿主不碰。登录函数可返回 `message?: string | null`
作为登录成功提示（缺省/null/空白时宿主用默认文案），类型见 kit 的 `LoginSubmitResult`：

```ts
type LoginSubmitResult = {
  source: string;
  message?: string | null;
  data?: { message?: string | null } & Record<string, unknown>;
} & Record<string, unknown>;
```
### need-login 错误

需要登录时抛 JSON 字符串错误，宿主识别 `type: "unauthorized"` 后走登录流程。
直接用 kit 的 `buildUnauthorizedError`（同步函数，只带身份与文案）：

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
    title: "示例登录",
    fields: [
      { key: "account", kind: "text", label: "用户名", required: true },
      { key: "password", kind: "password", label: "密码", required: true },
    ],
    submitFnPath: "loginWithPassword",
    values: { account: await authConfig.load("auth.account") },
  } satisfies LoginBundleInit);
}

// 鉴权失败处：
throw buildUnauthorizedError(PLUGIN_ID, "登录过期，请重新登录");
```

### 设置页登录入口

`getSettingsBundle` 的 `data` 声明 `canLogin: true` 后，设置页用户信息区底部
会出现"账号登录"行，点击打开登录页。推荐使用此办法进行登录或设置鉴权密钥。
标题/副标题可用 `data.loginTitle` / `data.loginSubtitle` 自定义
（如 Cookie 登录、API Key 登录），缺省/空白时用宿主默认文案。

### 插件详情页（类型见 kit：`PluginDetailContract`）

`getSettingsBundle` 的 `data` 声明 `canShowDetail: true` 后，设置页插件管理上方
出现"插件详情"入口，点击打开新详情页。详情内容按需调 `getPluginDetail` 获取，
不在列表/设置页预取。`describe` 支持 md 渲染（链接用外部浏览器打开）：

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

插件作者展示不再读 `getInfo.creator`（已删除）：商店作者名由云端
`repo`（owner/name）取 `/` 前的 owner，详情页作者名读
`getPluginDetail` 返回的 `data.creator.name`。

---

## 7. 数据流与调用链

### 6.1 搜索流程：高级搜索 → `searchComic`

```
用户打开搜索页 → 宿主调 getAdvancedSearchScheme() → 渲染高级搜索 UI
用户选择筛选项 → 不立即请求
用户点搜索 / 翻页 → 宿主调 searchComic({ keyword, page, extern: { sortBy, categories, ... } })
                                                         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                                         高级搜索选中的 key-value 放入 extern
```

具体来说：

- `getAdvancedSearchScheme().scheme.fields[].key` 定义了筛选参数名（如 `sortBy`、`categories`）
- 用户选择后，选中的 key-value 会放入 `searchComic` 的 `extern` 字段
- 插件在 `searchComic` 中通过 `extern.sortBy` / `extern.categories` 读取筛选值

### 6.2 筛选器：filter bundle → 列表请求

```
列表页加载 → 宿主调 body.request.fnPath（如 getRankingData）获取初始数据
用户点筛选 → 宿主调 filter.fnPath（如 getRankingFilterBundle）获取筛选项
用户选择筛选项 → 宿主将 option.result 合并到下一次列表请求
```

合并规则：

- `result.core` 中的字段**直接写入**下一次列表请求的顶层
- `result.extern` 中的字段**合并进**下一次列表请求的 `extern`

```ts
// 例如 FilterOption:
{ label: "日榜", value: "day", result: { core: { type: "comic" }, extern: { rankType: "day" } } }

// 用户选择后，下一次 getRankingData 的入参变为：
{ page: 1, type: "comic", extern: { source: "ranking", rankType: "day" } }
//       ^^^^^^^^^^^^                                    ^^^^^^^^^^^^^^^^
//       result.core 平铺                                result.extern 合并
```

### 6.3 设置字段回调

设置字段可携带 `fnPath`。用户修改字段值时，宿主调用该 `fnPath`，入参为：

```ts
type SettingsFieldCallbackPayload = {
  extern: Record<string, unknown>;
  key: string; // 字段 key，如 "auth.account"
  value: unknown; // 新值，可能是单值也可能是数组
};
```

示例：

```ts
{ extern: {}, key: "auth.remember", value: true }
{ extern: {}, key: "display.theme", value: "dark" }
{ extern: {}, key: "content.hiddenTags", value: ["tag-b", "tag-c", "tag-d"] }
```

- 普通字段（text / password / switch / choice）的 `value` 为单个值。
- `multiChoice` 字段的 `value` 为数组，例如 `onHiddenTagsChanged` 接收到的就是标签数组。

示例仓库中的对应回调：

- 文本/密码变更 → `onAuthChanged`
- 开关变更 → `onRememberChanged`、`onAdultChanged`
- choice 变更 → `onThemeChanged`、`onQualityChanged`
- multiChoice 变更 → `onHiddenTagsChanged`

插件可在回调中做校验、保存到配置等操作。

### 6.4 能力操作回调

`getCapabilitiesBundle().scheme.actions[]` 中每项的 `fnPath` 在用户点击时被宿主调用，无入参。

### 6.5 功能入口调用链

`getInfo().function[]` 定义了插件卡片上的功能入口按钮。以 `openComicList` 为例：

```
用户点"排行榜"按钮
  → 宿主读取对应 action.payload.scene
  → 渲染列表页（标题等；仅当 scene 配置了 filter 时才展示筛选按钮）
  → 调用 scene.body.request.fnPath（如 getRankingData）获取列表数据
  → 用户点筛选 → 调用 scene.filter.fnPath（如 getRankingFilterBundle）
```

`scene.body.request.core` 和 `scene.body.request.extern` 作为固定参数传入每次列表请求，与筛选器动态参数合并。

以 `openPluginFunction` 为例：

```
用户点功能按钮
  → 宿主读取 action.payload.id / presentation，打开整页或弹窗
  → 调用 getFunctionPage({ id }) 获取 scheme.body + data
  → 按 body.children 渲染 chip-list / action-grid / comic-section-list / comic-grid
  → 用户点格子 → 执行该项 action（如 openSearch / openComicList），进入对应列表或搜索页
```

### 6.6 实践建议

- **`core` 和 `extern` 各司其职**：业务参数（分页、类型、排序等）放 `core`，会话/上下文透传放 `extern`。能放进 `core` 的不要混进 `extern`。
- **筛选器 `options.value` 保持稳定**：一旦确定不要随版本改变语义，否则用户已保存的筛选值会失效。
- **`data.values` 一定给默认值**：避免空选项导致请求参数缺失，宿主不会补默认值。
- **对外提供的 `fnPath` 键名保持兼容**：如需要重命名，建议 `snake_case` + `camelCase` 同时导出。
