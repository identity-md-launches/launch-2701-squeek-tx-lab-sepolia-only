import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { client, SQK, erc20Abi, sepolia } from '../chain';
import { formatAmount, parseAmount, validAddress } from '../lib/format';
import type { Transactions } from '../lib/transactions';
import { Icon } from './Icon';
import { Modal } from './Modal';
import { AddressLink, Feedback, Field, Gate, SectionTitle } from './Shared';

export function TokenTools({ balance, tx }: { balance?: bigint; tx: Transactions }) {
  const { address, isConnected, chainId } = useAccount();
  const ready = !!address && chainId === sepolia.id;
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [spender, setSpender] = useState('');
  const [allowanceAmount, setAllowanceAmount] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [review, setReview] = useState<{ kind: 'transfer' | 'approve' | 'revoke'; to: `0x${string}`; amount: bigint; account: `0x${string}` } | null>(null);
  let parsedSpender: `0x${string}` | undefined;
  try { parsedSpender = validAddress(spender); } catch { /* Keep reads off while the address is incomplete. */ }
  const allowance = useQuery({
    queryKey: ['allowance', address, parsedSpender, tx.entries.filter(entry => entry.status === 'confirmed').length],
    queryFn: () => client.readContract({ address: SQK, abi: erc20Abi, functionName: 'allowance', args: [address!, parsedSpender!] }),
    enabled: ready && !!parsedSpender, refetchInterval: 15_000,
  });
  useEffect(() => { setReview(null); setErrors({}); }, [address, chainId]);
  const busy = !!tx.busy;
  function reviewTransfer(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: Record<string, string> = {};
    let to: `0x${string}` | undefined, value: bigint | undefined;
    try { to = validAddress(recipient); } catch (e) { found.recipient = (e as Error).message; }
    try {
      value = parseAmount(amount);
      if (balance === undefined) throw new Error('Wait for your SQK balance to load, then retry.');
      if (value > balance) throw new Error('This amount exceeds your SQK balance.');
    } catch (e) { found.amount = (e as Error).message; }
    setErrors(found);
    if (Object.keys(found).length) document.getElementById(found.recipient ? 'recipient' : 'transfer-amount')?.focus();
    else if (to && value && address) setReview({ kind: 'transfer', to, amount: value, account: address });
  }
  function reviewApproval(revoke = false) {
    const found: Record<string, string> = {};
    let to: `0x${string}` | undefined, value = 0n;
    try { to = validAddress(spender); } catch (e) { found.spender = (e as Error).message; }
    if (!revoke) {
      try {
        value = parseAmount(allowanceAmount);
        if (allowance.data === undefined) throw new Error('Wait for the current allowance to load, then retry.');
        if (allowance.data > 0n) throw new Error('Revoke the existing allowance before setting a new one.');
      } catch (e) { found.allowanceAmount = (e as Error).message; }
    }
    setErrors(found);
    if (Object.keys(found).length) document.getElementById(found.spender ? 'spender' : 'approval-amount')?.focus();
    else if (to && address) setReview({ kind: revoke ? 'revoke' : 'approve', to, amount: value, account: address });
  }
  async function confirm() {
    if (!review) return;
    const value = review;
    setReview(null);
    await tx.contract(value.kind === 'transfer' ? 'transfer' : 'approval', value.kind === 'transfer' ? `Transfer ${formatAmount(value.amount)} SQK` : value.kind === 'revoke' ? 'Revoke SQK allowance' : `Approve ${formatAmount(value.amount)} SQK`, value.account, {
      address: SQK, abi: erc20Abi, functionName: value.kind === 'transfer' ? 'transfer' : 'approve', args: [value.to, value.amount],
    }, async () => {
      if (value.kind === 'transfer') {
        const currentBalance = await client.readContract({ address: SQK, abi: erc20Abi, functionName: 'balanceOf', args: [value.account] });
        if (value.amount > currentBalance) throw new Error('Your SQK balance changed. Enter a smaller amount.');
      } else if (value.kind === 'approve') {
        const currentAllowance = await client.readContract({ address: SQK, abi: erc20Abi, functionName: 'allowance', args: [value.account, value.to] });
        if (currentAllowance !== 0n) throw new Error('Revoke the existing allowance before setting a new one.');
      }
    });
  }
  return <>
    <div className="two-column" id="tokens">
      <section className="panel" aria-labelledby="transfer-heading">
        <SectionTitle icon="send" title="Transfer SQK" index="02"/>
        <p className="section-description" id="transfer-heading">Send test tokens to an Ethereum address.</p>
        <form onSubmit={reviewTransfer} noValidate>
          <Field id="recipient" label="Recipient address" value={recipient} onChange={value => { setRecipient(value); setErrors(current => ({ ...current, recipient: '' })); }} placeholder="0x…" error={errors.recipient}/>
          <Field id="transfer-amount" label="Amount in SQK" value={amount} onChange={value => { setAmount(value); setErrors(current => ({ ...current, amount: '' })); }} placeholder="0.00" numeric error={errors.amount} trailing={<button className="text-button" type="button" disabled={balance === undefined} onClick={() => { if (balance !== undefined) { setAmount(formatAmount(balance)); setErrors(current => ({ ...current, amount: '' })); } }}>Use max</button>}/>
          <div className="form-summary"><span>Available balance</span><strong>{balance === undefined ? 'Not loaded' : `${formatAmount(balance)} SQK`}</strong></div>
          <button className="button secondary full" disabled={!ready || busy} type="submit"><Icon name="send" size={18}/>{tx.busy === 'transfer' ? 'Preparing transfer…' : 'Review transfer'}</button>
        </form>
        <Gate connected={isConnected} wrongChain={isConnected && !ready}/><Feedback kind="transfer" tx={tx}/>
      </section>
      <section className="panel" aria-label="Approve and revoke SQK">
        <SectionTitle icon="shield" title="Approve / Revoke SQK" index="03"/>
        <p className="section-description">Control how much SQK a spender can use.</p>
        <form onSubmit={event => { event.preventDefault(); reviewApproval(); }} noValidate>
          <Field id="spender" label="Spender address" value={spender} onChange={value => { setSpender(value); setErrors(current => ({ ...current, spender: '', allowanceAmount: '' })); }} placeholder="0x…" error={errors.spender}/>
          <Field id="approval-amount" label="Allowance in SQK" value={allowanceAmount} onChange={value => { setAllowanceAmount(value); setErrors(current => ({ ...current, allowanceAmount: '' })); }} placeholder="0.00" numeric error={errors.allowanceAmount}/>
          <div className="form-summary"><span>Current allowance</span><strong>{allowance.data !== undefined ? `${formatAmount(allowance.data)} SQK` : allowance.isError ? 'Read unavailable' : parsedSpender && ready ? 'Loading…' : 'Enter a spender'}</strong></div>
          <div className="button-row"><button className="button secondary" disabled={!ready || busy} type="submit">Approve SQK</button><button className="button secondary" disabled={!ready || busy} type="button" onClick={() => reviewApproval(true)}>Revoke to zero</button></div>
          <p className="small muted form-note">Approval grants spending permission. Revoking sets it to 0.</p>
        </form>
        <Gate connected={isConnected} wrongChain={isConnected && !ready}/><Feedback kind="approval" tx={tx}/>
      </section>
    </div>
    <Modal open={!!review} onClose={() => setReview(null)} title={review?.kind === 'transfer' ? 'Review SQK transfer' : review?.kind === 'revoke' ? 'Review revocation' : 'Review SQK approval'}>
      {review && <><div className="review-amount">{formatAmount(review.amount)} <span>SQK</span></div><p className="muted">{review.kind === 'transfer' ? 'Send to this recipient:' : 'Set the allowance for this spender:'}</p><AddressLink address={review.to}/><dl className="review-details"><dt>Network</dt><dd>Sepolia · 11155111</dd><dt>From</dt><dd className="address-text">{review.account}</dd><dt>Token contract</dt><dd><AddressLink address={SQK}/></dd><dt>Gas</dt><dd>Estimated in your wallet, paid in Sepolia ETH.</dd></dl><p className="small">{review.kind === 'transfer' ? 'Confirm the full recipient address. An onchain transfer cannot be undone.' : review.kind === 'revoke' ? 'This removes this spender’s permission to use your SQK.' : 'This spender will be allowed to transfer up to this amount from your wallet.'}</p><button className="button primary full" onClick={() => void confirm()} disabled={busy || !ready}>{review.kind === 'transfer' ? 'Send SQK' : review.kind === 'revoke' ? 'Revoke allowance' : 'Approve allowance'}<Icon name="arrow" size={18}/></button></>}
    </Modal>
  </>;
}
