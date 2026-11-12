---
sidebar_label: 域名前置与网络测量
---

# 域名前置与网络测量

部分站点（典型如 `e-hentai.org` / `exhentai.org`）在特定网络环境下会遇到「域名解析不到 + TLS 握手被重置」。绕过方式是直连站点真实 IP、握手时不发 SNI、再用 `Host` 头声明要访问哪个站点。

这些动作在 JS 层做不了（协议版本、SNI、`Host` 注入都由网络栈决定），所以宿主把整套流程封装成三个操作：**下发前置表**、**测延迟**、**看响应测量**。插件只需要维护「域名 → IP 列表」，其余交给宿主。

前置表为空时所有请求都走原链路，对既有行为没有影响。

推荐通过 `breeze-plugin-kit` 使用：

| 能力 | 入口 |
| --- | --- |
| 下发 / 更新前置表 | `setFrontHosts(table)` |
| 读回前置表 | `getFrontHosts()` |
| 关闭前置 | `clearFrontHosts()` |
| 测延迟 | `probeFrontHosts(payload, { signal })` |
| ECH（加密 SNI） | `setEchHosts(table)` |
| 响应测量 | `res.hostMeta` |

运行时另外注入了 `fronting` 对象（`setHosts` / `getHosts` / `clearHosts` / `probe`），不引入 kit 时可以直接用它，参数与返回值一致。

## 前置表

### `setFrontHosts(table)`

```ts
import { setFrontHosts } from "breeze-plugin-kit";

const result = setFrontHosts({
  "e-hentai.org": ["172.66.132.196", "172.66.140.62"],
  "s.exhentai.org": ["2606:4700::6810:84e5"],
});
// { ok: true, hosts: 2, ips: 3, rejected: 0, allowPrivateNetwork: true }
```

规则：

- **键是域名**：`https://` 前缀与结尾 `/` 会被忽略，大小写不敏感。
- **值是 IP 字面量**：IPv6 裸写或 `[...]` 写法都可以；非 IP 字符串会被丢弃并计入 `rejected`。
- **内网 / 保留地址跟随「内网拦截」开关**：开关打开时这些地址在写入阶段就被拒绝（默认关闭，与普通请求一致），`allowPrivateNetwork` 回显当前策略。
- **幂等**：表内容没变就不动状态，轮询位置与不健康记录都会保留。
- **传空对象等于关闭前置**。
- **宿主不校验域名白名单**：表由插件自己维护。

匹配是**最长后缀匹配**：表里同时有 `exhentai.org` 和 `s.exhentai.org` 时，请求 `s.exhentai.org` 命中后者；只有表里没有更具体的键时才回落到父域。

### `getFrontHosts()`

```ts
import { getFrontHosts } from "breeze-plugin-kit";

const table = getFrontHosts();
// {
//   ok: true,
//   hosts: {
//     "e-hentai.org": [
//       { ip: "172.66.132.196", healthy: true },
//       { ip: "172.66.140.62", healthy: false },
//     ],
//   },
// }
```

`healthy: false` 表示这个 IP 最近一次连接失败，宿主在 5 分钟内不会再选它（冷却结束后自动恢复）。可以用它观察宿主的实际选择，或把不健康的 IP 从表里剔除。

### `clearFrontHosts()`

清空前置表，之后所有请求回到「域名 + 系统 DNS」链路。

```ts
import { clearFrontHosts } from "breeze-plugin-kit";

clearFrontHosts(); // 或 setFrontHosts({})
```

## ECH（加密 SNI） {#ech}

有些站点（典型是 Cloudflare 的分流线路）**必须收到 SNI 才肯握手**，不发 SNI 会被直接拒绝——这类站点用不了上面的「IP 直连」。宿主另外提供了 ECH（Encrypted Client Hello）：URL 保持域名、SNI 加密，外层是 ECHConfig 里的 `public_name`，边缘解密后按真实域名路由。

```ts
import { setEchHosts } from "breeze-plugin-kit";

// 只登记域名即可：ECHConfig 和 IP 由宿主用 DoH 的 HTTPS 记录补齐
setEchHosts({ "picaapi.part26.art": {} });

// 也可以自己钉死 IP / 传 ECHConfig（base64）
setEchHosts({
  "picaapi.part26.art": {
    ips: ["104.21.86.93", "172.67.217.104"],
    ech: "AEX+...",
  },
});
```

- 值可以是 `{ ips?, ech? }`，也可以直接给 IP 数组；两者都省略时宿主自己走 DoH。
- 宿主会把域名钉到 DoH 的 `ipv4hint`（或你给的 IP）上，避免 DNS 污染。
- ECHConfig 缓存 1 小时；拉不到时回退普通 TLS，不会把请求打死。
- 和前置的区别：前置是「不发 SNI + `Host` 头」，ECH 是「加密 SNI + 域名 URL」。同一个域名不要同时登记到两边。
- 读回 / 清空：`getEchHosts()` / `clearEchHosts()`。

## 延迟探测 `probeFrontHosts` {#front-probe}

宿主对每个 IP 发 `HEAD` 请求并计时，插件据此挑最优 IP 写回表。

```ts
import { probeFrontHosts } from "breeze-plugin-kit";

const report = await probeFrontHosts({
  host: "e-hentai.org",
  ips: ["172.66.132.196", "172.66.140.62"],
  timeoutMs: 3000,
  samples: 2,
});
```

参数：

| 字段 | 默认 | 范围 | 说明 |
| --- | --- | --- | --- |
| `host` | 必填 | 合法域名 | 用于 `Host` 头；不接受 IP、端口、路径与 `localhost` |
| `ips` | 当前表 | ≤ 32 个 | 显式给出时**不需要先写进表**；省略则测表里该 host 的全部 IP |
| `scheme` | `https` | `http` / `https` | 决定端口（443 / 80） |
| `timeoutMs` | `3000` | 500 ~ 10000 | 单个采样超时 |
| `concurrency` | `4` | 1 ~ 4 | 批次内并发 |
| `samples` | `1` | 1 ~ 3 | 每个 IP 的采样次数 |

返回 `{ ok: true, host, scheme, results }`，`results` 顺序与请求的 `ips` 一致：

| 字段 | 说明 |
| --- | --- |
| `ip` | 被测 IP |
| `ok` | 收到过至少一次响应（任何状态码都算可达） |
| `status` | 第一次成功响应的状态码 |
| `ttfbMs` | 最快一次采样（建连 + 握手 + 服务端处理 + 首字节） |
| `avgMs` | 成功采样的平均耗时 |
| `samplesMs` | 每次成功采样的耗时明细 |
| `samplesSent` / `samplesReceived` | 发出 / 成功的采样数 |
| `lossRate` | 丢包率，0 ~ 1 |
| `error` | 失败原因：`timeout` / `connect` / `request` / `other` / `busy` / `batch-timeout` |

行为：

- 采样只发 `HEAD`，不读响应体，端口与路径固定，不会带自定义 header。
- 每次采样都是新连接，量到的是冷启动延迟。
- 连续两次失败就放弃该 IP 的剩余采样，死 IP 不会白等 `samples × timeoutMs`。
- 整批有自适应截止时间（15 ~ 30 秒），超时未完成的 IP 以 `batch-timeout` 返回。
- 探测与前置表解耦：可以先测一批候选，再把最优的写回。

整体失败返回 `{ ok: false, error }`：

| `error` | 含义 |
| --- | --- |
| `invalid-host` | `host` 不是合法域名 |
| `invalid-ip` | 某个 IP 非法或不被允许（附 `ip`） |
| `host-not-registered` | 未传 `ips`，且表里没有该 host |
| `no-ips` | 解析后没有可测的 IP |
| `too-many-ips` | 超过 32 个 IP |
| `probe-busy` | 本插件已有 2 个探测批次在跑 |
| `probe-rate-limited` | 触发批次限频，附 `retryAfterMs` |
| `request-was-canceled` | 被取消（附 `canceled: true`） |

限流按插件隔离：4 个并发采样、2 个并发批次、批次令牌桶容量 2（每 5 秒补 1）。不要把它当高频轮询接口用。

`probeFrontHosts(payload, { signal })` 支持 `AbortSignal` 取消。

## 响应测量 `Response.hostMeta` {#host-meta}

每次 `fetch` 的响应都带 `hostMeta`：

```ts
const res = await fetch("https://e-hentai.org/");
const meta = res.hostMeta;
// {
//   ip: "172.66.132.196",     // 前置 IP；未前置时 null
//   host: "e-hentai.org",     // 前置域名；未前置时 null
//   peerIp: "172.66.132.196", // 实际 TCP 对端 IP
//   bytes: 51234,             // 响应体字节数
//   ttfbMs: 210,              // 发出请求 → 收到响应头
//   bodyMs: 45,               // 响应头 → body 读完
// }
```

| 字段 | 说明 |
| --- | --- |
| `ip` / `host` | 本次走的前置 IP / 域名；未前置时都是 `null` |
| `peerIp` | 实际 TCP 对端 IP：未前置时是 DNS 解析结果，走代理时是代理地址 |
| `bytes` | 响应体长度 |
| `ttfbMs` | 含建连 + 握手 + 服务端处理 + 首字节，与探测的 `ttfbMs` 同义 |
| `bodyMs` | 只含 body 传输，`bytes / bodyMs` 就是这次请求的实际吞吐 |

用途：

- **被动测速**：不用额外发探测请求，直接从真实业务请求里收集每个 IP 的表现。
- **归因**：请求变慢时能区分「连的 IP 差」还是「站点本身慢」。
- **校验**：确认前置是否真的生效（`ip` 非 `null`）。

`hostMeta` 在 `Response.clone()` 后保留；不是 `fetch` 产生的 `Response` 上为 `null`。

## 前置请求的行为

- **不跟随重定向**：`3xx` 原样返回，需要自己读 `Location` 再请求。
- **`res.url` 仍是域名 URL**：按域名做缓存 / 去重 / 判定，实际 IP 看 `hostMeta.ip`。
- **连接失败才换 IP**：`4xx` / `5xx` 说明 IP 活着，只是被站点拒绝，不触发冷却。
- **轮询而非优选**：宿主在健康 IP 之间轮换，不做排序。要「最快」得自己用探测结果写回表。
- **配置即时生效**：用户改代理 / 内网策略后，已加载的插件立刻跟随。

## 典型用法

### 1. 启动时下发内置表

```ts
import { setFrontHosts } from "breeze-plugin-kit";

setFrontHosts({
  "e-hentai.org": ["172.66.132.196", "172.66.140.62"],
});
```

### 2. 探测后写回最优 IP

```ts
import {
  pickBestFrontIps,
  probeFrontHosts,
  setFrontHosts,
} from "breeze-plugin-kit";

const report = await probeFrontHosts({
  host: "e-hentai.org",
  ips: candidates,
  timeoutMs: 3000,
  samples: 2,
});

// 过滤掉 ok=false 与丢包率 > 0.34 的 IP，按 avgMs 升序取前 3 个
const best = pickBestFrontIps(report, { limit: 3, maxLossRate: 0.34 });
if (best.length > 0) {
  setFrontHosts({ "e-hentai.org": best });
}
```

### 3. 用真实请求做被动测量

```ts
const res = await fetch(url);
const meta = res.hostMeta;
if (meta?.ip && meta.bodyMs > 0) {
  throughput.set(meta.ip, meta.bytes / meta.bodyMs);
}
```

### 4. 关闭前置

```ts
import { clearFrontHosts } from "breeze-plugin-kit";

clearFrontHosts();
```

## 安全边界

- 前置表**按插件隔离**：插件只能读写自己的表，看不到也清不掉别的插件的。
- 内网 / 保留地址在**写入时**就被拒绝（开启「内网拦截」时），不是每次请求再判断；开关关闭时与普通请求一样放行。
- 探测同样跟随该开关，并受并发与限频约束。
- 没有原始 TCP / UDP / WebSocket，也不能指定任意端口或路径，探测不是通用端口扫描器。
