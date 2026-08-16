import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

const pairs = [
  ['@ffmpeg.wasm/core-mt', 'ffmpeg'],
  ['@ffmpeg.wasm/core-st', 'ffmpeg-st'],
];

for (const [pkg, out] of pairs) {
  const src = join(root, '..', 'node_modules', pkg, 'dist');
  const dest = join(root, '..', 'public', out);
  mkdirSync(dest, { recursive: true });
  for (const file of ['core.js', 'core.wasm', 'core.worker.js']) {
    const from = join(src, file);
    if (existsSync(from)) {
      cpSync(from, join(dest, file));
      console.log(`copied ${pkg}/${file} -> public/${out}/${file}`);
    }
  }
}