import { dependencyRoot, requireDependency } from './scripts/dependencies.mjs';

const externalAliases = dependencyRoot ? [
  'react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/client',
  'wagmi', 'wagmi/connectors', 'wagmi/actions', 'viem', 'viem/chains', '@tanstack/react-query', '@coinbase/wallet-sdk',
].map(name => ({ find: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), replacement: requireDependency.resolve(name).replace('/viem/_cjs/', '/viem/_esm/') })) : [];

export default {
  base: './',
  resolve: { alias: externalAliases, dedupe: ['react', 'react-dom'] },
  esbuild: { jsx: 'automatic' },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 650 },
};
