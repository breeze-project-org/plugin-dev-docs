---
sidebar_label: Host Fronting & Network Measurement
---

# Host Fronting & Network Measurement

Some sites (notably `e-hentai.org` / `exhentai.org`) hit "DNS does not resolve + TLS handshake reset" in certain networks. The workaround is to connect straight to the site's real IP, send no SNI during the handshake, and declare the target site with a `Host` header.

JS cannot do any of this (protocol version, SNI and `Host` injection are decided by the network stack), so the host wraps the whole flow into three operations: **install the front table**, **measure latency**, **read response measurements**. Plugins only maintain a "domain → IP list" and leave the rest to the host.

An empty front table means every request takes the original path, with no impact on existing behavior.

Recommended entry points from `breeze-plugin-kit`:

| Capability | Entry point |
| --- | --- |
| Install / update the front table | `setFrontHosts(table)` |
| Read the front table | `getFrontHosts()` |
| Disable fronting | `clearFrontHosts()` |
| Measure latency | `probeFrontHosts(payload, { signal })` |
| ECH (encrypted SNI) | `setEchHosts(table)` |
| Response measurement | `res.hostMeta` |

The runtime also injects a `fronting` object (`setHosts` / `getHosts` / `clearHosts` / `probe`); if you prefer not to depend on the kit, use it directly — parameters and return values are identical.

## Front table

### `setFrontHosts(table)`

```ts
import { setFrontHosts } from "breeze-plugin-kit";

const result = setFrontHosts({
  "e-hentai.org": ["172.66.132.196", "172.66.140.62"],
  "s.exhentai.org": ["2606:4700::6810:84e5"],
});
// { ok: true, hosts: 2, ips: 3, rejected: 0, allowPrivateNetwork: true }
```

Rules:

- **Keys are domains**: `https://` prefixes and a trailing `/` are ignored; matching is case-insensitive.
- **Values are IP literals**: IPv6 accepts both bare and `[...]` forms; non-IP strings are dropped and counted in `rejected`.
- **Private / reserved addresses follow the "Block private network" toggle**: when it is on, such addresses are rejected at write time (off by default, same as normal requests); `allowPrivateNetwork` echoes the current policy.
- **Idempotent**: if the table content is unchanged, state is untouched — round-robin position and unhealthy records survive.
- **An empty object disables fronting**.
- **No domain allowlist check**: the table is the plugin's responsibility.

Matching is **longest-suffix**: with both `exhentai.org` and `s.exhentai.org` in the table, a request for `s.exhentai.org` hits the latter; the parent domain is only used when no more specific key exists.

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

`healthy: false` means the IP's last connect attempt failed; the host will not pick it for 5 minutes (it recovers automatically after the cooldown). Use it to observe the host's actual choice, or to drop unhealthy IPs from the table.

### `clearFrontHosts()`

Clears the front table; every request then goes back to "domain + system DNS".

```ts
import { clearFrontHosts } from "breeze-plugin-kit";

clearFrontHosts(); // or setFrontHosts({})
```

## ECH (encrypted SNI) {#ech}

Some sites (typically Cloudflare-based routes) **require SNI to complete the handshake** and reject connections without it — IP-direct fronting cannot help there. The host also provides ECH (Encrypted Client Hello): the URL keeps the domain, SNI is encrypted, the outer name is the ECHConfig `public_name`, and the edge decrypts it to route to the real domain.

```ts
import { setEchHosts } from "breeze-plugin-kit";

// Domain only: the host fills in ECHConfig and IPs via DoH HTTPS records
setEchHosts({ "picaapi.part26.art": {} });

// Or pin IPs / pass an ECHConfig (base64) yourself
setEchHosts({
  "picaapi.part26.art": {
    ips: ["104.21.86.93", "172.67.217.104"],
    ech: "AEX+...",
  },
});
```

- A value can be `{ ips?, ech? }` or a plain IP array; with both omitted the host uses DoH.
- The host pins the domain to the DoH `ipv4hint` (or your IPs) to bypass DNS poisoning.
- ECHConfig is cached for one hour; if it cannot be fetched the request falls back to plain TLS instead of failing.
- Difference from fronting: fronting sends no SNI plus a `Host` header; ECH encrypts SNI and keeps the domain URL. Do not register the same domain for both.
- Read back / clear: `getEchHosts()` / `clearEchHosts()`.

## Latency probing `probeFrontHosts` {#front-probe}

The host sends a `HEAD` request to each IP and times it, so the plugin can pick the best IP and write it back.

```ts
import { probeFrontHosts } from "breeze-plugin-kit";

const report = await probeFrontHosts({
  host: "e-hentai.org",
  ips: ["172.66.132.196", "172.66.140.62"],
  timeoutMs: 3000,
  samples: 2,
});
```

Parameters:

| Field | Default | Range | Notes |
| --- | --- | --- | --- |
| `host` | required | valid domain | Used for the `Host` header; IPs, ports, paths and `localhost` are rejected |
| `ips` | current table | ≤ 32 | When given explicitly, **no prior registration is needed**; when omitted, all IPs registered for that host are probed |
| `scheme` | `https` | `http` / `https` | Determines the port (443 / 80) |
| `timeoutMs` | `3000` | 500 ~ 10000 | Per-sample timeout |
| `concurrency` | `4` | 1 ~ 4 | In-batch concurrency |
| `samples` | `1` | 1 ~ 3 | Samples per IP |

Returns `{ ok: true, host, scheme, results }`; `results` keeps the order of the requested `ips`:

| Field | Notes |
| --- | --- |
| `ip` | Probed IP |
| `ok` | At least one response was received (any status code counts as reachable) |
| `status` | Status code of the first successful response |
| `ttfbMs` | Fastest sample (connect + handshake + server processing + first byte) |
| `avgMs` | Average of successful samples |
| `samplesMs` | Per-sample timings of successful samples |
| `samplesSent` / `samplesReceived` | Samples sent / succeeded |
| `lossRate` | Loss rate, 0 ~ 1 |
| `error` | Failure reason: `timeout` / `connect` / `request` / `other` / `busy` / `batch-timeout` |

Behavior:

- Sampling sends only `HEAD`, reads no body, fixes port and path, and sends no custom headers.
- Every sample is a fresh connection, so what you measure is cold-start latency.
- Two consecutive failures abandon the remaining samples for that IP, so a dead IP does not waste `samples × timeoutMs`.
- Each batch has an adaptive deadline (15 ~ 30 s); IPs that do not finish come back as `batch-timeout`.
- Probing is decoupled from the front table: probe a candidate set first, then write back the best.

Whole-batch failures return `{ ok: false, error }`:

| `error` | Meaning |
| --- | --- |
| `invalid-host` | `host` is not a valid domain |
| `invalid-ip` | Some IP is invalid or not allowed (an `ip` field is included) |
| `host-not-registered` | No `ips` given and the table has no entry for that host |
| `no-ips` | Nothing left to probe |
| `too-many-ips` | More than 32 IPs |
| `probe-busy` | This plugin already has 2 probe batches running |
| `probe-rate-limited` | Batch rate limit hit; `retryAfterMs` is included |
| `request-was-canceled` | Canceled (`canceled: true` is included) |

Rate limits are per plugin: 4 concurrent samples, 2 concurrent batches, and a batch token bucket of capacity 2 refilling one token every 5 seconds. Do not treat probing as a high-frequency polling API.

`probeFrontHosts(payload, { signal })` supports `AbortSignal` cancellation.

## Response measurement `Response.hostMeta` {#host-meta}

Every `fetch` response carries `hostMeta`:

```ts
const res = await fetch("https://e-hentai.org/");
const meta = res.hostMeta;
// {
//   ip: "172.66.132.196",     // fronted IP; null when not fronted
//   host: "e-hentai.org",     // fronted domain; null when not fronted
//   peerIp: "172.66.132.196", // actual TCP peer IP
//   bytes: 51234,             // response body size
//   ttfbMs: 210,              // request sent → response headers
//   bodyMs: 45,               // headers → body fully read
// }
```

| Field | Notes |
| --- | --- |
| `ip` / `host` | Fronted IP / domain for this request; both `null` when not fronted |
| `peerIp` | Actual TCP peer IP: DNS result when not fronted, proxy address when using a proxy |
| `bytes` | Body length |
| `ttfbMs` | Includes connect + handshake + server processing + first byte; same meaning as the probe's `ttfbMs` |
| `bodyMs` | Body transfer only; `bytes / bodyMs` is this request's actual throughput |

Uses:

- **Passive measurement**: collect per-IP performance from real business requests instead of sending extra probes.
- **Attribution**: tell "bad IP" apart from "slow site".
- **Verification**: confirm fronting actually took effect (`ip` is not `null`).

`hostMeta` survives `Response.clone()`; it is `null` on `Response` objects not produced by `fetch`.

## Behavior of fronted requests

- **Redirects are not followed**: `3xx` is returned as-is; read `Location` and request again yourself.
- **`res.url` stays the domain URL**: cache / dedupe / branch by domain; the actual IP is in `hostMeta.ip`.
- **An IP is only replaced on connect failure**: `4xx` / `5xx` mean the IP is alive and just refused the request, so no cooldown is triggered.
- **Round-robin, not best-of**: the host rotates over healthy IPs without ranking. For "fastest", write probe results back into the table yourself.
- **Config changes apply immediately**: after the user changes proxy / private-network policy, already-loaded plugins follow at once.

## Typical usage

### 1. Install a built-in table at startup

```ts
import { setFrontHosts } from "breeze-plugin-kit";

setFrontHosts({
  "e-hentai.org": ["172.66.132.196", "172.66.140.62"],
});
```

### 2. Probe, then write back the best IPs

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

// Drop ok=false entries and IPs with lossRate > 0.34, then take the 3 fastest by avgMs
const best = pickBestFrontIps(report, { limit: 3, maxLossRate: 0.34 });
if (best.length > 0) {
  setFrontHosts({ "e-hentai.org": best });
}
```

### 3. Passive measurement from real requests

```ts
const res = await fetch(url);
const meta = res.hostMeta;
if (meta?.ip && meta.bodyMs > 0) {
  throughput.set(meta.ip, meta.bytes / meta.bodyMs);
}
```

### 4. Disable fronting

```ts
import { clearFrontHosts } from "breeze-plugin-kit";

clearFrontHosts();
```

## Security boundaries

- The front table is **isolated per plugin**: a plugin can only read and write its own table; it cannot see or clear another plugin's.
- Private / reserved addresses are rejected **at write time** when "Block private network" is on, not on every request; with the toggle off they are allowed just like normal requests.
- Probing follows the same toggle and is bound by concurrency and rate limits.
- There is no raw TCP / UDP / WebSocket, and you cannot pick arbitrary ports or paths — probing is not a general-purpose port scanner.
