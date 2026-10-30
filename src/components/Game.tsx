import { useState } from 'react';
import { useAccount } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { client, sepolia } from '../chain';
import { gameCall, readGame, type GameConfig } from '../lib/game';
import { errorMessage, formatAmount, shortAddress } from '../lib/format';
import type { Transactions } from '../lib/transactions';
import { Feedback, Gate, SectionTitle, AddressLink } from './Shared';
import { Modal } from './Modal';
import { Icon } from './Icon';

export function Game({ config, tx, configure }: { config: GameConfig | null; tx: Transactions; configure: () => void }) {
  const { address, chainId, isConnected } = useAccount();
  const ready = !!address && chainId === sepolia.id && !!config;
  const [error, setError] = useState('');
  const [review, setReview] = useState<{ action: 'playOdd' | 'playEven' | 'resolve'; account: `0x${string}` } | null>(null);
  const state = useQuery({
    queryKey: ['game', config, address, tx.entries.filter(item => item.status === 'confirmed').length],
    queryFn: async () => readGame(config!, address!, await client.getBlockNumber({ cacheTime: 0 })),
    enabled: ready, refetchInterval: 15_000,
  });
  async function play() {
    if (!review || !config || !address) return;
    const current = review;
    setReview(null); setError('');
    try {
      if (current.account !== address) throw new Error('Your wallet account changed. Review the game action again.');
      const label = current.action === 'playOdd' ? 'Play Odd' : current.action === 'playEven' ? 'Play Even' : 'Resolve round';
      const call = gameCall(config, current.action, current.account, state.data?.pendingRound);
      await tx.contract('game', label, current.account, call);
      void state.refetch();
    } catch (e) { setError(errorMessage(e)); }
  }
  const unavailable = !ready || !!tx.busy || !state.data || state.isError;
  return <section className="panel game-panel" id="game" aria-label="SqueekHamsterGuess">
    <SectionTitle icon="game" title="SqueekHamsterGuess" index="04"/>
    <p className="section-description">Pick a side. Resolve your onchain round.</p>
    <div className="game-layout">
      <div className="game-controls">
        <div className="game-visual" aria-hidden="true"><svg viewBox="0 0 240 120" fill="none"><circle cx="120" cy="65" r="45" stroke="currentColor" strokeWidth="1" strokeDasharray="3 6"/><path d="M27 64h30m126 0h30M120 8v12m0 90v8" stroke="currentColor"/><circle cx="98" cy="41" r="13" fill="#c8baf0"/><circle cx="142" cy="41" r="13" fill="#c8baf0"/><rect x="85" y="42" width="70" height="54" rx="25" fill="#ddd4f5"/><circle cx="108" cy="63" r="4" fill="#493a85"/><circle cx="132" cy="63" r="4" fill="#493a85"/><path d="m115 77 5 6 5-6z" fill="#493a85"/><path d="M105 78H78m57 0h27" stroke="#9481c4" strokeWidth="2" strokeLinecap="round"/><circle cx="48" cy="64" r="3" fill="currentColor"/><circle cx="192" cy="64" r="3" fill="currentColor"/></svg></div>
        <dl className="game-stats"><div><dt>Pending round</dt><dd>{state.data ? state.data.hasPending ? state.data.pendingRound : 'None' : '–'}</dd></div><div><dt>Your score</dt><dd>{state.data?.score ?? '–'}</dd></div></dl>
        <div className="button-row"><button className="button secondary" disabled={unavailable || state.data?.hasPending} onClick={() => address && setReview({ action: 'playOdd', account: address })}>Play Odd</button><button className="button secondary" disabled={unavailable || state.data?.hasPending} onClick={() => address && setReview({ action: 'playEven', account: address })}>Play Even</button></div>
        <button className="button ghost full" disabled={unavailable || !state.data?.hasPending} onClick={() => address && setReview({ action: 'resolve', account: address })}>Resolve pending round<Icon name="arrow" size={16}/></button>
      </div>
      <div className="leaderboard"><div className="leaderboard-heading"><h3>Leaderboard</h3><span className="small muted">Top 10</span></div>
        <div className="leaderboard-columns"><span>Player</span><span>Score</span></div>
        {state.data?.leaderboard.length ? <ol className="leaderboard-list">{state.data.leaderboard.map((row, index) => <li key={`${row.address}-${index}`}><span className="rank">{index + 1}</span><details><summary>{shortAddress(row.address)}</summary><AddressLink address={row.address}/></details><strong>{row.score}</strong></li>)}</ol> : <div className="leaderboard-empty"><Icon name="game" size={26}/><p>{!config ? 'Waiting for the game' : !ready ? 'Connect to view scores' : state.isPending ? 'Loading scores…' : state.isError ? 'Scores unavailable' : 'No scores yet'}</p><span className="small muted">{!config ? 'Onchain scores appear after setup.' : state.data ? 'Play a round to get started.' : 'Scores are read from the game contract.'}</span></div>}
      </div>
    </div>
    {!config && <div className="setup-note"><Icon name="info" size={18}/><div><strong>Game deployment needed</strong><p>The game’s Sepolia address and ABI haven’t been supplied.</p><button className="text-button" onClick={configure}>Configure game<Icon name="arrow" size={14}/></button></div></div>}
    {config && <><Gate connected={isConnected} wrongChain={isConnected && chainId !== sepolia.id}/>{state.isError && <p className="error-text">{errorMessage(state.error)} <button className="text-button" onClick={() => void state.refetch()}>Retry game reads</button></p>}<details className="contract-details"><summary>Game contract</summary><AddressLink address={config.address}/></details></>}
    <div role="status">{error && <p className="error-text">{error}</p>}</div><Feedback kind="game" tx={tx}/>
    <Modal open={!!review} onClose={() => setReview(null)} title={review?.action === 'resolve' ? 'Resolve your round' : review?.action === 'playOdd' ? 'Play Odd' : 'Play Even'}>
      {review && config && <><p className="muted">Review this call to the configured Sepolia game.</p><AddressLink address={config.address}/><dl className="review-details"><dt>Function</dt><dd className="code-text">{config.actions[review.action].functionName}</dd><dt>Native value</dt><dd>{formatAmount(BigInt(config.actions[review.action].valueWei ?? '0'))} Sepolia ETH, plus gas</dd><dt>Pending round</dt><dd>{state.data?.pendingRound ?? 'Not loaded'}</dd></dl><p className="small muted">The contract defines the game’s rules. Simulation must succeed before your wallet opens.</p><button className="button primary full" disabled={!ready || !!tx.busy || address !== review.account} onClick={() => void play()}>Confirm {review.action === 'resolve' ? 'resolve' : review.action === 'playOdd' ? 'Odd' : 'Even'}<Icon name="arrow" size={16}/></button></>}
    </Modal>
  </section>;
}
