# 交付检查清单

## 代码契约

- [ ] `export default` 包含所有宿主会调用的 `fnPath`
- [ ] 阅读主链路已实现：`searchComic/getComicDetail/getReadSnapshot/fetchImageBytes`
- [ ] 如支持下载，已实现 `getChapter`
- [ ] 已基于示例仓库整理插件信息、目录结构和构建脚本
- [ ] HTML 解析优先使用 `BreezeHtml`，避免把完整 cheerio 打包进 bundle

## 数据结构

- [ ] 搜索列表 `data.items[]` 的字段完整（`id/title/cover/metadata/raw`）
- [ ] 详情页 `data.normal.comicInfo + data.normal.eps` 结构完整
- [ ] 章节列表与章节详情使用统一章节字段：`id/requestId/logicalKey/storageChapterId/name/order`
- [ ] 多章节列表的图源已填 `groupTitle` 分组，`order` 全局唯一且刷新稳定
- [ ] 所有 `extern` 透传逻辑闭环
- [ ] HTML 解析结果做了空值/缺失节点兜底，不会因为页面结构微调就整体崩溃

## 业务流程

- [ ] 收藏/点赞流程（`startFavoriteAction`+`continueFavoriteAction`/`toggleLike`）可用；不要实现已废弃的 `toggleFavorite` 等旧版收藏 API
- [ ] 评论流（若实现）支持分页和回复
- [ ] 过滤器（若实现）能正确下发 `core/extern`

## 稳定性

- [ ] 网络请求统一超时与错误转换
- [ ] 登录过期返回 unauthorized 结构化错误
- [ ] `fetchImageBytes` 直接返回 `Uint8Array`，请求携带 `x-rquickjs-host-offload-binary-v1: 1`
- [ ] 所有 `ImageItem.url` 填写有效占位符字符串，不为空或 404
- [ ] 若使用域名前置：通过 `setFrontHosts` / `probeFrontHosts` 接入，并对返回的 `ok: false` 做兜底
- [ ] 调试模式与发布模式都跑通过

## 发布

- [ ] bundle 与插件 UUID 对齐（`uuid` 稳定，勿随意更换）
- [ ] 已更新 `src/get-info.ts` 中 `buildPluginInfo()` 的 `version` 字段，再执行 `pnpm build`
- [ ] 已配置更新通道：`npmName` 和/或 `updateUrl`（未进列表时二者至少其一，否则静默更新与「同步」无效）
- [ ] 若走 GitHub Release：tag 与 `version` 一致，`updateUrl` 指向 `.../releases/latest`
- [ ] 至少完成一次真实设备完整回归（首页 -> 搜索 -> 详情 -> 阅读）
- [ ] 变更记录已写清楚（新增能力、行为变化、已知限制）
