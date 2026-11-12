---
id: home
slug: /
sidebar_label: Home
---

# Breeze Plugin Development Docs

:::tip Using AI to help develop? Clone this repo first
If you use an AI assistant to write or change plugin code, **clone this repository into your workspace** so the AI can read the local Markdown — instead of scraping the live site repeatedly.

```bash
git clone https://github.com/breeze-project-org/plugin-dev-docs.git
```

If you already have a local copy, run `git fetch` / `git pull` before letting the AI read it, so you are not working against outdated docs.

- Repository: [github.com/breeze-project-org/plugin-dev-docs](https://github.com/breeze-project-org/plugin-dev-docs)
- Docs: `docs/guide/` (Chinese), `i18n/en/docusaurus-plugin-content-docs/current/guide/` (English)
:::

Interface and implementation docs for third-party plugin authors.

This documentation focuses on the plugin API contract, page protocol, debugging, and release workflow.

> Note
>
> Breeze itself is still under active development, so the docs may not always stay fully up to date.
>
> Prefer the example project as the source of truth for implementation details:
> `https://github.com/deretame/Breeze-plugin-example`
>
> Suggestions or doc issues can be filed at:
> `https://github.com/breeze-project-org/Breeze/issues`

## What's Covered

- Start from the example repository
- Runtime API reference (`fetch`, `bridge`, `crypto`, `Temporal`, time-focused `Intl`, `BreezeHtml`, host fronting & network measurement, etc.)
- `breeze-plugin-kit` toolkit guide (types, `cache`, `pluginConfig`, `opencc`, Temporal, Intl, HTML parsing, etc.)
- TypeScript types and call semantics for every fnPath
- Scheme + data page protocol
- Local debugging, debug mode, packaging and release
- Pre-delivery checklist

## Assumptions

- Plugins run in the QuickJS-NG engine (not Node.js, not a browser)
- Plugins are written in TypeScript
- Node.js 22+
- pnpm 10+ (11+ recommended)
- Build output is a single-file bundle (e.g. `*.bundle.cjs`)
- Plugin entry uses `export default { ... }`

## Recommended Starting Point

- Example repository: `https://github.com/deretame/Breeze-plugin-example`

Clone the example repo and adapt it for your plugin instead of scaffolding from an empty directory.

## Suggested Reading Order

1. [Quick Start](/guide/quick-start)
  2. [Runtime API](/guide/runtime-api) (focus on `fetch`, `BreezeHtml`, `crypto`, `Temporal`, `Intl`)
  3. [breeze-plugin-kit Toolkit](/guide/plugin-kit) (focus on `cache`, `pluginConfig`, Temporal, Intl, HTML parsing types)
4. [Lifecycle & Structure](/guide/runtime-and-structure)
5. [Plugin API Contract](/guide/plugin-api-contract)
6. [Debug & Release](/guide/debug-and-release)
7. [Delivery Checklist](/guide/checklist)
