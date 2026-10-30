import { formatUnits, getAddress, isAddress, maxUint256, parseUnits, zeroAddress } from 'viem';

export const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
export const formatAmount = (value: bigint, decimals = 18) => formatUnits(value, decimals);
export function displayAmount(value: bigint, decimals = 18) {
  const full = formatAmount(value, decimals);
  const [whole, fraction] = full.split('.');
  if (!fraction || fraction.length <= 5) return full;
  if (value > 0n && BigInt(whole) === 0n && !/[1-9]/.test(fraction.slice(0, 5))) return '<0.00001';
  return `${whole}.${fraction.slice(0, 5)}`;
}
export function parseAmount(value: string, decimals = 18, allowZero = false): bigint {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value.trim())) throw new Error('Enter a plain decimal amount, such as 1.5.');
  if ((value.split('.')[1]?.length ?? 0) > decimals) throw new Error(`Use no more than ${decimals} decimal places.`);
  const amount = parseUnits(value.trim(), decimals);
  if (amount === 0n && !allowZero) throw new Error('Enter an amount greater than zero.');
  if (amount > maxUint256) throw new Error('This amount exceeds the token limit.');
  return amount;
}
export function validAddress(value: string) {
  if (!isAddress(value.trim(), { strict: true }) || value.trim().toLowerCase() === zeroAddress) throw new Error('Enter a valid, nonzero Ethereum address.');
  return getAddress(value.trim());
}
export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/User rejected|User denied|rejected the request|4001|ACTION_REJECTED/i.test(raw)) return 'Request declined in your wallet. You can try again.';
  if (/insufficient funds/i.test(raw)) return 'Not enough Sepolia ETH for gas. Add test ETH and try again.';
  if (/chain.*mismatch|chain.*does not match|switch.*chain/i.test(raw)) return 'Switch your wallet to Sepolia and try again.';
  if (/fetch|timeout|HTTP request|network request/i.test(raw)) return 'The Sepolia RPC is unavailable. Check your connection and retry.';
  return raw.split('\n').filter(Boolean).slice(0, 2).join(' ').slice(0, 350);
}
