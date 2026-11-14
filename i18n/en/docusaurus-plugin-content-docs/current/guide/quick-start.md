# Quick Start

## 1) Environment

- Node.js 22+
- pnpm 10+ (11+ recommended)
- Git

## 2) Clone the Example Repository

```bash
git clone https://github.com/deretame/Breeze-plugin-example.git your-plugin-name
cd your-plugin-name
pnpm install
```

After cloning, remove the example repo's `.git` directory and re-initialize your own:

```bash
Remove-Item -Recurse -Force .git      # Windows PowerShell
# rm -rf .git                          # macOS / Linux
git init
```

## 3) Initial Configuration

Update the following after cloning:

### Plugin ID

Edit `PLUGIN_ID` in `src/common.ts`:

```ts
export const PLUGIN_ID = "your-plugin-uuid";
```

Any string works; a UUID v4 is recommended. It must be globally unique and must not collide with other plugins.

### Package Name

Change the `name` field in `package.json`. Using your plugin name is recommended.

### Version

Keep `version` in `x.y.z` format so jsDelivr can distribute builds later.

### Plugin Info

Edit `buildPluginInfo()` in `src/get-info.ts`:

- `npmName`: must match `name` in `package.json`. Used for jsDelivr CDN acceleration if published to npm; leave empty if not published.
- Other fields (`name`, `describe`, `iconUrl`, `home`, `updateUrl`) as needed.

### Feature Entries

The `buildPluginInfo().function` array defines feature entries shown on the Discover page. Prefer the `openComicList` type:

```ts
{
  id: "ranking",
  title: "Ranking",
  action: {
    type: "openComicList",
    payload: {
      scene: {
        title: "Ranking",
        source: PLUGIN_ID,
        body: {
          type: "pluginPagedComicList",
          request: {
            fnPath: "getRankingData",
            core: {},
            extern: { source: "ranking" },
          },
        },
        filter: {
          fnPath: "getRankingFilterBundle",
          extern: { source: "ranking" },
        },
      },
    },
  },
}
```

For a list page such as "Weekly Picks", use `openComicList` + `ComicListScene`; filtering uses `scene.filter`, same as cloud favorites:

```ts
{
  id: "week",
  title: "Weekly Picks",
  action: {
    type: "openComicList",
    payload: {
      scene: {
        title: "Weekly Picks",
        source: PLUGIN_ID,
        body: {
          type: "pluginPagedComicList",
          request: {
            fnPath: "getWeekMustWatchData",
            core: {},
            extern: { source: "weekMustWatch" },
          },
        },
        filter: {
          fnPath: "getWeekFilterBundle",
          core: {},
          extern: { source: "weekMustWatch" },
        },
      },
    },
  },
}
```

The filter function returns `FilterBundleContract`; use `kind: "dropdown"` for long lists such as weekly issue numbers, and `kind: "choice"` for a few categories.
The "Weekly Picks" tab is only shown when the app version is greater than `3.0.37`; the plugin checks `flutterTools.getAppVersion()`.

## 4) Recommended Integration Order

Wire APIs in this order so each step is easy to verify:

1. Implement `searchComic` so comics can be found
2. Implement `getComicDetail` so detail pages open
3. Implement `getReadSnapshot` so chapter and page info load
4. Implement `fetchImageBytes` so images load while reading
5. Finally implement `getChapter` and other optional capabilities for the download path

`getInfo` is mainly the plugin info entry; it is not the bottleneck of the reading pipeline.

## 5) Development & Debugging

### Start the Dev Server

```bash
pnpm run dev
```

The terminal will print the bundle URL:

```
[bundle-dev] built sha256=5edcba744965 size=84770
[bundle-dev] listening on 0.0.0.0:7878
[bundle-dev] available endpoints (by interface):
[bundle-dev]   [local] bundle: http://localhost:7878/your-plugin-name.bundle.cjs
[bundle-dev]   [local] log:    http://localhost:7878/log
```

Where:

- **bundle URL**: the plugin download URL used by Breeze to load the plugin
- **log URL**: remote log endpoint for plugin `console` output

### Install the Plugin

In Breeze: Discover → top-right settings → Plugin Store → Browse & Install → **Network Install**, then paste the bundle URL.

After install, use top-right **Sync** (check updates via `npmName` / `updateUrl`), or bottom **Update** to reinstall from a **network URL / local file**.  
Unlisted plugins can still silent-update or sync if `getInfo` exposes an update channel. See [Debug & Release → Plugin Updates](/guide/debug-and-release#4-plugin-updates).

### Debug Mode

1. After installing, return to Discover
2. Open the plugin's settings page
3. Enable **Debug Mode**
4. Paste the bundle URL
5. Save to pick up code changes live

In debug mode, when the bundle changes the host recreates the QuickJS instance; **in-memory plugin state is not preserved**.

### Remote Logging

In app settings, set “Debug Log URL” to the log endpoint from the dev server (e.g. `http://192.168.x.x:7878/log`). After restart, plugin `console` output and some Flutter logs appear in the terminal.

### Notes

- In dev mode, bundle changes hot-reload automatically; no manual rebuild is required
- Some features **cannot hot-reload**, such as `init` and `getInfo` `function` entries. After changing those, restart the app or reinstall the plugin
- Debug mode rebuilds the QJS instance, so module-level variables reinitialize
- For short-lived data use `cache` (lives with the host process; survives QJS rebuilds); for long-lived data use `config`

## 6) Project Structure

The example repo uses a pnpm workspace layout:

```text
Breeze-plugin-example/
  src/
    index.ts              # Plugin entry; export default API map
    common.ts             # Shared constructors and constants
    get-info.ts           # Plugin info assembly
  build/                  # Build scripts
  manifest.json           # Auto-generated by pnpm build
  package.json
  tsconfig.json
  rspack.config.ts
```

Notes:

- The object from `export default` is the API map; keys must match the `fnPath` values Breeze calls.
- `manifest.json` is generated by `pnpm run build` — **do not maintain it by hand**.
- Types and common helpers live in `breeze-plugin-kit`; new plugins can `pnpm add breeze-plugin-kit`.

## 7) Build

```bash
pnpm run build
```

Build pipeline: typecheck → generate version → generate manifest → rspack bundle → Brotli compress.

Output is under `dist/`.

## 8) Next Reading

Continue with [Runtime API](/guide/runtime-api), [breeze-plugin-kit Toolkit](/guide/plugin-kit), [Plugin API Contract](/guide/plugin-api-contract), and [Lifecycle & Structure](/guide/runtime-and-structure).
