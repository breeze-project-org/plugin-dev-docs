---
id: runtime-api
slug: /guide/runtime-api
sidebar_label: 运行时 API 总览
---

# 运行时 API

Breeze 插件运行在 QuickJS-NG 引擎中，不是 Node.js 也不是浏览器环境。
下面列出标准 ECMAScript 之外，运行时额外提供的全局 API。


## 全局对象

插件启动后可直接使用的全局对象：

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
- `Intl`（时间向子集，见 [Temporal 与 Intl](/guide/runtime-api/time-and-intl#intl)）
- `BreezeHtml`
- `bytesToBase64` / `bytesFromBase64`
- `hostCrypto`
- `__web`
- `fronting`（域名前置：`setHosts` / `getHosts` / `clearHosts` / `probe`）

> ⚠️ **注意：`fs` 不在可用列表中。** `breeze-plugin-kit` 里保留了 `fs` 的类型声明，用于在纯 Node.js 测试环境中运行插件代码，但 Breeze **不会向正式运行时的插件注入 `fs` API**。这是出于安全考虑：允许插件直接访问宿主文件系统风险过高。插件应通过 `fetch` 等网络请求与外部交互，请不要在插件中使用 `fs`。

## 子章节

按职责拆分后，可以直接进入对应的运行时 API 子章节：

- [核心运行时 API](/guide/runtime-api/core)
- [加密 API](/guide/runtime-api/crypto)
- [Temporal 与 Intl](/guide/runtime-api/time-and-intl)
- [内置对象与工具](/guide/runtime-api/built-ins)
- [BreezeHtml 与开发范式](/guide/runtime-api/html-and-patterns)
- [域名前置与网络测量](/guide/runtime-api/network-fronting)（IP 直连、延迟探测、`Response.hostMeta`）
