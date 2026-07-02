import keystaticConfig from '../../keystatic.config';
import { createReader } from '@keystatic/core/reader';
import { createGitHubReader } from '@keystatic/core/reader/github';

/**
 * Cloudflare's worker runtime does not implement the `cache` field on
 * Request init. The Keystatic GitHub reader (via urql) sets `cache: 'no-store'`,
 * which throws: "The 'cache' field on 'RequestInitializerDict' is not implemented."
 * This patch strips the `cache` field from fetch options before they reach the
 * runtime. Applied once per request (CF isolates each request).
 */
let fetchPatched = false;
function patchFetchForCloudflare() {
  if (fetchPatched) return;
  fetchPatched = true;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    // Strip `cache` — not implemented on the CF runtime.
    const { cache: _cache, ...rest } = init ?? {};
    // GitHub API requires a User-Agent header; CF fetch doesn't set one by default.
    const headers = new Headers(rest.headers);
    if (!headers.has('user-agent')) {
      headers.set('user-agent', 'astro-keystatic-reader');
    }
    return originalFetch(input, { ...rest, headers });
  };
}

/**
 * Local reader used during build / SSG (Test 4).
 * Reads from the filesystem at process.cwd().
 */
export function getLocalReader() {
  return createReader(process.cwd(), keystaticConfig);
}

export interface GitHubReaderEnv {
  GITHUB_REPO_OWNER?: string;
  GITHUB_REPO_NAME?: string;
  GITHUB_CONTENT_READ_TOKEN?: string;
}

/**
 * GitHub reader used at runtime in SSR (Test 2).
 * Tries `cloudflare:workers` (production worker runtime) first, then `process.env`
 * (dev server / build time). The explicit `env` param overrides both.
 */
export async function getGitHubReader(env: GitHubReaderEnv = {}) {
  patchFetchForCloudflare();

  let cfEnv: Record<string, unknown> = {};
  try {
    const { env: cloudflareEnv } = await import('cloudflare:workers');
    cfEnv = cloudflareEnv as Record<string, unknown>;
  } catch {
    // Not running inside a Cloudflare worker (e.g. dev server, build).
  }

  const owner =
    env.GITHUB_REPO_OWNER ??
    (cfEnv.GITHUB_REPO_OWNER as string | undefined) ??
    process.env.GITHUB_REPO_OWNER;

  const name =
    env.GITHUB_REPO_NAME ??
    (cfEnv.GITHUB_REPO_NAME as string | undefined) ??
    process.env.GITHUB_REPO_NAME;

  const token =
    env.GITHUB_CONTENT_READ_TOKEN ??
    (cfEnv.GITHUB_CONTENT_READ_TOKEN as string | undefined) ??
    process.env.GITHUB_CONTENT_READ_TOKEN;

  if (!owner || !name || !token) {
    throw new Error(
      'GitHub reader requires GITHUB_REPO_OWNER, GITHUB_REPO_NAME, and GITHUB_CONTENT_READ_TOKEN'
    );
  }

  return createGitHubReader(keystaticConfig, {
    repo: `${owner}/${name}`,
    token,
  });
}
