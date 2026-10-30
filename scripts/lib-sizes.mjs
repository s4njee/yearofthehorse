// Per-effect download size of the library build (story 7.1): what `import { effect } from
// 'yearofthehorse/effects/<id>'` pulls in, following the build's relative imports, raw and gzipped.
// The one runtime dependency, @mk7s/hologpu-temple-core, is external and counted once on its own
// line. Writes docs/studies/library-sizes.md.
//
//   npm run build:lib && node scripts/lib-sizes.mjs

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const LIB = 'lib';
if (!existsSync(LIB)) {
  console.error('lib/ is missing: run npm run build:lib first');
  process.exit(1);
}

const IMPORT =
  /(?:import|export)\s[^'"]*?from\s*["'](\.{1,2}\/[^"']+)["']|import\s*\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g;

/** Every file `entry` loads, itself included: static imports only, dynamic ones listed apart. */
function closure(entry) {
  const seen = new Set();
  const lazy = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const code = readFileSync(file, 'utf8');
    for (const match of code.matchAll(IMPORT)) {
      const target = resolve(dirname(file), match[1] ?? match[2]);
      if (match[2]) lazy.add(target);
      else visit(target);
    }
  };
  visit(resolve(entry));
  return { files: [...seen], lazy: [...lazy].filter((f) => !seen.has(f)) };
}

function size(files) {
  let raw = 0;
  let gzip = 0;
  for (const file of files) {
    const bytes = readFileSync(file);
    raw += bytes.length;
    gzip += gzipSync(bytes, { level: 9 }).length;
  }
  return { raw, gzip };
}

const kb = (bytes) => (bytes / 1024).toFixed(1);
const rows = [];
const core = closure(join(LIB, 'index.js'));
const coreSize = size(core.files);
for (const id of readdirSync(join(LIB, 'effects')).sort()) {
  const entry = join(LIB, 'effects', id, 'index.js');
  if (!existsSync(entry)) continue;
  const { files } = closure(entry);
  rows.push({ id, files: files.length, ...size(files) });
}

const lines = [
  '# Library sizes',
  '',
  `Story 7.1. What each effect costs to download from the library build (\`npm run build:lib\`, unminified ES modules with the WGSL inlined): the effect's entry and every module it imports, raw and gzipped at level 9. Measured ${new Date().toISOString().slice(0, 10)} by \`node scripts/lib-sizes.mjs\`. A site that minifies will ship less; the gallery's own minified chunks are in [bundle-sizes.json](bundle-sizes.json).`,
  '',
  `The host and \`mount\` (\`yearofthehorse\`'s index) add ${kb(coreSize.gzip)} kB gzipped (${core.files.length} files) once, shared by every effect. \`@mk7s/hologpu-temple-core\` is a dependency the site installs and is not counted.`,
  '',
  '| Effect | Files | Raw (kB) | Gzip (kB) |',
  '| --- | ---: | ---: | ---: |',
  ...rows.map((r) => `| ${r.id} | ${r.files} | ${kb(r.raw)} | ${kb(r.gzip)} |`),
  '',
];
writeFileSync('docs/studies/library-sizes.md', `${lines.join('\n')}\n`);
console.log(lines.slice(6).join('\n'));
