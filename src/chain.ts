import { createConfig, http, fallback } from 'wagmi';
import { injected, coinbaseWallet } from 'wagmi/connectors';
import { createPublicClient, erc20Abi, parseAbi } from 'viem';
import { sepolia } from 'viem/chains';

export { sepolia, erc20Abi };
// Pinned from https://docs.squeekchain.com/developers/ on 2026-10-30.
export const SQK = '0x6872bfa5ccc3e9e440c6c16e5ffdabb8dba4cc76' as const;
export const CORE = '0x74665dAecA35A2303e767E76a2FF1FB6F93e119f' as const;
export const coreAbi = parseAbi([
  'function state() view returns ((uint64 settledThroughRound, uint64 cumulativeWork, uint96 cumulativeBlockUnits, uint64 blockHeight, uint96 blockProgress, uint32 workPerThousandBlocks, uint256 authorizationNonce, bool paused))',
]);
export const RPC_URLS = ['https://ethereum-sepolia-rpc.publicnode.com', 'https://sepolia.drpc.org'];
const transport = () => fallback(RPC_URLS.map(url => http(url, { timeout: 10_000, retryCount: 0 })), { retryCount: 1 });
export const config = createConfig({
  chains: [sepolia],
  multiInjectedProviderDiscovery: true,
  connectors: [injected(), coinbaseWallet({ appName: 'Squeek Tx Lab', preference: { options: 'all' }, appLogoUrl: new URL('./favicon.svg', document.baseURI).href })],
  transports: { [sepolia.id]: transport() },
});
export const client = createPublicClient({ chain: sepolia, transport: transport(), pollingInterval: 4_000 });
export const explorerTx = (hash: string) => `https://sepolia.etherscan.io/tx/${hash}`;
export const explorerAddress = (address: string) => `https://sepolia.etherscan.io/address/${address}`;

export async function assertRpcChain() {
  if (await client.getChainId() !== sepolia.id) throw new Error('The RPC returned a different network. Transactions are disabled.');
}
