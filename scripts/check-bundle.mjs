import assert from 'node:assert/strict';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const excluded = new Set(['.git', '.github', '.imd', '.agents', '.codex']);
const forbidden = new Set(['node_modules', '.npm', '.cache', '.vite', '.playwright-mcp']);
const budget = 8_388_608;
const files = [];
async function walk(path = '.') {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.name === '.env' || entry.name.startsWith('.env.')) continue;
    const name = join(path, entry.name);
    if (relative('.', name) === 'test/scratch') continue;
    assert.ok(!forbidden.has(entry.name), `Generated directory must not be submitted: ${name}`);
    assert.ok(!entry.isSymbolicLink(), `No symlink/submodule-like content in submission: ${name}`);
    if (entry.isDirectory()) await walk(name);
    else {
      assert.ok(!/\.(tgz|tar|zip|map)$/.test(entry.name), `Unnecessary archive/source map: ${name}`);
      files.push({ path: relative('.', name), bytes: (await stat(name)).size });
    }
  }
}
await walk();
const html = await readFile('dist/index.html', 'utf8');
for (const attr of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  if (/^https?:/.test(attr[1])) continue;
  assert.ok(attr[1].startsWith('./'), `Export asset URL must be relative: ${attr[1]}`);
  await stat(join('dist', attr[1]));
}
for (const fragment of ['<title>', 'name="description"', 'property="og:title"', 'property="og:image"', 'rel="icon"']) assert.ok(html.includes(fragment));
const social = await readFile('dist/social.png');
assert.equal(social.readUInt32BE(16), 1200); assert.equal(social.readUInt32BE(20), 630);
assert.equal(JSON.parse(await readFile('dist/game-config.json', 'utf8')), null, 'Unprovided game remains explicitly unconfigured.');
for (const file of files.filter(file => file.path.startsWith('dist/') && /\.(?:js|html|css|json)$/.test(file.path))) {
  const content = await readFile(file.path, 'utf8');
  assert.ok(!content.includes('/home/imd-worker') && !content.includes('/tmp/squeek-'), `Local build path leaked into export: ${file.path}`);
  assert.ok(!content.includes('ValidationSQK') && !content.includes('mintForValidation'), `Local fixture leaked into export: ${file.path}`);
}
const byRoot = {};
for (const file of files) {
  const root = file.path.includes('/') ? file.path.split('/')[0] : 'root files';
  byRoot[root] = (byRoot[root] ?? 0) + file.bytes;
}
const report = {
  limitBytes: budget,
  totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  staticExportBytes: files.filter(file => file.path.startsWith('dist/')).reduce((sum, file) => sum + file.bytes, 0),
  fileCount: files.length,
  byRoot,
  checks: { relativeAssets: true, metadata: true, socialImage1200x630: true, noDependencyTreesOrArchives: true, noSymlinks: true, noLocalPathsOrTestFixturesInExport: true },
  notes: 'Payload files measured without Git metadata, assignment inputs, or disposable test/scratch. No ignore file changed. Report size is included after stabilization.',
};
// Include this report itself without counting an earlier copy twice.
const reportPath = 'artifacts/bundle-budget.json';
const previous = files.find(file => file.path === reportPath)?.bytes ?? 0;
if (!previous) report.fileCount++;
const withoutReport = report.totalBytes - previous;
const artifactsWithoutReport = (report.byRoot.artifacts ?? 0) - previous;
let size = 0;
for (let i = 0; i < 10; i++) {
  report.totalBytes = withoutReport + size;
  report.byRoot.artifacts = artifactsWithoutReport + size;
  const next = Buffer.byteLength(JSON.stringify(report, null, 2) + '\n');
  if (next === size) break;
  size = next;
}
assert.ok(report.totalBytes <= budget, `Bundle exceeds ${budget} bytes.`);
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(`Bundle: ${report.totalBytes.toLocaleString()} / ${budget.toLocaleString()} bytes; export: ${report.staticExportBytes.toLocaleString()} bytes; ${report.fileCount} files.`);
