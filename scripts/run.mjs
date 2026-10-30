import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dependencyRoot, requireDependency } from './dependencies.mjs';

const mode = process.argv[2];
if (mode === 'typecheck') {
  let temporary;
  let config = 'tsconfig.json';
  if (dependencyRoot) {
    temporary = mkdtempSync(resolve(tmpdir(), 'squeek-typecheck-'));
    config = resolve(temporary, 'tsconfig.json');
    const modules = resolve(dependencyRoot, 'node_modules');
    writeFileSync(config, JSON.stringify({
      extends: resolve('tsconfig.json'),
      compilerOptions: {
        baseUrl: resolve('.'),
        paths: {
          'react': [resolve(modules, '@types/react')],
          'react/*': [resolve(modules, '@types/react/*')],
          'react-dom/*': [resolve(modules, '@types/react-dom/*')],
          '*': [resolve(modules, '*')],
        },
        typeRoots: [resolve(modules, '@types')],
      },
      include: [resolve('src')],
    }));
  }
  const result = spawnSync(process.execPath, [resolve(dirname(requireDependency.resolve('typescript/package.json')), 'bin/tsc'), '--noEmit', '-p', config], { stdio: 'inherit' });
  if (temporary) rmSync(temporary, { recursive: true });
  process.exit(result.status ?? 1);
}
const vite = await import(pathToFileURL(requireDependency.resolve('vite')).href);
if (mode === 'build') await vite.build();
else if (mode === 'preview') {
  const server = await vite.preview({ preview: { host: '0.0.0.0', port: 4173 } });
  server.printUrls();
} else if (mode === 'dev') {
  const server = await vite.createServer({ server: { host: '0.0.0.0' } });
  await server.listen();
  server.printUrls();
} else throw new Error('Use dev, build, preview or typecheck.');
