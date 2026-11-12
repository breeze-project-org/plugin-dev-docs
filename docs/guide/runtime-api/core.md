---
sidebar_label: 核心运行时 API
---

# 核心运行时 API

## fetch

标准 `fetch` 实现。

```js
const res = await fetch("https://api.example.com/data");
const data = await res.json(); // JSON
const text = await res.text(); // 文本
const blob = await res.blob(); // Blob
const buf = await res.arrayBuffer(); // ArrayBuffer
```

配套对象 `Request`、`Response`、`Headers`、`AbortController`、`AbortSignal`、`FormData`、`Blob`、`File` 均可用。

```js
// 超时控制
const ac = new AbortController();
setTimeout(() => ac.abort(), 10000);
const res = await fetch(url, { signal: ac.signal });

// 或
const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
```

### 二进制响应优化

对于返回二进制的接口（例如图片下载），强烈建议在请求头中加入：

```
x-rquickjs-host-offload-binary-v1: 1
```

作用：显式声明“本次响应需要以原始二进制形式返回”，强制宿主直接把字节流透传给插件。如果不加这个头，宿主可能会把二进制响应当作普通数据做预处理（例如字符串化、编码转换或格式包装），导致拿到的数据失真、长度不对或图片解码失败。

```js
const res = await fetch(url, {
  headers: { "x-rquickjs-host-offload-binary-v1": "1" },
});
const buf = await res.arrayBuffer();
```

> ⚠️ `arrayBuffer()` 底层可能带 `byteOffset`，直接 `new DataView(buf)` /
> `new Uint8Array(buf)` 会读错位置。解析二进制（索引文件、图片头等）时务必带偏移构造：
>
> ```js
> const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
> const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
> ```

> 建议：在 `fetchImageBytes` 中**始终携带该请求头**，这是图片能正常显示的最常见原因之一。

### 响应测量 `hostMeta`

每个 `fetch` 响应都带一个非标准扩展字段 `hostMeta`，记录宿主侧的测量结果：

```js
const res = await fetch(url);
const { ip, host, peerIp, bytes, ttfbMs, bodyMs } = res.hostMeta;
```

- `ip` / `host`：本次走的是哪个前置 IP / 域名，未走域名前置时都是 `null`
- `peerIp`：实际 TCP 对端 IP（走代理时是代理地址）
- `bytes`：响应体字节数
- `ttfbMs`：发出请求到收到响应头（含建连 + TLS 握手 + 首字节）
- `bodyMs`：响应头到 body 读完，`bytes / bodyMs` 即本次吞吐

宿主只测量不做优选，插件可以据此做被动测速或归因。域名前置（IP 直连）的完整说明见 [域名前置与网络测量](/guide/runtime-api/network-fronting)。

## bridge

插件与 Rust 宿主通信的唯一桥梁。

### 方法

- `bridge.call(name, ...args)` — 异步调用宿主路由
- `bridge.callSync(name, ...args)` — 同步调用（会阻塞，谨慎使用）
- `bridge.gzipCompress(input)` — gzip 压缩
- `bridge.gzipDecompress(input)` — gzip 解压

### 内建路由

以下路由开箱即用，无需注册：

**压缩**

- `compression.gzip_compress`
- `compression.gzip_decompress`

**原生**

- `native.put`
- `native.take`
- `native.exec`

**数学**

- `math.add`

> 加密相关路由（`crypto.*`）见下文 [crypto](/guide/runtime-api/crypto) 章节，不在此处重复列出。

## native

字节缓冲池，用于管理二进制数据。大部分场景用 `fetch` 和 `bridge` 即可，不推荐直接操作。

主要方法：

- `native.put(input)` — 将数据放入缓冲池，返回 id
- `native.take(id)` — 从缓冲池取出数据
- `native.free(id)` — 释放缓冲

## console

```js
console.log("...");
console.info("...");
console.warn("...");
console.error("...");
console.debug("...");
```

输出会转到宿主日志。其他 console 方法会 fallback 到 `console.log` 同级逻辑。
