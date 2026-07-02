# Findings

Ongoing log of findings from the Astro + Cloudflare + Keystatic test project. Updated as testing progresses. Both positive (things that work) and negative (things that break, gotchas, constraints) findings are recorded.

---

## Test Build Findings

Findings discovered while scaffolding the test project and getting `bun run build` to pass. These are build-time / wiring facts, not runtime test results.

### Architecture

- **Astro 5 has no `hybrid` output mode.** Use `output: 'static'` (the default) and opt individual routes into SSR with `export const prerender = false` at the top of the page. This gives the mixed SSG/SSR model the plan needs. Verified: `index.astro` and `local-posts.astro` prerender; `ssr.astro`, `github-posts.astro`, and `api/hello.ts` run on the Cloudflare worker.
- **`@astrojs/cloudflare` adapter works in `static` output mode** — it emits a `_worker.js/` directory alongside the static assets. Build succeeded without falling back to a standalone Worker deploy. (Runtime verification on actual CF Pages still pending.)
- **The adapter auto-adds a `SESSION` KV binding** for sessions. If you see "Invalid binding `SESSION`" at runtime, add an empty `SESSION` KV binding to `wrangler.jsonc`. Not yet added to our config because local dev didn't need it.

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
- `platformProxy: { enabled: true }` in the adapter config is what wires `Astro.locals.runtime` in local `astro dev`.

### Build artifacts

- Build output: `dist/index.html`, `dist/local-posts/index.html` (prerendered), `dist/_worker.js/index.js` (SSR entry), `dist/_astro/client.*.js` (Vue hydration), `dist/_astro/keystatic-page.*.js` (~2.7 MB — the Keystatic admin UI bundle; expected, only loaded on `/keystatic`).
- The `@keystar/ui` "use client" directive warnings during client build are harmless (Astro strips them).

---

## Local Test Findings

Findings from running the test project locally via `bun run dev` (Astro dev server with `platformProxy` enabled). Tests 1, 3, and 4 passed; Test 2 and the Keystatic admin UI have open issues.

### Test 1: Astro SSR + Vue on Cloudflare — PASS

- **`/ssr` (SSR page)**: Timestamp renders and changes on every page refresh (confirms SSR, not cached/static). Vue `<Counter />` component hydrates correctly — button click increments the counter. `client:load` hydration directive works with the Cloudflare adapter.
- **`/api/hello` (SSR API route)**: Returns JSON `{"hello":"world","now":...}`. The `now` timestamp changes on refresh, confirming the route runs on-demand per request.
- **`/` (static page)**: Prerendered at build time, serves as static HTML.
- **Conclusion**: Mixed SSR/SSG model works locally. CF Pages runtime verification still pending (needs deploy).

### Test 4: SSG Build Reads Local Content — PASS

- **`/local-posts`**: Prerendered at build time. The Keystatic local reader (`createReader`) finds `content/posts/hello-world.mdoc`, `list()` returns `["hello-world"]`, `read()` returns the entry, `await entry.content()` yields the Markdoc node, and `Markdoc.transform(node)` + `Markdoc.renderers.html(...)` produces correct formatted HTML (headings, bold, inline code, lists all rendered).
- **Conclusion**: SSG content pipeline works end-to-end locally.

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
- **Conclusion**: The reader pipeline is verified locally. Production verification (on actual CF Pages) still pending.

### Keystatic Admin UI (`/keystatic`) — BROKEN in local dev

- **Error**: `[astro-island] Error hydrating ... SyntaxError: The requested module '/node_modules/react/index.js' does not provide an export named 'useState'`
- **Cause**: The Keystatic admin UI is a React app. In Astro's dev server (Vite), the React module resolution conflicts — Vite serves a dev-mode React build that doesn't match what Keystatic's bundled React components expect. This is a known Keystatic + Astro dev-mode issue.
- **Impact**: The admin UI (`/keystatic`) is non-functional in `astro dev`. It may work in the production build (`bun run build && bun run preview`) where bundling resolves differently, but this has not been verified yet.
- **Workaround**: None attempted yet. For the test project's purposes, the admin UI is secondary — the reader pipeline (Tests 2 and 4) is the critical path. If the admin UI is needed for authoring content, this needs further investigation (possibly a separate `astro dev` config, or running Keystatic's own dev server).
