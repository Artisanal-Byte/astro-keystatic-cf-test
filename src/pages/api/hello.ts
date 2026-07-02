import type { APIRoute } from 'astro';

// Test 1 — API route (SSR)
export const prerender = false;

export const GET: APIRoute = () => {
  return new Response(
    JSON.stringify({ hello: 'world', now: Date.now() }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }
  );
};
