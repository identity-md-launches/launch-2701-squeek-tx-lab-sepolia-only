import { useCallback, useEffect, useRef, useState } from 'react';
import { getAccount, getWalletClient } from 'wagmi/actions';
import { getAddress, type Abi, type Address, type Hash, type TransactionReceipt } from 'viem';
import { assertRpcChain, client, config, sepolia } from '../chain';
import { errorMessage } from './format';

export type TxEntry = {
  hash: Hash; label: string; kind: string; account: Address; createdAt: number;
  status: 'pending' | 'confirmed' | 'reverted' | 'cancelled';
  contractAddress?: Address; replacement?: Hash; note?: string;
};
const STORAGE = 'squeek-lab:transactions:v1';
function loadLog(): TxEntry[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((entry): entry is TxEntry => entry && /^0x[0-9a-f]{64}$/i.test(entry.hash) && /^0x[0-9a-f]{40}$/i.test(entry.account) && typeof entry.label === 'string' && typeof entry.kind === 'string' && Number.isFinite(entry.createdAt) && ['pending', 'confirmed', 'reverted', 'cancelled'].includes(entry.status));
  } catch { return []; }
}
export async function checkedWallet(expected: Address) {
  const current = getAccount(config);
  if (!current.isConnected || !current.address || current.chainId !== sepolia.id) throw new Error('Connect your wallet to Sepolia before sending.');
  if (getAddress(current.address) !== getAddress(expected)) throw new Error('The connected account changed. Review the transaction again.');
  const wallet = await getWalletClient(config, { chainId: sepolia.id });
  if (await wallet.getChainId() !== sepolia.id) throw new Error('Switch your wallet to Sepolia and try again.');
  const addresses = await wallet.getAddresses();
  if (!addresses.some(address => getAddress(address) === getAddress(expected))) throw new Error('The connected account changed. Review the transaction again.');
  return wallet;
}
export type ContractCall = { address: Address; abi: Abi; functionName: string; args?: readonly unknown[]; value?: bigint };
export function useTransactions(onSettled: () => void) {
  const [entries, setEntries] = useState<TxEntry[]>(loadLog);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, { state: 'pending' | 'success' | 'error'; text: string }>>({});
  const [storageWarning, setStorageWarning] = useState('');
  const locked = useRef(false);
  const watching = useRef(new Set<Hash>());
  const settled = useRef(onSettled);
  settled.current = onSettled;
  useEffect(() => {
    try { localStorage.setItem(STORAGE, JSON.stringify(entries)); }
    catch { setStorageWarning('This browser cannot save the log. Download it before closing the page.'); }
  }, [entries]);
  const update = useCallback((hash: Hash, change: Partial<TxEntry>) => setEntries(items => items.map(item => item.hash === hash ? { ...item, ...change } : item)), []);
  const watch = useCallback(async (entry: TxEntry) => {
    if (watching.current.has(entry.hash)) return;
    watching.current.add(entry.hash);
    let cancelled = false;
    try {
      const receipt = await client.waitForTransactionReceipt({
        hash: entry.hash, confirmations: 1, timeout: 180_000,
        onReplaced: replacement => {
          cancelled = replacement.reason === 'cancelled' || replacement.reason === 'replaced';
          update(entry.hash, { replacement: replacement.transaction.hash, note: cancelled ? 'This transaction was replaced in the wallet. Check the replacement on Etherscan.' : 'Transaction sped up in the wallet.' });
        },
      });
      update(entry.hash, { status: cancelled ? 'cancelled' : receipt.status === 'success' ? 'confirmed' : 'reverted', contractAddress: receipt.contractAddress ?? undefined });
      setFeedback(items => ({ ...items, [entry.kind]: { state: receipt.status === 'success' && !cancelled ? 'success' : 'error', text: cancelled ? 'Transaction replaced or cancelled in your wallet.' : receipt.status === 'success' ? 'Confirmed on Sepolia.' : 'Transaction reverted onchain. Check Etherscan before retrying.' } }));
      settled.current();
      return receipt;
    } catch {
      update(entry.hash, { note: 'Confirmation is taking longer. Check Etherscan or retry the status check.' });
    } finally { watching.current.delete(entry.hash); }
  }, [update]);
  useEffect(() => { entries.filter(entry => entry.status === 'pending' && !entry.note).forEach(entry => { void watch(entry); }); }, [entries, watch]);

  const send = useCallback(async (kind: string, label: string, account: Address, submit: () => Promise<Hash>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(kind);
    setFeedback(items => ({ ...items, [kind]: { state: 'pending', text: 'Checking the transaction. Confirm in your wallet when prompted.' } }));
    try {
      await assertRpcChain();
      await checkedWallet(account);
      const hash = await submit();
      const entry: TxEntry = { hash, label, kind, account, createdAt: Date.now(), status: 'pending' };
      setEntries(items => [entry, ...items]);
      setFeedback(items => ({ ...items, [kind]: { state: 'pending', text: 'Submitted. Waiting for Sepolia confirmation.' } }));
      void watch(entry);
      return hash;
    } catch (error) {
      setFeedback(items => ({ ...items, [kind]: { state: 'error', text: errorMessage(error) } }));
    } finally { locked.current = false; setBusy(null); }
  }, [watch]);

  const contract = useCallback((kind: string, label: string, account: Address, call: ContractCall, preflight?: () => Promise<void>) => send(kind, label, account, async () => {
    if (preflight) await preflight();
    const code = await client.getCode({ address: call.address });
    if (!code || code === '0x') throw new Error('No contract exists at this Sepolia address. Check the deployment.');
    const { request, result } = await client.simulateContract({ ...call, account, chain: sepolia });
    if (result === false) throw new Error('The contract simulation refused this transaction.');
    const wallet = await checkedWallet(account);
    return wallet.writeContract({ ...request, account, chain: sepolia });
  }), [send]);
  return { entries, busy, feedback, storageWarning, send, contract, retry: watch };
}
export type Transactions = ReturnType<typeof useTransactions>;
export type Receipt = TransactionReceipt;
