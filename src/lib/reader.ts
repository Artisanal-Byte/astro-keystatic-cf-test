import keystaticConfig from '../../keystatic.config';
import { createReader } from '@keystatic/core/reader';
import { createGitHubReader } from '@keystatic/core/reader/github';

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
 * On Cloudflare, env comes from `Astro.locals.runtime.env`; locally it comes
 * from `process.env` via the `.env` file. Callers merge both and pass here.
 */
export function getGitHubReader(env: GitHubReaderEnv = {}) {
  const owner = env.GITHUB_REPO_OWNER ?? process.env.GITHUB_REPO_OWNER;
  const name = env.GITHUB_REPO_NAME ?? process.env.GITHUB_REPO_NAME;
  const token = env.GITHUB_CONTENT_READ_TOKEN ?? process.env.GITHUB_CONTENT_READ_TOKEN;

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
