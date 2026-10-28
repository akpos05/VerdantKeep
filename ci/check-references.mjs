// Fails if index.html or the game scripts point at a file that does not exist,
// or if a script in js/ is never loaded by index.html. Either one ships as a
// silent 404 or a black screen, because the game has no build step to catch it.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSET_EXT = /\.(png|jpe?g|gif|webp|svg|ogg|mp3|wav|json|js|css)$/i;
const isLocal = (ref) => !/^([a-z]+:|\/\/|#)/i.test(ref);

const problems = [];
const refs = []; // { from, path }

// src/href attributes in the page.
const html = readFileSync(join(root, 'index.html'), 'utf8');
for (const [, ref] of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
  if (isLocal(ref)) refs.push({ from: 'index.html', path: ref });
}

// String literals in the scripts that look like file paths, e.g. 'assets/hero_walk.png'.
const scripts = readdirSync(join(root, 'js')).filter((f) => f.endsWith('.js'));
for (const file of scripts) {
  const src = readFileSync(join(root, 'js', file), 'utf8');
  for (const [, ref] of src.matchAll(/['"`]([\w./-]+)['"`]/g)) {
    if (ref.includes('/') && ASSET_EXT.test(ref) && isLocal(ref)) {
      refs.push({ from: `js/${file}`, path: ref });
    }
  }
}

// Paths are relative to index.html, since that is the page every script runs in.
for (const { from, path } of refs) {
  const clean = path.split(/[?#]/)[0].replace(/^\.\//, '');
  if (!existsSync(join(root, clean))) problems.push(`${from}: missing file "${path}"`);
}

const loaded = new Set(refs.filter((r) => r.from === 'index.html').map((r) => r.path.replace(/^\.\//, '')));
for (const file of scripts) {
  if (!loaded.has(`js/${file}`)) problems.push(`index.html: js/${file} exists but is never loaded`);
}

if (problems.length) {
  console.error(`Reference check failed (${problems.length}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`Reference check passed: ${refs.length} references, ${scripts.length} scripts loaded.`);
