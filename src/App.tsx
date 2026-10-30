import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { assertRpcChain, client, CORE, coreAbi, SQK, erc20Abi, sepolia, explorerTx } from './chain';
import { displayAmount, errorMessage, formatAmount } from './lib/format';
import { GAME_STORAGE, parseGameConfig, type GameConfig } from './lib/game';
import { useTransactions } from './lib/transactions';
import { WalletControl } from './components/Wallet';
import { TokenTools } from './components/TokenTools';
import { Launchpad } from './components/Launchpad';
import { Game } from './components/Game';
import { Settings } from './components/Settings';
import { AddressLink, CopyButton, Feedback, SectionTitle } from './components/Shared';
import { Icon } from './components/Icon';

const NAV = [
  { id: 'wallet', label: 'Wallet', icon: 'wallet' },
  { id: 'ping', label: 'Ping SQK', icon: 'ping' },
  { id: 'tokens', label: 'Token tools', icon: 'send' },
  { id: 'game', label: 'Hamster guess', icon: 'game' },
  { id: 'launchpad', label: 'Launchpad', icon: 'rocket' },
  { id: 'activity', label: 'Transaction log', icon: 'log' },
];

function BalanceValue({ value }: { value?: bigint }) {
  if (value === undefined) return <strong className="balance-value">–</strong>;
  const full = formatAmount(value);
  const display = displayAmount(value);
  return <><strong className="balance-value">{full !== display && !display.startsWith('<') ? '≈ ' : ''}{display}</strong>{full !== display && <details className="exact-balance"><summary>Exact balance</summary><span className="code-text">{full}</span></details>}</>;
}

export function App() {
  const { address, isConnected, chainId } = useAccount();
  const ready = !!address && chainId === sepolia.id;
  const queryClient = useQueryClient();
  const tx = useTransactions(() => { void queryClient.invalidateQueries(); });
  const [settings, setSettings] = useState(false);
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);
  const [configError, setConfigError] = useState('');
  const [active, setActive] = useState('wallet');
  const [logFilter, setLogFilter] = useState('all');
  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        let stored: string | null = null;
        try { stored = localStorage.getItem(GAME_STORAGE); } catch { /* Public file still works when storage is disabled. */ }
        const response = stored ? null : await fetch('./game-config.json');
        if (response && !response.ok) throw new Error('The game configuration file could not be loaded.');
        const json: unknown = stored ? JSON.parse(stored) : await response!.json();
        if (!ignore) setGameConfig(json === null ? null : parseGameConfig(json));
      } catch (error) { if (!ignore) setConfigError(errorMessage(error)); }
    }
    void load();
    return () => { ignore = true; };
  }, []);
  useEffect(() => {
    const visible = new Set<string>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target.id);
        else visible.delete(entry.target.id);
      }
      // Prefer the next visible heading; adjacent tools can share that same row.
      const candidates = NAV.filter(item => visible.has(item.id)).map(item => ({ id: item.id, top: document.getElementById(item.id)!.getBoundingClientRect().top })).sort((a, b) => b.top - a.top);
      const row = candidates.filter(item => Math.abs(item.top - candidates[0].top) < 1);
      const requested = location.hash.slice(1);
      setActive(current => row.some(item => item.id === requested) ? requested : row.some(item => item.id === current) ? current : row[0]?.id ?? current);
    }, { rootMargin: '-10% 0px -65% 0px' });
    NAV.forEach(item => { const element = document.getElementById(item.id); if (element) observer.observe(element); });
    return () => observer.disconnect();
  }, []);
  const core = useQuery({
    queryKey: ['core'], queryFn: async () => {
      await assertRpcChain();
      const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
      const state = await client.readContract({ address: CORE, abi: coreAbi, functionName: 'state', blockNumber });
      return { state, blockNumber };
    }, refetchInterval: 15_000,
  });
  const balances = useQuery({
    queryKey: ['balances', address, chainId], queryFn: async () => {
      await assertRpcChain();
      const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
      const [eth, sqk, decimals] = await Promise.all([
        client.getBalance({ address: address!, blockNumber }),
        client.readContract({ address: SQK, abi: erc20Abi, functionName: 'balanceOf', args: [address!], blockNumber }),
        client.readContract({ address: SQK, abi: erc20Abi, functionName: 'decimals', blockNumber }),
      ]);
      if (decimals !== 18) throw new Error('SQK decimals differ from the pinned deployment. Token actions are disabled.');
      return { eth, sqk, blockNumber };
    }, enabled: ready, refetchInterval: 15_000,
  });
  const filtered = tx.entries.filter(entry => logFilter === 'all' || entry.status === logFilter);
  const refresh = () => { void queryClient.invalidateQueries(); };
  function downloadLog() {
    const blob = new Blob([JSON.stringify({ chainId: sepolia.id, exportedAt: new Date().toISOString(), transactions: tx.entries }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'squeek-sepolia-transactions.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <>
    <a href="#main" className="skip-link">Skip to content</a>
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#wallet" aria-label="Squeek Tx Lab home"><img src="./favicon.svg" width="36" height="36" alt=""/><span>Squeek<span className="brand-sub">Tx Lab</span></span></a>
        <nav aria-label="Lab sections">{NAV.map(item => <a key={item.id} className={active === item.id ? 'active' : ''} href={`#${item.id}`} onClick={() => setActive(item.id)} aria-current={active === item.id ? 'location' : undefined}><Icon name={item.icon} size={19}/><span>{item.label}</span>{active === item.id && <span className="nav-dot"/>}</a>)}</nav>
        <div className="sidebar-bottom"><div className="testnet-note"><Icon name="shield" size={19}/><div><strong>A testnet workspace</strong><p>Experiment on Sepolia.<br/>Stay in control of your wallet.</p></div></div><a className="sidebar-link" href="https://docs.squeekchain.com/" target="_blank" rel="noreferrer">Squeekchain docs<Icon name="arrow" size={16}/></a><button className="sidebar-link" onClick={() => setSettings(true)}>Lab configuration<Icon name="settings" size={16}/></button></div>
      </aside>
      <div className="workspace">
        <header className="topbar"><a href="#wallet" className="mobile-brand" aria-label="Squeek Tx Lab home"><img src="./favicon.svg" width="30" height="30" alt=""/><strong>Squeek</strong></a><div className="breadcrumb"><span>Workspace</span><Icon name="chevron" size={14}/><strong>Transaction lab</strong></div><div className="topbar-actions"><span className="network-badge"><span className="status-dot"/>Sepolia<span className="desktop-label"> testnet</span></span><WalletControl/></div></header>
        <main id="main">
          <div className="page-heading"><div><h1>Squeek Tx Lab<span className="heading-period">.</span></h1><p>Your workbench for Squeekchain transactions.</p></div><button className="icon-button config-button" onClick={() => setSettings(true)} aria-label="Open lab configuration"><Icon name="settings"/></button></div>
          <nav className="mobile-nav" aria-label="Jump to a section">{NAV.filter(item => item.id !== 'ping').map(item => <a href={`#${item.id}`} key={item.id}>{item.id === 'activity' ? 'Log' : item.id === 'game' ? 'Game' : item.id === 'tokens' ? 'Tokens' : item.label}</a>)}</nav>
          {isConnected && !ready && <div className="network-warning" role="status"><Icon name="shield"/><div><strong>Switch your wallet to Sepolia.</strong><p>Use “Switch to Sepolia” above. Transactions are disabled on this network.</p></div></div>}
          <div className="overview">
            <section className="panel wallet-panel" id="wallet" aria-label="Wallet">
              <SectionTitle icon="wallet" title="Wallet"><span className={`status-label ${ready ? 'connected' : ''}`}><span className="status-dot"/>{ready ? 'Connected' : isConnected ? 'Wrong network' : 'Not connected'}</span></SectionTitle>
              {address ? <div className="wallet-address"><AddressLink address={address}/><CopyButton value={address}/></div> : <p className="wallet-intro">Connect a wallet to start experimenting.</p>}
              <div className="balances"><div><span className="balance-label"><span className="coin-mark eth" aria-hidden="true">◇</span>Sepolia ETH</span><BalanceValue value={ready ? balances.data?.eth : undefined}/><span className="small muted">For transaction gas</span></div><div><span className="balance-label"><img src="./favicon.svg" width="20" height="20" alt=""/>SQK balance</span><BalanceValue value={ready ? balances.data?.sqk : undefined}/><span className="small muted">Squeek test tokens</span></div></div>
              <div className="wallet-footer"><span><Icon name="shield" size={14}/>Sepolia only. You approve every transaction.</span><button className="icon-button" aria-label="Refresh balances and chain state" onClick={refresh} disabled={core.isFetching || balances.isFetching}><Icon name="refresh" size={16}/></button></div>
              {ready && balances.isError && <p className="error-text">{errorMessage(balances.error)} <button className="text-button" onClick={() => void balances.refetch()}>Retry balances</button></p>}
              {ready && balances.isPending && <p className="small muted" role="status">Loading balances from Sepolia…</p>}
            </section>
            <section className="panel core-panel" aria-label="Live SqueekCore state"><SectionTitle icon="network" title="SqueekCore"><span className={`status-label ${core.data && !core.isError ? 'connected' : ''}`}><span className="status-dot"/>{core.isError ? 'Unavailable' : core.data ? 'Live reads' : 'Connecting'}</span></SectionTitle>
              <dl className="core-stats"><div><dt>Settled through round<span className="sr-only"> (settledThroughRound)</span></dt><dd>{core.data?.state.settledThroughRound.toLocaleString() ?? '–'}</dd></div><div><dt>Block height<span className="sr-only"> (blockHeight)</span></dt><dd>{core.data?.state.blockHeight.toLocaleString() ?? '–'}</dd></div><div><dt>Paused<span className="sr-only"> (paused)</span></dt><dd>{core.data ? <span className={core.data.state.paused ? 'warning-text' : 'success-text'}>{core.data.state.paused ? 'Yes' : 'No'}<span className="small muted">{core.data.state.paused ? ' · Settlement paused' : ' · Settlement active'}</span></span> : '–'}</dd></div></dl>
              <div className="core-footer"><span className="small muted">{core.data ? `Read at ${new Date(core.dataUpdatedAt).toLocaleTimeString('en-GB')} · refreshes every 15s` : core.isError ? 'Chain reads unavailable.' : 'Reading Sepolia…'}</span>{core.isError && <button className="text-button" onClick={() => void core.refetch()}>Retry</button>}</div>
            </section>
          </div>
          <section className="ping-panel" id="ping" aria-label="Ping SQK"><div className="ping-icon"><Icon name="ping" size={25}/></div><div className="ping-copy"><div className="ping-title"><h2>Start with a ping</h2><span className="small">01</span></div><p>Send your first SQK transaction. Move zero tokens.</p><details><summary>What does a ping do?</summary><p>Calls <code>approve(your address, 0)</code> on SQK. This sets your own spending allowance to zero and costs Sepolia ETH for gas.</p></details></div><button className="button primary" disabled={!ready || !!tx.busy} onClick={() => address && void tx.contract('ping', 'Ping SQK · self-approval of 0', address, { address: SQK, abi: erc20Abi, functionName: 'approve', args: [address, 0n] })}><Icon name="ping" size={17}/>{tx.busy === 'ping' ? 'Preparing ping…' : 'Ping SQK'}<Icon name="arrow" size={17}/></button><div className="ping-feedback"><Feedback kind="ping" tx={tx}/></div></section>
          <div className="tools-heading"><h2>Make your next move</h2><span className="small muted">All actions use Sepolia test assets.</span></div>
          <TokenTools balance={ready && !balances.isError ? balances.data?.sqk : undefined} tx={tx}/>
          <div className="experiment-grid"><Game config={gameConfig} tx={tx} configure={() => setSettings(true)}/><Launchpad tx={tx}/></div>
          {configError && <p className="error-text">Game configuration: {configError} <button className="text-button" onClick={() => setSettings(true)}>Open configuration</button></p>}
          <section className="panel log-panel" id="activity" aria-label="Transaction log"><SectionTitle icon="log" title="Transaction log"><button className="button ghost compact" onClick={downloadLog} disabled={!tx.entries.length}><Icon name="download" size={16}/><span>Export log</span></button></SectionTitle><div className="log-tools"><p className="small muted">Transactions sent from this page, saved in this browser.</p><label className="log-filter">Show<select value={logFilter} onChange={event => setLogFilter(event.target.value)}><option value="all">All transactions</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="reverted">Reverted</option><option value="cancelled">Replaced / cancelled</option></select></label></div>
            {!filtered.length ? <div className="log-empty"><span className="empty-icon"><Icon name="log" size={26}/></span><div><h3>{tx.entries.length ? 'No matching transactions' : 'Your experiments start here'}</h3><p>{tx.entries.length ? 'Choose another status to see more of your log.' : 'Send a ping and your transaction will appear here.'}</p></div>{!tx.entries.length && <a className="text-link" href="#ping">Go to Ping SQK<Icon name="arrow" size={16}/></a>}</div> : <ol className="transaction-list">{filtered.map(entry => <li key={entry.hash}><div className="transaction-heading"><div><strong>{entry.label}</strong><span className="small muted">{new Date(entry.createdAt).toLocaleString('en-GB')}</span></div><span className={`tx-status ${entry.status}`}>{entry.status === 'confirmed' && <Icon name="check" size={14}/>} {entry.status}</span></div><a className="tx-hash" href={explorerTx(entry.hash)} target="_blank" rel="noreferrer"><span>{entry.hash}</span><Icon name="arrow" size={16}/><span className="sr-only">on Sepolia Etherscan (new tab)</span></a><details><summary>Transaction details</summary><p className="small">From</p><AddressLink address={entry.account}/>{entry.contractAddress && <><p className="small">Deployed token</p><AddressLink address={entry.contractAddress}/></>}{entry.replacement && <><p className="small">Replacement</p><a className="tx-hash" href={explorerTx(entry.replacement)} target="_blank" rel="noreferrer">{entry.replacement}</a></>}</details>{entry.note && <p className="small muted">{entry.note}</p>}{entry.status === 'pending' && entry.note && <button className="text-button" onClick={() => void tx.retry(entry)}>Check confirmation</button>}</li>)}</ol>}
            {tx.storageWarning && <p className="warning-text">{tx.storageWarning}</p>}
          </section>
          <footer className="page-footer"><span><img src="./favicon.svg" width="20" height="20" alt=""/>Built for curious Squeeks.</span><p>Sepolia only · Never share a private key or seed phrase.</p><a href="https://docs.squeekchain.com/" target="_blank" rel="noreferrer">Documentation<Icon name="arrow" size={14}/></a></footer>
        </main>
      </div>
    </div>
    <Settings open={settings} onClose={() => setSettings(false)} gameConfig={gameConfig} setGameConfig={value => { setGameConfig(value); setConfigError(''); }}/>
  </>;
}
