import { useState, type ReactNode } from 'react';
import { explorerAddress, explorerTx } from '../chain';
import type { Transactions } from '../lib/transactions';
import { Icon } from './Icon';

export function SectionTitle({ icon, title, index, children }: { icon: string; title: string; index?: string; children?: ReactNode }) {
  return <div className="section-heading"><div className="heading-label"><span className="section-icon"><Icon name={icon}/></span><h2>{title}</h2>{index && <span className="section-index" aria-hidden="true">{index}</span>}</div>{children}</div>;
}
export function AddressLink({ address }: { address: string }) {
  return <a className="address-text" href={explorerAddress(address)} target="_blank" rel="noreferrer">{address}<Icon name="arrow" size={14}/><span className="sr-only"> on Sepolia Etherscan (new tab)</span></a>;
}
export function CopyButton({ value, label = 'Copy address' }: { value: string; label?: string }) {
  const [status, setStatus] = useState('');
  return <span className="copy-group"><button className="icon-button" aria-label={label} onClick={async () => {
    try { await navigator.clipboard.writeText(value); setStatus('Copied'); }
    catch { setStatus('Select and copy the address'); }
    setTimeout(() => setStatus(''), 3000);
  }}><Icon name={status === 'Copied' ? 'check' : 'copy'} size={16}/></button><span className="sr-only" role="status">{status}</span></span>;
}
export function Feedback({ kind, tx }: { kind: string; tx: Transactions }) {
  const feedback = tx.feedback[kind];
  const latest = tx.entries.find(entry => entry.kind === kind);
  return <div className="feedback" role="status">
    {feedback && <p className={feedback.state === 'error' ? 'error-text' : feedback.state === 'success' ? 'success-text' : 'muted'}>{feedback.text}</p>}
    {latest && <><p className="muted">Last submitted transaction</p><a href={explorerTx(latest.hash)} target="_blank" rel="noreferrer" className="tx-hash"><span>{latest.hash}</span><Icon name="arrow" size={14}/><span className="sr-only">View transaction on Sepolia Etherscan (new tab)</span></a></>}
  </div>;
}
export function Gate({ connected, wrongChain }: { connected: boolean; wrongChain: boolean }) {
  if (wrongChain) return <p className="gate-note"><Icon name="shield" size={14}/>Switch to Sepolia first.</p>;
  if (!connected) return <p className="gate-note"><Icon name="wallet" size={14}/>Connect a wallet first.</p>;
  return null;
}
export function Field({ id, label, value, onChange, placeholder, error, hint, numeric = false, maxLength, trailing }: {
  id: string; label: string; value: string; onChange: (value: string) => void; placeholder?: string; error?: string; hint?: string; numeric?: boolean; maxLength?: number; trailing?: ReactNode;
}) {
  return <div className="field"><div className="field-label"><label htmlFor={id}>{label}</label>{trailing}</div>
    <input id={id} name={id} type="text" inputMode={numeric ? 'decimal' : 'text'} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} autoComplete="off" spellCheck={false} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} maxLength={maxLength}/>
    {error ? <p className="field-error" id={`${id}-error`}>{error}</p> : hint && <p className="small muted" id={`${id}-hint`}>{hint}</p>}
  </div>;
}
