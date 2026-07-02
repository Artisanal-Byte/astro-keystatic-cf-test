import type { APIRoute } from 'astro';

// Test 3 — D1 access via the Astro Cloudflare adapter.
//
// IMPORTANT: This replaces the original `functions/api/submissions.ts` Pages
// Function. When the @astrojs/cloudflare adapter is enabled, it emits
// `dist/_worker.js`, which makes Cloudflare Pages IGNORE the `/functions`
// directory entirely. So Pages Functions cannot coexist with the adapter.
// Instead, D1 is accessed through `Astro.locals.runtime.env.DB` (the binding
// name from wrangler.jsonc's d1_databases[].binding).
//
// Routes:
//   GET  /api/submissions   -> list all rows
//   POST /api/submissions   -> insert { name, message }
//
// Local dev:  bun run dev  (platformProxy: { enabled: true } wires the binding)
//             requires a local D1 DB — see schema.sql + the commands below.

interface Env {
  DB: D1Database;
}

function getDB(locals: unknown): D1Database {
  const env = ((locals as { runtime?: { env?: Env } })?.runtime?.env) ?? {};
  if (!env.DB) {
    throw new Error(
      'D1 binding `DB` not found on Astro.locals.runtime.env. ' +
        'Ensure wrangler.jsonc has a d1_databases binding named `DB` and that ' +
        'platformProxy is enabled in astro.config.mjs for local dev.'
    );
  }
  return env.DB;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const db = getDB(locals);
  const { results, success, error } = await db
    .prepare('SELECT id, name, message, created_at FROM submissions ORDER BY id DESC LIMIT 100;')
    .all();
  if (!success) return json({ error: error ?? 'query failed' }, 500);
  return json({ submissions: results });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const db = getDB(locals);

  let body: { name?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }

  const name = (body.name ?? '').toString().slice(0, 200);
  const message = (body.message ?? '').toString().slice(0, 2000);
  if (!name || !message) {
    return json({ error: 'name and message are required' }, 400);
  }

  const { success, error } = await db
    .prepare('INSERT INTO submissions (name, message) VALUES (?, ?);')
    .bind(name, message)
    .run();
  if (!success) return json({ error: error ?? 'insert failed' }, 500);
  return json({ ok: true }, 201);
};
