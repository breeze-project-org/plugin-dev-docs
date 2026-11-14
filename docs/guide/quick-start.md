# 快速开始

## 1) 环境准备

- Node.js 22+
- pnpm 10+（推荐 11+）
- Git

## 2) 克隆示例仓库

```bash
git clone https://github.com/deretame/Breeze-plugin-example.git your-plugin-name
cd your-plugin-name
pnpm install
```

克隆后删除示例仓库的 `.git` 目录，重新初始化自己的仓库：

```bash
Remove-Item -Recurse -Force .git      # Windows PowerShell
# rm -rf .git                          # macOS / Linux
git init
```

## 3) 初始化配置

克隆后先修改以下内容：

### 插件 ID

修改 `src/common.ts` 中的 `PLUGIN_ID`：

```ts
export const PLUGIN_ID = "你的插件UUID";
```

值可以是任意字符串，推荐生成一个 UUID v4 作为 ID，需要保证全局唯一，不可与其他插件重复。

### 包名

修改 `package.json` 中的 `name` 字段，建议使用插件名称。

### 版本号

`version` 字段请保持 `x.y.z` 格式，以便后续通过 jsDelivr 加速分发。

### 插件信息

修改 `src/get-info.ts` 中的 `buildPluginInfo()`：

- `npmName`：需与 `package.json` 中的 `name` 一致。如果发布到 npm，会用于 jsDelivr CDN 加速；未发布可留空。
- 其他字段（`name`、`describe`、`iconUrl`、`home`、`updateUrl`）按需修改。

### 功能入口

`buildPluginInfo().function` 数组定义插件在发现页展示的功能入口。目前推荐使用 `openComicList` 类型：

```ts
{
  id: "ranking",
  title: "排行榜",
  action: {
    type: "openComicList",
    payload: {
      scene: {
        title: "排行榜",
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

「每周必看」这类列表页直接用 `openComicList` + `ComicListScene`，筛选和云端收藏一样走 `scene.filter`：

```ts
{
  id: "week",
  title: "每周必看",
  action: {
    type: "openComicList",
    payload: {
      scene: {
        title: "每周必看",
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

筛选函数返回 `FilterBundleContract`；期数这类长列表用 `kind: "dropdown"`，少量分类用 `kind: "choice"`。
「每周必看」tab 仅在 App 版本大于 `3.0.37` 时显示，插件通过 `flutterTools.getAppVersion()` 判断。

## 4) 推荐起步顺序

建议按以下顺序逐步接入 API，方便每步验证：

1. 先接 `searchComic`，保证能搜到漫画
2. 再接 `getComicDetail`，保证能打开详情页
3. 再接 `getReadSnapshot`，保证能拿到当前章节和页面信息
4. 再接 `fetchImageBytes`，保证阅读时能真正取到图片
5. 最后接 `getChapter` 和其他可选能力，补齐下载链路

`getInfo` 主要是插件信息入口，不是阅读主链路的优先瓶颈。

## 5) 开发调试

### 启动开发服务器

```bash
pnpm run dev
```

启动后终端会输出 bundle 地址：

```
[bundle-dev] built sha256=5edcba744965 size=84770
[bundle-dev] listening on 0.0.0.0:7878
[bundle-dev] available endpoints (by interface):
[bundle-dev]   [local] bundle: http://localhost:7878/your-plugin-name.bundle.cjs
[bundle-dev]   [local] log:    http://localhost:7878/log
```

其中：

- **bundle 地址**：插件的下载 URL，Breeze 通过此地址加载插件
- **log 地址**：远程日志端点，可查看插件运行时的 `console` 输出

### 安装插件

在 Breeze 中发现页 → 右上角设置 → 插件商店 → 浏览安装 → **网络安装**，输入 bundle 地址即可安装。

安装后可在插件设置页右上角 **同步**（按 `npmName` / `updateUrl` 检查更新），或在底部 **更新** 里手动用 **网络 URL / 本地文件** 重装。  
未进入插件列表时，只要 `getInfo` 配置了更新通道，仍可静默或手动同步。详见 [调试与发布 → 插件更新](/guide/debug-and-release#4-插件更新)。

### 调试模式

1. 安装插件后回到发现页
2. 进入该插件的设置页
3. 打开**调试模式**
4. 填入 bundle 地址
5. 保存后即可实时更新插件代码

调试模式下，bundle 文件变更后宿主会重建 QuickJS 实例，**插件内的内存状态不会保留**。

### 远程日志

在本体设置中找到「调试日志地址」，输入 dev server 输出的 log 地址（如 `http://192.168.x.x:7878/log`），重启后即可在终端看到插件的 `console` 输出以及部分 Flutter 日志。

### 注意事项

- 开发模式下 bundle 变更会自动热更新，无需手动重构建
- 部分功能**无法实时热更新**，如 `init`、`getInfo` 的 `function` 入口信息。如果修改了这类内容，需要重启软件，或卸载后重新安装插件才能触发刷新
- 调试模式下 QJS 实例重建，模块级变量会重新初始化
- 如果需要保留短期数据，放入 `cache`（随宿主进程存在，QJS 实例重建后仍可保留）；需要长期数据，放入 `config`

## 6) 工程结构

示例仓库采用 pnpm workspace 结构：

```text
Breeze-plugin-example/
  src/
    index.ts              # 插件入口，export default 导出 API 表
    common.ts             # 公共构造函数和常量
    get-info.ts           # 插件信息拼装
  build/                  # 构建脚本
  manifest.json           # 由 pnpm build 自动生成
  package.json
  tsconfig.json
  rspack.config.ts
```

说明：

- `export default` 导出的对象即 API 表，键名必须与 Breeze 调用的 `fnPath` 一致。
- `manifest.json` 通过 `pnpm run build` 自动生成，**不手动维护**。
- 类型和常用工具函数已拆到 `breeze-plugin-kit`，新插件直接 `pnpm add breeze-plugin-kit` 即可使用。

## 7) 构建

```bash
pnpm run build
```

构建流程：typecheck → 生成版本号 → 生成 manifest → rspack 打包 → Brotli 压缩。

产物在 `dist/` 目录。

## 8) 下一步阅读

继续看 [运行时 API](/guide/runtime-api)、[breeze-plugin-kit 工具包](/guide/plugin-kit)、[插件 API 契约](/guide/plugin-api-contract) 和 [生命周期与结构](/guide/runtime-and-structure)。
