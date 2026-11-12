---
sidebar_label: BreezeHtml 与开发范式
---

# BreezeHtml 与开发范式

## 类型定义

类型定义由 `breeze-plugin-kit` 包统一提供：

```bash
pnpm add breeze-plugin-kit
```

```ts
import type {
  SearchResultContract,
  ComicDetailContract,
} from "breeze-plugin-kit";
```

主要模块：

- 插件所有 `fnPath` 的请求/响应结构
- 运行时全局对象（`bridge`、`crypto`、`native`、`Temporal`、`Intl`、`fs` 等）的类型声明
- `hostRuntime`、`getApi`、`requireApi` 等便捷封装

详见 [breeze-plugin-kit 工具包](/guide/plugin-kit)。

## 便捷封装

`breeze-plugin-kit` 提供了常用功能的便捷封装：

- `cache.*` — 进程内缓存（生命周期跟随宿主进程）
- `pluginConfig.*` — 持久化配置
- `opencc.*` — 简繁转换
- `flutterTools.*` — Flutter 宿主交互（Toast、获取版本等）
- `setFrontHosts` / `probeFrontHosts` / `pickBestFrontIps` — 域名前置（IP 直连）与延迟探测
- `runtime.*` — 运行时工具（GC、任务取消检查等）

详细用法见 [breeze-plugin-kit 工具包](/guide/plugin-kit)。

## 常见用法

```ts
import { requireCryptoLike } from "breeze-plugin-kit";

const crypto = requireCryptoLike();
const encoder = new TextEncoder();

// 1. fetch 拉数据
const res = await fetch("https://api.example.com/list");
const data = await res.json();

// 2. crypto 计算摘要
const md5 = await crypto.md5(encoder.encode("data"));
const sha256 = crypto
  .createHash("sha256")
  .update(encoder.encode("data"))
  .digest("hex");

// 3. console 打日志
console.log("result:", data);
```

## BreezeHtml

`BreezeHtml` 是 Breeze 运行时注入的 **Rust 原生 HTML 解析与操作 API**，实现了 cheerio 的一个常用子集。对于需要解析 HTML 页面的插件（例如从网页抓取漫画列表、详情、章节），推荐优先使用它，而不是额外打包 cheerio 等解析库，可以显著减小 bundle 体积并提升解析性能。

### 基本用法

```ts
const $ = BreezeHtml.load(html);

// 选择元素
const title = $("title").text();
const links = $("a")
  .map((_, el) => $(el).attr("href"))
  .get()
  .filter(Boolean);
```

### 支持的 API

| 方法                                                                                                       | 说明                                   |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `BreezeHtml.load(html)`                                                                                    | 加载 HTML 字符串，返回 `$` 选择器函数  |
| `$(selector)`                                                                                              | 按 CSS 选择器查找元素                  |
| `.find(selector)`                                                                                          | 在当前选择范围内继续查找               |
| `.first()` / `.last()` / `.eq(i)`                                                                          | 取第几个匹配元素                       |
| `.closest(selector)` / `.parent()` / `.children(sel?)` / `.siblings(sel?)` / `.next(sel?)` / `.prev(sel?)` | 遍历 DOM                               |
| `.is(selector)`                                                                                            | 判断是否匹配选择器                     |
| `.filter(selector \| fn)` / `.has(selector)` / `.slice(start, end?)` / `.index()`                          | 过滤与索引                             |
| `.attr(name)`                                                                                              | 读取属性值                             |
| `.text()`                                                                                                  | 读取纯文本内容                         |
| `.html()`                                                                                                  | 读取 HTML 字符串                       |
| `.val()`                                                                                                   | 读取表单值                             |
| `.toArray()`                                                                                               | 返回选择器数组                         |
| `.each(fn)`                                                                                                | 遍历每个匹配元素                       |
| `.map(fn)`                                                                                                 | 映射每个匹配元素，`get()` 拿到结果数组 |

### 完整示例：解析搜索列表

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

### 与 cheerio 的关系

- `BreezeHtml` 不是完整 cheerio，只覆盖了插件开发中最常用的选择器与遍历操作。
- 如果你需要 cheerio 的高级功能（例如复杂的 DOM 修改、序列化控制），仍然可以自行安装 cheerio 并打包进 bundle。
- `breeze-plugin-kit` 提供了兼容别名：`CheerioAPI` 对应 `BreezeApi`，`Cheerio` 对应 `BreezeSelection`，方便从 cheerio 迁移。

### TypeScript 类型

`breeze-plugin-kit` 会自动注入 `BreezeHtml` 的全局类型，无需额外声明：

```ts
import type { CheerioAPI, Cheerio } from "breeze-plugin-kit";
```

## 完整开发范式

一个典型的插件接口实现会组合使用以下运行时 API：

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
  // 1. 构造请求
  const url = `https://api.example.com/search?q=${encodeURIComponent(payload.keyword ?? "")}&page=${payload.page ?? 1}`;

  // 2. 请求 HTML
  const res = await fetch(url);
  const html = await res.text();

  // 3. 用 BreezeHtml 解析
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

  // 4. 必要时做摘要/加密
  const sign = await crypto.md5(url);

  // ... 组装 SearchResultContract
}
```
