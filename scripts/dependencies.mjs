import { createRequire } from 'node:module';
import { resolve } from 'node:path';

// An optional external install keeps restricted contributor workspaces free of dependencies.
export const dependencyRoot = process.env.SQUEEK_DEPENDENCIES;
export const requireDependency = createRequire(dependencyRoot
  ? resolve(dependencyRoot, 'package.json') : new URL('../package.json', import.meta.url));
