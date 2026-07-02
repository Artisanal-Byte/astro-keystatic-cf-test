import { readFile, writeFile, cp, mkdir, rm, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, 'dist');

// ---- Step 1: Strip Workers-only fields from generated configs ----
const keepFields = new Set([
  'configPath', 'userConfigPath',
  'pages_build_output_dir', 'compatibility_date', 'compatibility_flags',
  'name', 'vars', 'kv_namespaces', 'd1_databases',
]);

for (const subpath of ['dist/server/wrangler.json', 'dist/server/.prerender/wrangler.json']) {
  try {
    const filePath = join(__dirname, subpath);
    const config = JSON.parse(await readFile(filePath, 'utf-8'));
    const cleaned = {};
    for (const key of Object.keys(config)) {
      if (keepFields.has(key)) cleaned[key] = config[key];
    }
    await writeFile(filePath, JSON.stringify(cleaned, null, 2) + '\n');
  } catch { /* skip */ }
}

// ---- Step 2: Reorganise dist layout for Pages ----
// Current: dist/client/* + dist/server/
// Needed:  dist/* + dist/_worker.js/

const clientDir = join(dist, 'client');
try {
  const entries = await readdir(clientDir);
  for (const name of entries) {
    await cp(join(clientDir, name), join(dist, name), { recursive: true, force: true });
  }
  await rm(clientDir, { recursive: true, force: true });
} catch { /* skip if clientDir missing */ }

await mkdir(join(dist, '_worker.js'), { recursive: true });
await writeFile(
  join(dist, '_worker.js', 'index.js'),
  `import entry from '../server/entry.mjs';\nexport default entry;\n`
);
