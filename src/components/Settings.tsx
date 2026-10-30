import { useState } from 'react';
import { CORE, SQK } from '../chain';
import { GAME_STORAGE, parseGameConfig, type GameConfig } from '../lib/game';
import { errorMessage } from '../lib/format';
import { Modal } from './Modal';
import { AddressLink } from './Shared';
import { Icon } from './Icon';

export function Settings({ open, onClose, gameConfig, setGameConfig }: { open: boolean; onClose: () => void; gameConfig: GameConfig | null; setGameConfig: (config: GameConfig | null) => void }) {
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  function save() {
    try {
      const config = parseGameConfig(JSON.parse(text));
      localStorage.setItem(GAME_STORAGE, JSON.stringify(config));
      setGameConfig(config); setMessage('Game configuration saved for this browser.'); setError(false);
    } catch (e) { setMessage(errorMessage(e)); setError(true); }
  }
  return <Modal title="Lab configuration" open={open} onClose={onClose} wide>
    <p className="muted">Sepolia only · Chain ID 11155111</p>
    <dl className="config-addresses"><dt>SqueekToken (SQK)</dt><dd><AddressLink address={SQK}/></dd><dt>SqueekCore</dt><dd><AddressLink address={CORE}/></dd></dl>
    <a className="text-link" href="https://docs.squeekchain.com/developers/" target="_blank" rel="noreferrer">Official deployment record<Icon name="arrow" size={14}/></a>
    <div className="config-game"><h3>Game deployment</h3><p className="small muted">Load the published contract address, ABI and function bindings. This configures only this browser. Site owners can also set the bundled game-config.json.</p>
      {gameConfig && <><p className="small">Current game:</p><AddressLink address={gameConfig.address}/></>}
      <p className="small"><a href="./game-configuration.md" target="_blank" rel="noreferrer">Read the game configuration format</a></p>
      <label className="upload-label" htmlFor="game-file"><Icon name="download" size={16}/>Choose configuration file</label><input id="game-file" type="file" accept="application/json,.json" onChange={async event => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.size > 500_000) { setMessage('Use a configuration file smaller than 500 KB.'); setError(true); return; }
        try { setText(await file.text()); setMessage('File loaded. Review it, then save.'); setError(false); }
        catch { setMessage('Unable to read this file. Choose a JSON configuration.'); setError(true); }
      }}/>
      <label htmlFor="game-json">Configuration JSON</label><textarea id="game-json" value={text} onChange={event => setText(event.target.value)} rows={7} spellCheck={false} placeholder="Paste the real deployment configuration" aria-describedby="game-config-note"/>
      <p className="small muted" id="game-config-note">Only public contract data belongs here. Never enter a private key or seed phrase.</p>
      <div className="button-row"><button className="button primary" onClick={save} disabled={!text.trim()}>Save configuration</button><button className="button secondary" disabled={!gameConfig} onClick={() => {
        try { localStorage.removeItem(GAME_STORAGE); setGameConfig(null); setText(''); setError(false); setMessage('Browser override removed. Reload to restore the site configuration.'); }
        catch { setError(true); setMessage('Browser storage is unavailable.'); }
      }}>Remove override</button></div>
      <div role="status">{message && <p className={error ? 'error-text' : 'success-text'}>{message}</p>}</div>
    </div>
  </Modal>;
}
