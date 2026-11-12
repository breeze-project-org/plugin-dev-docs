# Delivery Checklist

## Code Contract

- [ ] `export default` includes every `fnPath` the host may call
- [ ] Reading pipeline implemented: `searchComic` / `getComicDetail` / `getReadSnapshot` / `fetchImageBytes`
- [ ] If download is supported, `getChapter` is implemented
- [ ] Plugin info, directory layout, and build scripts are based on the example repository
- [ ] Prefer `BreezeHtml` for HTML parsing; avoid bundling full cheerio

## Data Structures

- [ ] Search list `data.items[]` fields are complete (`id` / `title` / `cover` / `metadata` / `raw`)
- [ ] Detail page `data.normal.comicInfo` + `data.normal.eps` structure is complete
- [ ] Chapter list and chapter detail use unified fields: `id` / `requestId` / `logicalKey` / `storageChapterId` / `name` / `order`
- [ ] Sources with multiple chapter lists fill `groupTitle` for grouping, with globally unique and refresh-stable `order`
- [ ] All `extern` passthrough logic is closed-loop
- [ ] HTML parse results handle null / missing nodes so minor page changes do not crash the whole flow

## Business Flows

- [ ] Favorite / like flow (`startFavoriteAction` + `continueFavoriteAction` / `toggleLike`) works; do not implement the deprecated `toggleFavorite` legacy favorite APIs
- [ ] Comment feed (if implemented) supports pagination and replies
- [ ] Filters (if implemented) correctly emit `core` / `extern`

## Stability

- [ ] Network requests use unified timeouts and error mapping
- [ ] Auth expiry returns structured unauthorized errors
- [ ] `fetchImageBytes` returns `Uint8Array` directly, with header `x-rquickjs-host-offload-binary-v1: 1`
- [ ] All `ImageItem.url` values are valid non-empty placeholders (not empty or 404)
- [ ] If host fronting is used: go through `setFrontHosts` / `probeFrontHosts` and handle `ok: false` results
- [ ] Both debug mode and release mode pass end-to-end

## Release

- [ ] Bundle and plugin UUID are aligned (`uuid` is stable; do not change casually)
- [ ] Updated `version` in `buildPluginInfo()` in `src/get-info.ts`, then ran `pnpm build`
- [ ] Update channel configured: `npmName` and/or `updateUrl` (unlisted plugins need at least one, or silent update and Sync will not work)
- [ ] If using GitHub Release: tag matches `version`, `updateUrl` points to `.../releases/latest`
- [ ] Completed at least one full real-device regression (home → search → detail → read)
- [ ] Changelog covers new capabilities, behavior changes, and known limits
