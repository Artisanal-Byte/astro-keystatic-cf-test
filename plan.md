# Test Project: Astro + Cloudflare Compatibility Verification

> **Purpose**: Prove core architectural assumptions before building the monorepo template.  
> **Scope**: Minimal. No design, no UX. Just functional verification.  
> **Outcome**: Confirmed deployment target, confirmed Keystatic Reader compatibility, known constraints.

---

## Test Cases

### Test 1: Astro SSR + Vue on Cloudflare Pages vs Workers

**Question**: Does `@astrojs/cloudflare` adapter work with CF Pages, or must we use Workers?

**Setup**:
- Minimal Astro project with `@astrojs/cloudflare` adapter
- One Vue SFC component (e.g., `<Counter />` with a click handler)
- One SSR page (using `output: 'server'`)
- One static page (using `output: 'static'` or `prerender`)

**Verify**:

| Check | How |
|-------|-----|
| Build succeeds | `bun run build` completes without errors |
| SSR page renders | Page loads and shows dynamic content |
| Vue component hydrates | Counter button works (increment on click) |
| Static page works | Static page serves without SSR overhead |
| API route works | `GET /api/hello` returns JSON |
| Deploy to CF Pages | `wrangler pages deploy dist` or Git-based deploy |
| Runtime works | Production URL serves all pages correctly |

**If CF Pages fails**:
- Try deploying as a Worker (`wrangler deploy`)
- Document which target works → that becomes our architecture

---

### Test 2: Keystatic GitHub Reader in Cloudflare Runtime

**Question**: Does `createGitHubReader` work inside a CF Pages Function / Worker?

**Setup**:
- Minimal Keystatic config with one collection (e.g., `posts`)
- Content files stored in a GitHub repo (can be a test repo)
- SSR page that calls `createGitHubReader` at runtime to fetch content
- Uses `GITHUB_CONTENT_READ_TOKEN` (fine-grained PAT, `contents: read`)

**Verify**:

| Check | How |
|-------|-----|
| Reader imports | `import { createGitHubReader } from '@keystatic/core/reader/github'` works at build |
| Reader connects | `createGitHubReader(config, { repo, token })` resolves |
| Collection list | `reader.collections.posts.list()` returns slugs |
| Entry read | `reader.collections.posts.read(slug)` returns content data |
| Content renders | Page displays title and content from GitHub |
| Deployed works | Same functionality works on CF runtime (not just local) |
| Node compat needed | Test with and without `nodejs_compat` flag |

**If it fails**: Test fallback — fetch raw content from GitHub REST API and parse frontmatter with `gray-matter`.

---

### Test 3: Pages Functions with D1 Binding

**Question**: Can a static Astro site have Pages Functions that access D1?

**Setup**:
- Static Astro site
- `functions/api/submissions.ts` — Pages Function that reads from D1
- D1 database with one test table
- Deploy to CF Pages with D1 binding

**Verify**:

| Check | How |
|-------|-----|
| D1 binding works | Function can query D1 and return JSON |
| Static site unaffected | Main site serves as SSG, Functions as separate runtime |
| Local dev works | `wrangler pages dev` with `--d1` flag |

---

### Test 4: SSG Build Reads Local Content (Keystatic Reader)

**Question**: Can `createReader` (local mode) read content from a directory at build time for SSG?

**Setup**:
- Local content directory with Markdown/Markdoc files
- Astro SSG build that uses `createReader` during build
- Generates static HTML from content

**Verify**:

| Check | How |
|-------|-----|
| Build reads content | `createReader(process.cwd(), config)` finds content |
| Collection list | Returns all slugs |
| Entry render | `<Content />` renders Markdoc to HTML |
| Static output | `dist/` contains generated HTML pages |

---

## Test Project Structure

```
test-project/
├── astro.config.mjs          # Adapter config, SSR/SSG toggle
├── package.json              # Dependencies
├── tsconfig.json
├── wrangler.jsonc            # CF Pages/Worker config
│
├── content/                  # Local content for SSG test (Test 4)
│   └── posts/
│       └── hello-world.mdoc
│
├── keystatic.config.ts       # Minimal config (Test 2 & 4)
│
├── src/
│   ├── components/
│   │   └── Counter.vue       # Simple Vue component (Test 1)
│   │
│   ├── pages/
│   │   ├── index.astro       # Static: simple "hello world"
│   │   ├── ssr.astro         # SSR: dynamic timestamp + Vue Counter (Test 1)
│   │   ├── github-posts.astro # SSR: reads from GitHub (Test 2)
│   │   ├── local-posts.astro  # SSG: reads from local content (Test 4)
│   │   └── api/
│   │       └── hello.ts      # API route (Test 1)
│   │
│   └── lib/
│       └── reader.ts         # Shared reader config (Test 2 & 4)
│
└── functions/
    └── api/
        └── submissions.ts    # Pages Function with D1 (Test 3)
```

## Dependencies

```json
{
  "dependencies": {
    "astro": "^5.0.0",
    "@astrojs/cloudflare": "^12.0.0",
    "@astrojs/vue": "^5.0.0",
    "@keystatic/core": "^0.5.0",
    "@keystatic/astro": "^5.0.0",
    "vue": "^3.5.0"
  }
}
```

## Environment Variables

```bash
# .env
PUBLIC_ENV=preview                           # or production
GITHUB_REPO_OWNER=your-org
GITHUB_REPO_NAME=test-content-repo
GITHUB_CONTENT_READ_TOKEN=github_pat_xxxx    # fine-grained, contents:read
D1_DATABASE_ID=xxxx-xxxx-xxxx
D1_DATABASE_NAME=test-db
```

## Deployment Targets to Test

| Target | Command | For |
|--------|---------|-----|
| CF Pages (Git) | Push to branch, auto-deploy | Tests 1-4 |
| CF Pages (Direct) | `wrangler pages deploy dist` | Test 1 (static mode) |
| CF Worker | `wrangler deploy` | Test 1 (SSR mode, if Pages fails) |

## Success Criteria

| Test | Success | Notes |
|------|---------|-------|
| 1 | CF Pages SSR works OR we confirm Workers is needed | Decision recorded, architecture updated |
| 2 | `createGitHubReader` works in runtime OR fallback identified | If fail: note which Node APIs are missing |
| 3 | Pages Function + D1 binding works | Confirms dashboard API architecture |
| 4 | SSG build reads local content | Confirms production build works |

## Expected Duration

~2-3 hours for setup, deploy, and testing all 4 cases.

---

## Post-Test Actions

1. **Record results** in this document (pass/fail + notes)
2. **Update `plan.md`** with confirmed deployment target
3. **Update `deployment-reference.md`** with correct deploy steps
4. **If Workers needed**: Change "4 Pages projects" to "2 Pages + 2 Workers" and update domain/binding docs
5. **If Reader fails**: Implement chosen fallback in the monorepo template
6. **Begin Phase 0** (rule system creation) with confirmed architecture

---

## Test Build Findings

Findings discovered while scaffolding the test project and getting `bun run build` to pass. These are build-time / wiring facts, not runtime test results (those go in "Test Results" after deployment).

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