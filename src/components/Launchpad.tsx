import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { encodeDeployData, type Abi, type Hex } from 'viem';
import artifact from '../generated/LabToken.json';
import { client, erc20Abi, sepolia } from '../chain';
import { errorMessage, formatAmount, parseAmount } from '../lib/format';
import { checkedWallet, type Transactions } from '../lib/transactions';
import { AddressLink, Feedback, Field, Gate, SectionTitle } from './Shared';
import { Modal } from './Modal';
import { Icon } from './Icon';

export function Launchpad({ tx }: { tx: Transactions }) {
  const { address, isConnected, chainId } = useAccount();
  const ready = !!address && chainId === sepolia.id;
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [supply, setSupply] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [review, setReview] = useState<{ name: string; symbol: string; supply: bigint; account: `0x${string}` } | null>(null);
  useEffect(() => { setReview(null); setErrors({}); }, [address, chainId]);
  const latest = tx.entries.find(entry => entry.kind === 'deploy' && entry.account.toLowerCase() === address?.toLowerCase() && entry.status === 'confirmed' && entry.contractAddress);
  const deployed = useQuery({
    queryKey: ['deployed-token', latest?.contractAddress, address],
    queryFn: async () => {
      const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
      const contract = { address: latest!.contractAddress!, abi: erc20Abi, blockNumber } as const;
      const [balance, symbol] = await Promise.all([client.readContract({ ...contract, functionName: 'balanceOf', args: [address!] }), client.readContract({ ...contract, functionName: 'symbol' })]);
      return { balance, symbol };
    },
    enabled: !!latest?.contractAddress && ready, refetchInterval: 15_000,
  });
  function prepare(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: Record<string, string> = {};
    const nameLength = new TextEncoder().encode(name.trim()).length;
    if (!nameLength || nameLength > 64) found.name = 'Use a token name between 1 and 64 UTF-8 bytes.';
    if (!/^[A-Za-z][A-Za-z0-9]{0,9}$/.test(symbol.trim())) found.symbol = 'Use 1–10 letters or numbers, starting with a letter.';
    let amount: bigint | undefined;
    try { amount = parseAmount(supply); } catch (error) { found.supply = (error as Error).message; }
    setErrors(found);
    if (Object.keys(found).length) document.getElementById(found.name ? 'token-name' : found.symbol ? 'token-symbol' : 'token-supply')?.focus();
    else if (address && amount) setReview({ name: name.trim(), symbol: symbol.trim().toUpperCase(), supply: amount, account: address });
  }
  async function deploy() {
    if (!review) return;
    const value = review;
    setReview(null);
    await tx.send('deploy', `Deploy ${value.name} (${value.symbol})`, value.account, async () => {
      const deploy = { abi: artifact.abi as Abi, bytecode: artifact.bytecode as Hex, args: [value.name, value.symbol, value.supply] };
      const data = encodeDeployData(deploy);
      const gas = await client.estimateGas({ account: value.account, data });
      const wallet = await checkedWallet(value.account);
      return wallet.deployContract({ ...deploy, account: value.account, chain: sepolia, gas: gas * 120n / 100n });
    });
  }
  return <section className="panel launch-panel" id="launchpad" aria-label="Token launchpad">
    <SectionTitle icon="rocket" title="Token launchpad" index="05"/>
    <p className="section-description">Launch a fixed-supply ERC20 from your wallet.</p>
    <form onSubmit={prepare} noValidate>
      <Field id="token-name" label="Token name" value={name} onChange={setName} placeholder="My test token" maxLength={64} error={errors.name}/>
      <div className="launch-fields"><Field id="token-symbol" label="Symbol" value={symbol} onChange={setSymbol} placeholder="TOKEN" maxLength={10} error={errors.symbol}/><Field id="token-supply" label="Total supply" value={supply} onChange={setSupply} placeholder="1000000" numeric error={errors.supply}/></div>
      <div className="token-properties"><span><Icon name="check" size={14}/>18 decimals</span><span><Icon name="check" size={14}/>No further minting</span></div>
      <p className="small muted form-note">The full supply goes to your connected wallet. Deployment costs Sepolia ETH for gas.</p>
      <button className="button secondary full" disabled={!ready || !!tx.busy}><Icon name="rocket" size={18}/>{tx.busy === 'deploy' ? 'Preparing deployment…' : 'Review token deployment'}</button>
    </form>
    <Gate connected={isConnected} wrongChain={isConnected && !ready}/><Feedback kind="deploy" tx={tx}/>
    {latest?.contractAddress && <div className="deployed-result"><h3>Token deployed</h3><AddressLink address={latest.contractAddress}/><p className="small">Deployer balance: <strong>{deployed.data ? `${formatAmount(deployed.data.balance)} ${deployed.data.symbol}` : deployed.isError ? 'Unavailable' : 'Loading…'}</strong></p>{deployed.isError && <p className="error-text small">{errorMessage(deployed.error)} <button className="text-button" onClick={() => void deployed.refetch()}>Retry token balance</button></p>}</div>}
    <Modal open={!!review} onClose={() => setReview(null)} title="Review token deployment">
      {review && <><p className="review-amount">{review.name} <span>({review.symbol})</span></p><dl className="review-details"><dt>Fixed supply</dt><dd>{formatAmount(review.supply)} {review.symbol}</dd><dt>Decimals</dt><dd>18</dd><dt>Recipient of supply</dt><dd className="address-text">{review.account}</dd><dt>Network</dt><dd>Sepolia · 11155111</dd></dl><p className="small muted">A new ERC20 contract will be deployed. Its name, symbol and supply cannot be changed. No owner, fees, or minting controls are added.</p><button className="button primary full" onClick={() => void deploy()} disabled={!ready || !!tx.busy}>Deploy token<Icon name="arrow" size={18}/></button></>}
    </Modal>
  </section>;
}
