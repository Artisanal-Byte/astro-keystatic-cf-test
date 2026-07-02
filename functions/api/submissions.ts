// ARCHIVED — does not run when the @astrojs/cloudflare adapter is enabled.
//
// Cloudflare Pages cannot use both `_worker.js` (emitted by the Astro adapter
// into dist/) and a `/functions` directory in the same project. The presence
// of `dist/_worker.js` makes Pages ignore `/functions` entirely.
//
// The working D1 implementation lives at `src/pages/api/submissions.ts`,
// which runs inside the Astro worker and reads the `DB` binding from
// `Astro.locals.runtime.env.DB`.
//
// This file is kept for reference and for a potential future "static-only"
// build variant (no Cloudflare adapter) where Pages Functions would be the
// only runtime.
