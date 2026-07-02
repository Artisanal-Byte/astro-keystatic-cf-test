# Findings

Final log of findings from the Astro + Cloudflare + Keystatic test project. Both positive (things that work) and negative (things that break, gotchas, constraints) findings are recorded. All four test cases passed both locally and on production (CF Pages), with caveats noted below.

---

## Astro 6 Upgrade Findings

Findings from upgrading @astrojs/cloudflare from v12 (Astro 5) to v13 (Astro 6).

### Breaking changes from the adapter upgrade

- **`Astro.locals.runtime.env` removed in v13.** Must use `import { env } from 'cloudflare:workers'` instead. This affects D1 access (Test 3) and env var access (Test 2).
- **`platformProxy: { enabled: true }` still works for local dev** — it wires bindings via Miniflare. But at runtime on CF, the `cloudflare:workers` import provides the actual Cloudflare bindings.
- **`prerenderEnvironment: 'workerd'` (default) causes build-time ASSETS binding conflict.** Must set `prerenderEnvironment: 'node'` in the adapter config to avoid "The name 'ASSETS' is reserved" error during build. (Note: this fixed the *build* but the *deploy-time* validation still rejected the generated `dist/server/wrangler.json` — see deploy config fixes below.)

### Deploy config fixes (generated `dist/server/wrangler.json`)

Two errors in the adapter-generated `dist/server/wrangler.json` blocked Pages deployment:

1. **`kv_namespaces[0]` missing `id` field.** The adapter auto-adds `{ binding: "SESSION" }` for Astro sessions, but Pages deploy validation requires a KV namespace ID. Fix: create the namespace via `wrangler kv namespace create SESSION`, add `kv_namespaces` with the real `id` to `wrangler.jsonc`.

2. **`assets: { binding: "ASSETS" }` is reserved in Pages projects.** The adapter hardcodes `DEFAULT_ASSETS_BINDING_NAME = "ASSETS"` with no option to rename it. In Pages, `ASSETS` is reserved by the platform. Fix: add a `fix-wrangler.js` post-build script that deletes the `assets` block from `dist/server/wrangler.json`. Pages provides `env.ASSETS` natively — the worker runtime code (`matchStaticAsset`, `fallbackToAssets` in `cf-helpers.js`) that accesses `env.ASSETS` still works because the binding is auto-injected by Pages.

---

## Test Build Findings

Findings discovered while scaffolding the test project and getting `bun run build` to pass. These are build-time / wiring facts, not runtime test results.

### Architecture

- **Astro 5 has no `hybrid` output mode.** Use `output: 'static'` (the default) and opt individual routes into SSR with `export const prerender = false` at the top of the page. This gives the mixed SSG/SSR model the plan needs. Verified: `index.astro` and `local-posts.astro` prerender; `ssr.astro`, `github-posts.astro`, and `api/hello.ts` run on the Cloudflare worker.
- **`@astrojs/cloudflare` adapter works in `static` output mode** — it emits a `_worker.js/` directory alongside the static assets. Build succeeded without falling back to a standalone Worker deploy. Verified on production CF Pages.
- **The adapter auto-adds a `SESSION` KV binding** for sessions. If you see "Invalid binding `SESSION`" at runtime, add an empty `SESSION` KV binding to `wrangler.jsonc`. Not encountered during testing, but flagged by the adapter build output.

### Keystatic API quirks

- **Reader imports are split across two entrypoints.** `import { createReader, createGitHubReader } from '@keystatic/core/reader'` fails at build — the worker build of `@keystatic/core/reader` only exports `createReader`. Must import `createGitHubReader` from the subpath `@keystatic/core/reader/github`. (`src/lib/reader.ts` does this.)
- **`entry.content` is an async function, not a plain object.** The `.d.ts` types say `ValueForReading` for the markdoc field is `{ node: MarkdocNode }`, but at runtime `reader.collections.posts.read(slug).content` is an async function that must be awaited to get `{ node }`. Correct rendering flow:
  ```js
  const { node } = await entry.content();
  const html = Markdoc.renderers.html(Markdoc.transform(node));
  ```
  Note: the Markdoc function is `transform` (not `render`), then `renderers.html(...)`.
- **`fields.slug` signature is nested.** It takes `{ name: { label, validation, ... }, slug?: { ... } }` — not a flat `{ label, validation }`. A flat call throws "Cannot read properties of undefined (reading 'validation')".
- **Collection `path` must end with a glob segment.** `path: 'content/posts/'` throws "Collection path must end with /* or /** or include /*/ or /**/". Correct: `path: 'content/posts/*'`.
- **Keystatic reader worker bundle imports Node built-ins** (`node:path`, `node:fs/promises`). Vite warns and externalizes them; they resolve at runtime only with the `nodejs_compat` compatibility flag set in `wrangler.jsonc`. Already set.

### Env var access on Cloudflare

- Server-side secrets are **not** available via `import.meta.env` on the Cloudflare runtime. They come from `Astro.locals.runtime.env`. `src/lib/reader.ts` accepts an explicit `env` param, and `github-posts.astro` merges `process.env` (local) with `Astro.locals.runtime.env` (CF) before calling the reader.
- `platformProxy: { enabled: true }` in the adapter config is what wires `Astro.locals.runtime` in local `astro dev`. This also wires D1 bindings locally — no need for `wrangler pages dev`.
- GitHub secrets are set via `bunx wrangler pages secret put <NAME> --project-name <project>` (CLI) or the CF dashboard (encrypted environment variables). They must NOT go in `wrangler.jsonc` (committed to git).

### Build artifacts

- Build output: `dist/index.html`, `dist/local-posts/index.html` (prerendered), `dist/_worker.js/index.js` (SSR entry), `dist/_astro/client.*.js` (Vue hydration), `dist/_astro/keystatic-page.*.js` (~2.7 MB — the Keystatic admin UI bundle; expected, only loaded on `/keystatic`).
- The `@keystar/ui` "use client" directive warnings during client build are harmless (Astro strips them).

---

## Local Test Findings

Findings from running the test project locally via `bun run dev` (Astro dev server with `platformProxy` enabled). All four tests passed locally.

### Test 1: Astro SSR + Vue on Cloudflare — PASS

- **`/ssr` (SSR page)**: Timestamp renders and changes on every page refresh (confirms SSR, not cached/static). Vue `<Counter />` component hydrates correctly — button click increments the counter. `client:load` hydration directive works with the Cloudflare adapter.
- **`/api/hello` (SSR API route)**: Returns JSON `{"hello":"world","now":...}`. The `now` timestamp changes on refresh, confirming the route runs on-demand per request.
- **`/` (static page)**: Prerendered at build time, serves as static HTML.
- **Conclusion**: Mixed SSR/SSG model works locally.

### Test 4: SSG Build Reads Local Content — PASS

- **`/local-posts`**: Prerendered at build time. The Keystatic local reader (`createReader`) finds `content/posts/hello-world.mdoc`, `list()` returns `["hello-world"]`, `read()` returns the entry, `await entry.content()` yields the Markdoc node, and `Markdoc.transform(node)` + `Markdoc.renderers.html(...)` produces correct formatted HTML (headings, bold, inline code, lists all rendered).
- **Conclusion**: SSG content pipeline works end-to-end. Deterministic — local result == production result.

### Test 3: D1 Access — PASS (after architecture change)

- **Architecture conflict discovered**: Cloudflare Pages **cannot use both `_worker.js` and `/functions` in the same project**. The Astro Cloudflare adapter emits `dist/_worker.js/` (for SSR), which makes Pages ignore the entire `/functions/` directory. The original Pages Function at `functions/api/submissions.ts` never ran — `GET /api/submissions` returned the homepage HTML (fallback), and `POST` returned 200 instead of 201 because the function wasn't hit.
- **Fix**: Moved the D1 logic into an Astro SSR route at `src/pages/api/submissions.ts`. D1 is accessed via `Astro.locals.runtime.env.DB` (the binding name from `wrangler.jsonc`). `platformProxy: { enabled: true }` in the adapter config wires the binding in local dev through Miniflare — no need for `wrangler pages dev`.
- **Verification**: `GET /api/submissions` → `{"submissions":[]}`. `POST` with `{"name":"Bhavil","message":"hello"}` → **201** `{"ok":true}`. `GET` again → row appears with `id:1`, correct `name`, `message`, and `created_at` timestamp.
- **Local D1 DB location**: `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite` — a standard SQLite file, queryable via `bunx wrangler d1 execute test-db --local --command "..."` or any SQLite client.
- **Conclusion**: D1 works through the Astro adapter runtime, not through Pages Functions. This is actually cleaner — one runtime, one worker, everything type-checked. The `functions/` directory approach is only viable if the Cloudflare adapter is removed (pure static build).

### Test 2: Keystatic GitHub Reader — PASS

- **Setup**: `.env` wired with `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`, `GITHUB_CONTENT_READ_TOKEN` (fine-grained PAT, `contents:read` scope). The target repo contains `content/posts/*.mdoc` matching the `keystatic.config.ts` schema.
- **Verification**: `GET /github-posts` lists posts from the remote GitHub repo, reads each entry, parses the Markdoc, and renders it as HTML. No errors.
- **Key architectural confirmation**: `createGitHubReader` works inside the Astro Cloudflare worker runtime with the `nodejs_compat` compatibility flag. No fallback to raw GitHub REST + `gray-matter` is needed. The `node:path` / `node:fs/promises` imports in the reader worker bundle resolve correctly at runtime.
- **Env access**: `Astro.locals.runtime.env` (wired by `platformProxy: { enabled: true }`) exposes the GitHub secrets in local dev. `github-posts.astro` merges `process.env` with `Astro.locals.runtime.env` so the same code works locally and on CF.
- **Conclusion**: The reader pipeline is verified locally.

### Keystatic Admin UI (`/keystatic`) — BROKEN in local dev

- **Error**: `[astro-island] Error hydrating ... SyntaxError: The requested module '/node_modules/react/index.js' does not provide an export named 'useState'`
- **Cause**: The Keystatic admin UI is a React app. In Astro's dev server (Vite), the React module resolution conflicts — Vite serves a dev-mode React build that doesn't match what Keystatic's bundled React components expect. This is a known Keystatic + Astro dev-mode issue.
- **Impact**: The admin UI (`/keystatic`) is non-functional in `astro dev`. It may work in the production build (`bun run build && bun run preview`) where bundling resolves differently, but this has not been verified yet.
- **Workaround**: None attempted. For the test project's purposes, the admin UI is secondary — the reader pipeline (Tests 2 and 4) is the critical path. If the admin UI is needed for authoring content, this needs further investigation (possibly a separate `astro dev` config, or running Keystatic's own dev server). Production Keystatic admin requires switching `storage` from `kind: 'local'` to `kind: 'github'` with a write-capable PAT.

---

## Production Test Findings (CF Pages)

Findings from deploying to Cloudflare Pages and testing on the production URL. All four tests passed on production, after fixing two Cloudflare runtime compatibility issues with the GitHub reader's `fetch` calls.

### Test 1: Astro SSR + Vue — PASS

- **`/ssr`**: Timestamp changes on refresh. Counter button increments (Vue hydration works on CF).
- **`/api/hello`**: Returns JSON with live `now` timestamp.
- **`/`**: Static HTML served.
- **Conclusion**: SSR + SSG + Vue hydration all work on CF Pages production. No `SESSION` KV binding error was encountered.

### Test 2: Keystatic GitHub Reader — PASS (after fetch patch)

- **Initial failure**: `The 'cache' field on 'RequestInitializerDict' is not implemented.`
  - **Cause**: Cloudflare's worker runtime does not implement the `Request` constructor's `cache` option. The Keystatic GitHub reader (via `urql`) sets `cache: 'no-store'` on its fetch requests, which CF rejects. This worked locally because Miniflare/Node is more permissive.
  - **Fix**: Added a `globalThis.fetch` patch in `src/lib/reader.ts` (`patchFetchForCloudflare`) that strips the `cache` field from fetch init before it reaches the CF runtime. Applied once per request when `getGitHubReader()` is called.

- **Second failure**: `Failed to fetch tree: 403 Request forbidden by administrative rules. Please make sure your request has a User-Agent header.`
  - **Cause**: Cloudflare's `fetch` does not set a default `User-Agent` header (Node does). GitHub's REST API rejects requests without a `User-Agent` with a 403.
  - **Fix**: Extended the fetch patch to inject a `user-agent: astro-keystatic-reader` header when one is not already present.

- **Final state**: `GET /github-posts` on production lists posts from GitHub, reads entries, renders Markdoc to HTML. No errors.
- **Conclusion**: `createGitHubReader` works on CF Pages production with `nodejs_compat` + the fetch patch. The patch lives in `src/lib/reader.ts` and is applied automatically — no manual intervention needed per page.

### Test 3: D1 Access — PASS

- **`/api/submissions`**: `GET` returns `{"submissions":[...]}`. `POST` with `{"name","message"}` returns 201 `{"ok":true}`. Subsequent `GET` shows the inserted row.
- **Remote D1**: Schema applied via `bunx wrangler d1 execute test-db --remote --file=./schema.sql`. The `DB` binding in `wrangler.jsonc` connects the Pages project to the remote D1 database.
- **Conclusion**: D1 works on production through the Astro adapter runtime (`Astro.locals.runtime.env.DB`).

### Test 4: SSG Local Content — PASS

- **`/local-posts`**: Prerendered HTML served from `dist/`. Identical to local — SSG is deterministic.
- **Conclusion**: SSG content pipeline confirmed on production. No runtime dependency.

---

## Summary

| Test | Local | Production (CF Pages) | Architecture Decision |
|------|-------|----------------------|----------------------|
| **1** SSR + Vue | ✅ | ✅ | `@astrojs/cloudflare` adapter on CF Pages. No Workers needed. |
| **2** GitHub Reader | ✅ | ✅ (with fetch patch) | `createGitHubReader` works on CF with `nodejs_compat` + fetch patch. No fallback to raw GitHub REST needed. |
| **3** D1 | ✅ | ✅ | D1 via Astro API routes (`Astro.locals.runtime.env.DB`), NOT Pages Functions (`/functions` incompatible with `_worker.js`). |
| **4** SSG Local Reader | ✅ | ✅ | `createReader` at build time for prerendered content. Deterministic. |

### Confirmed architecture for the monorepo template

1. **Deploy target**: CF Pages (not Workers). The `@astrojs/cloudflare` adapter in `static` output mode handles both SSG and SSR on Pages.
2. **Content reading**: `createGitHubReader` for runtime SSR content, `createReader` for build-time SSG content. Both work on CF with `nodejs_compat`.
3. **D1 access**: Astro API routes via `Astro.locals.runtime.env.<BINDING>`. No Pages Functions.
4. **Fetch compatibility**: The `globalThis.fetch` patch in `src/lib/reader.ts` is required for the GitHub reader to work on CF production. Must be included in the template.
5. **Env access**: `Astro.locals.runtime.env` for all server-side secrets/bindings, not `import.meta.env`. `platformProxy: { enabled: true }` for local dev parity.
6. **Keystatic admin UI**: Broken in `astro dev`. Needs investigation before the template ships if local authoring is a requirement. Production admin requires `storage: { kind: 'github' }` with a write-capable PAT.

### Updated architecture for Astro 6

| Aspect | Astro 5 | Astro 6 |
|--------|---------|---------|
| D1/env access | `Astro.locals.runtime.env` | `import { env } from 'cloudflare:workers'` |
| Feture flags | None | `prerenderEnvironment: 'node'` in adapter config |
| KV namespace | Optional | Required (auto-added by adapter for sessions) |
| Deploy config | `wrangler.jsonc` + adapter generates valid config | Adapter generates `assets.binding: "ASSETS"` (reserved in Pages) + `kv_namespaces` without `id`; must post-process |

### Astro 6 Production Test Results

All four tests pass with the Astro 6 / @astrojs/cloudflare v13 setup, after applying two deploy config fixes:

| Test | Route | Status | Notes |
|------|-------|--------|-------|
| **1** SSR + Vue | `/ssr` | ✅ 200 | Timestamp changes on refresh, Vue Counter hydrates |
| **2** GitHub Reader | `/github-posts` | ✅ 200 | Content renders with Markdoc formatting, fetch patch works |
| **3** D1 | `/api/submissions` POST | ✅ 201 | `{"ok":true}`, row persisted |
| **3** D1 | `/api/submissions` GET | ✅ 200 | `{"submissions":[...]}`, includes new row |
| **4** SSG Local Reader | `/local-posts/` | ✅ 200 | All 4 Markdoc features rendered (heading, bold, inline-code, lists) |
| Homepage | `/` | ✅ 200 | Static HTML served |
| API hello | `/api/hello` | ✅ 200 | JSON with live timestamp |

**Deploy config fixes applied:**
1. Created SESSION KV namespace (`wrangler kv namespace create SESSION`) → added `id` to `wrangler.jsonc` `kv_namespaces` block
2. Added `fix-wrangler.js` post-build script (`astro build && node fix-wrangler.js`) to delete `assets` block from generated `dist/server/wrangler.json` (ASSETS binding is reserved by Pages)
