---
id: home
slug: /
sidebar_label: 文档首页
---

# Breeze 插件开发文档

:::tip 使用 AI 协助开发时：请先 clone 到本地
若你用 AI 助手写插件或改代码，建议把本仓库 **clone 到工作区**，让 AI 直接读本地 Markdown，而不是反复抓取在线页面。

```bash
git clone https://github.com/breeze-project-org/plugin-dev-docs.git
```

已有本地副本时，先 `git fetch` / `git pull` 再让 AI 阅读，避免对着过期文档改代码。

- 仓库：[github.com/breeze-project-org/plugin-dev-docs](https://github.com/breeze-project-org/plugin-dev-docs)
- 文档目录：`docs/guide/`（中文）、`i18n/en/docusaurus-plugin-content-docs/current/guide/`（英文）
:::

面向第三方插件开发者的接口与实现文档。

文档聚焦插件接口契约、页面协议、调试与发布流程。

> 注意
>
> 由于 Breeze 本体仍在快速开发中，文档可能不会始终及时更新。
>
> 具体实现请优先以示例项目为准：
> `https://github.com/deretame/Breeze-plugin-example`
>
> 如有建议或发现文档问题，请直接提交 issue：
> `https://github.com/breeze-project-org/Breeze/issues`

## 文档内容

- 基于示例仓库直接开工
- 运行时 API 参考（`fetch`、`bridge`、`crypto`、`Temporal`、时间向 `Intl`、`BreezeHtml`、域名前置与网络测量等）
- `breeze-plugin-kit` 工具包使用说明（类型、`cache`、`pluginConfig`、`opencc`、Temporal、Intl、HTML 解析等）
- 所有 fnPath 的 TypeScript 类型定义与调用语义
- 云端收藏工作流（选择/创建收藏夹、从目标收藏夹移除、继续与取消）
- Scheme + data 页面协议说明
- 本地联调、调试模式、打包发布流程
- 交付前检查清单

## 前置假设

- 插件运行在 QuickJS-NG 引擎中（不是 Node.js，不是浏览器）
- 使用 TypeScript 开发插件
- 使用 Node.js 22+
- 使用 pnpm 10+（推荐 11+）
- 构建产物为单文件 bundle（例如 `*.bundle.cjs`）
- 插件入口采用 `export default { ... }`

## 推荐起点

- 示例仓库：`https://github.com/deretame/Breeze-plugin-example`

建议直接 clone 示例仓库，在它的基础上改造自己的插件，而不是从空目录自行搭建。

## 推荐阅读顺序

1. [快速开始](/guide/quick-start)
  2. [运行时 API](/guide/runtime-api)（重点看 `fetch`、`BreezeHtml`、`crypto`、`Temporal`、`Intl`、[域名前置](/guide/runtime-api/network-fronting)）
  3. [breeze-plugin-kit 工具包](/guide/plugin-kit)（重点看 `cache`、`pluginConfig`、Temporal、Intl、HTML 解析类型）
4. [生命周期与结构](/guide/runtime-and-structure)
5. [插件 API 契约](/guide/plugin-api-contract)
6. [云端收藏工作流](/guide/favorite-workflow)
7. [调试与发布](/guide/debug-and-release)
8. [交付检查清单](/guide/checklist)
