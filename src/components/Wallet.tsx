import { useEffect, useState } from 'react';
import { useAccount, useConnect, useDisconnect, useSwitchChain, type Connector } from 'wagmi';
import { sepolia } from '../chain';
import { errorMessage, shortAddress } from '../lib/format';
import { Icon } from './Icon';
import { Modal } from './Modal';

const OPEN_IN = [
  { id: 'metamask', name: 'MetaMask', href: (url: string) => `https://link.metamask.io/dapp/${url.replace(/^https?:\/\//, '')}` },
  { id: 'coinbase', name: 'Coinbase Wallet', href: (url: string) => `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}` },
  { id: 'rabby', name: 'Rabby', href: (url: string) => `https://go.rabby.io/mobile/?_cmd=open-dapp&dapp=${encodeURIComponent(url)}` },
  { id: 'phantom', name: 'Phantom', href: (url: string) => `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(new URL(url).origin)}` },
];
export function WalletControl() {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connectAsync, isPending, variables } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const named = connectors.some(c => c.type === 'injected' && c.id !== 'injected');
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && !named && !(window as unknown as { ethereum?: unknown }).ethereum;
  const listed = [...connectors.filter(c => c.type === 'injected'), ...connectors.filter(c => c.type !== 'injected')].filter(c => !(c.id === 'injected' && named) && !(mobile && c.type === 'injected'));
  useEffect(() => { if (isConnected) setOpen(false); }, [isConnected]);
  const label = (c: Connector) => c.id === 'injected' ? 'Browser wallet' : c.id === 'coinbaseWalletSDK' ? mobile ? 'Coinbase Smart Wallet' : 'Coinbase Wallet' : c.name;
  async function connectWallet(connector: Connector) {
    setError('');
    try { await connectAsync({ connector }); }
    catch (e) { setError(errorMessage(e)); }
  }
  async function switchNetwork() {
    setError('');
    try { await switchChainAsync({ chainId: sepolia.id }); }
    catch (e) { setError(errorMessage(e)); }
  }
  return <>
    <button className={`button ${isConnected ? 'secondary' : 'primary'} wallet-control`} onClick={() => {
      if (isConnected && chainId !== sepolia.id) void switchNetwork();
      else { setError(''); setOpen(true); }
    }} disabled={switching}>
      <Icon name="wallet" size={18}/><span>{switching ? 'Switching…' : isConnected && address ? chainId !== sepolia.id ? 'Switch to Sepolia' : shortAddress(address) : 'Connect wallet'}</span>
    </button>
    {error && !open && <p className="header-error" role="alert">{error}</p>}
    <Modal open={open} onClose={() => setOpen(false)} title={isConnected ? 'Connected wallet' : 'Connect a wallet'}>
      {isConnected && address ? <><p className="address-text">{address}</p><p className="muted">{chainId === sepolia.id ? 'Connected to Sepolia.' : 'Switch to Sepolia to send transactions.'}</p><button className="button secondary full" onClick={() => { disconnect(); setOpen(false); }}>Disconnect wallet</button></> : <>
        <p className="muted sheet-intro">Choose a wallet to start on Sepolia.</p>
        <div className="wallet-list">
          {mobile && OPEN_IN.map(wallet => <a className="wallet-row" href={wallet.href(location.href)} key={wallet.id}><img src={`./wallets/${wallet.id}.svg`} width="28" height="28" alt=""/><span>Open in {wallet.name}</span><Icon name="arrow" size={18}/></a>)}
          {listed.map(connector => <button className="wallet-row" key={connector.uid} disabled={isPending} onClick={() => void connectWallet(connector)}>
            {connector.icon ? <img src={connector.icon} width="28" height="28" alt=""/> : connector.id === 'coinbaseWalletSDK' ? <img src="./wallets/coinbase.svg" width="28" height="28" alt=""/> : <Icon name="wallet" size={28}/>}
            <span>{label(connector)}{isPending && variables?.connector === connector ? ' · Opening…' : ''}</span><Icon name="chevron" size={18}/>
          </button>)}
        </div>
        <p className="small muted sheet-foot"><Icon name="shield" size={16}/>No private key or seed phrase needed.</p>
      </>}
      <div role="status">{error && <p className="error-text">{error}</p>}</div>
    </Modal>
  </>;
}
