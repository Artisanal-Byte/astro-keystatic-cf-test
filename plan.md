# Test Project: Astro + Cloudflare Compatibility Verification

> **Purpose**: Prove core architectural assumptions before building the monorepo template.  
> **Scope**: Minimal. No design, no UX. Just functional verification.  
> **Outcome**: Confirmed deployment target, confirmed Keystatic Reader compatibility, known constraints. Results are recorded in `findings.md`.

---

## Test Cases

### Test 1: Astro SSR + Vue on Cloudflare Pages

**Question**: Does `@astrojs/cloudflare` adapter work with CF Pages for this template's SSR/SSG mix?

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

Historical fallback if CF Pages failed: try deploying as a Worker (`wrangler deploy`). `findings.md` confirmed this fallback is not needed.

---

### Test 2: Keystatic GitHub Reader in Cloudflare Runtime

**Question**: Does `createGitHubReader` work inside the Cloudflare Pages adapter runtime (`dist/_worker.js`)?

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

### Test 3: Astro API Routes with D1 Binding

**Question**: Can a static Astro site have route-level runtime APIs that access D1 through the Cloudflare adapter runtime?

**Setup**:
- Static Astro site
- `src/pages/api/submissions.ts` — Astro API route with `export const prerender = false`
- D1 database with one test table
- Deploy to CF Pages with D1 binding

**Verify**:

| Check | How |
|-------|-----|
| D1 binding works | Astro API route can query D1 and return JSON |
| Static site unaffected | Main site serves as SSG, API route runs through `_worker.js` |
| Local dev works | `astro dev` with `platformProxy: { enabled: true }` |

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
├── wrangler.jsonc            # CF Pages config
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
│   │       ├── hello.ts       # API route (Test 1)
│   │       └── submissions.ts # API route with D1 (Test 3)
│   │
│   └── lib/
│       └── reader.ts         # Shared reader config (Test 2 & 4)
│
```

Do not use a `/functions` directory in this architecture. The Astro Cloudflare adapter emits `dist/_worker.js/`, and Cloudflare Pages ignores `/functions` when `_worker.js` exists.

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
D1_DATABASE_ID=xxxx-xxxx-xxxx       # deployment metadata only
D1_DATABASE_NAME=test-db
```

## Deployment Targets to Test

| Target | Command | For |
|--------|---------|-----|
| CF Pages (Git) | Push to branch, auto-deploy | Tests 1-4 |
| CF Pages (Direct) | `wrangler pages deploy dist` | Test 1 (static mode) |
| CF Worker | `wrangler deploy` | Historical fallback only; not needed after findings confirmed CF Pages |

## Success Criteria

| Test | Success | Notes |
|------|---------|-------|
| 1 | CF Pages SSR works | Decision recorded, architecture updated |
| 2 | `createGitHubReader` works in runtime OR fallback identified | If fail: note which Node APIs are missing |
| 3 | Astro API route + D1 binding works | Confirms dashboard API architecture |
| 4 | SSG build reads local content | Confirms production build works |

## Expected Duration

~2-3 hours for setup, deploy, and testing all 4 cases.

---

## Post-Test Actions

1. **Record results** in this document (pass/fail + notes)
2. **Update `plan.md`** with confirmed deployment target
3. **Update `deployment-reference.md`** with correct deploy steps
4. **Include Reader patch**: Add the fetch patch from `findings.md` to the monorepo template
5. **Document runtime rules**: Capture `Astro.locals.runtime.env`, `platformProxy`, and no `/functions` directory
6. **Begin Phase 0** (rule system creation) with confirmed architecture

> Findings have moved to `findings.md`. That file is the living record of all build-time and runtime discoveries.
