import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const assets = path.resolve('dist/assets');
const files = await readdir(assets);
const violations = [];
for (const file of files) {
  const bytes = (await stat(path.join(assets, file))).size;
  if (/^index-[^.]+\.js$/u.test(file) && bytes > 2_200_000) violations.push(`${file}: ${bytes} > 2200000`);
  if (/\.js$/u.test(file) && !/^index-[^.]+\.js$/u.test(file) && !/^pdf\.worker-/u.test(file) && bytes > 600_000) {
    violations.push(`${file}: ${bytes} > 600000`);
  }
  // CSS: só utilitários do Tailwind usados nas páginas (um ficheiro, ~36 kB comprimido); cresce com as páginas.
  if (/\.css$/u.test(file) && bytes > 300_000) violations.push(`${file}: ${bytes} > 300000`);
}
if (violations.length) {
  console.error(`Bundle budget exceeded:\n${violations.join('\n')}`);
  process.exit(1);
}
console.log('Bundle budget passed.');
