import { readFileSync, writeFileSync } from 'node:fs';
import { requireDependency } from './dependencies.mjs';

const solc = requireDependency('solc');
const source = readFileSync('contracts/LabToken.sol', 'utf8');
const input = {
  language: 'Solidity',
  sources: { 'LabToken.sol': { content: source } },
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'paris',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
};
const output = JSON.parse(solc.compile(JSON.stringify(input), {
  import: path => {
    try { return { contents: readFileSync(requireDependency.resolve(path), 'utf8') }; }
    catch { return { error: `Cannot resolve ${path}` }; }
  },
}));
for (const error of output.errors ?? []) {
  if (error.severity === 'error') throw new Error(error.formattedMessage);
}
const artifact = output.contracts['LabToken.sol'].LabToken;
writeFileSync('src/generated/LabToken.json', JSON.stringify({
  compiler: solc.version(), optimizerRuns: 200, evmVersion: 'paris',
  abi: artifact.abi, bytecode: `0x${artifact.evm.bytecode.object}`,
}, null, 2) + '\n');
console.log(`LabToken compiled: ${artifact.evm.bytecode.object.length / 2} bytes of creation bytecode.`);
