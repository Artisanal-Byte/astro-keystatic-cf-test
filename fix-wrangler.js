import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const wranglerPath = join(__dirname, 'dist', 'server', 'wrangler.json');
const wrangler = JSON.parse(await readFile(wranglerPath, 'utf-8'));

delete wrangler.assets;

await writeFile(wranglerPath, JSON.stringify(wrangler, null, 2) + '\n');
