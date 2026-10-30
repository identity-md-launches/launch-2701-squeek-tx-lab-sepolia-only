import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { requireDependency } from './dependencies.mjs';

// This harness owns an ephemeral local EVM and never submits to a public network.
// Accounts are generated in memory by Ganache; no private keys are read or written.
const { chromium, webkit } = requireDependency('playwright');
const { default: AxeBuilder } = await import(new URL(requireDependency.resolve('@axe-core/playwright'), 'file:').href);
const ganache = requireDependency('ganache');
const solc = requireDependency('solc');
const viem = requireDependency('viem');
const { sepolia } = requireDependency('viem/chains');
const outputDir = resolve(process.env.SQUEEK_VALIDATION_OUT ?? 'test/scratch/validation');
await mkdir(outputDir, { recursive: true });
const results = [];
const pass = (name, detail = '') => { results.push({ name, passed: true, detail }); console.log(`PASS ${name}${detail ? `: ${detail}` : ''}`); };
const local = ganache.provider({ chain: { chainId: sepolia.id, hardfork: 'shanghai' }, logging: { quiet: true }, wallet: { totalAccounts: 12, defaultBalance: 1000 } });
const accounts = await local.request({ method: 'eth_accounts', params: [] });
const [account, recipient, spender] = accounts;
const publicClient = viem.createPublicClient({ chain: sepolia, transport: viem.custom(local), pollingInterval: 50 });
const wallet = viem.createWalletClient({ chain: sepolia, transport: viem.custom(local), account });
const SQK = '0x6872bfa5ccc3e9e440c6c16e5ffdabb8dba4cc76';
const CORE = '0x74665dAecA35A2303e767E76a2FF1FB6F93e119f';
const compile = JSON.parse(solc.compile(JSON.stringify({
  language: 'Solidity', sources: { 'Fixtures.sol': { content: readFileSync('scripts/validation-fixtures.sol', 'utf8') } },
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'paris', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } } },
}), { import: path => ({ contents: readFileSync(requireDependency.resolve(path), 'utf8') }) }));
if (compile.errors?.some(error => error.severity === 'error')) throw new Error(JSON.stringify(compile.errors));
const fixtures = compile.contracts['Fixtures.sol'];
await local.request({ method: 'evm_setAccountCode', params: [SQK, `0x${fixtures.ValidationSQK.evm.deployedBytecode.object}`] });
await local.request({ method: 'evm_setAccountCode', params: [CORE, `0x${fixtures.ValidationCore.evm.deployedBytecode.object}`] });
await wallet.writeContract({ address: SQK, abi: fixtures.ValidationSQK.abi, functionName: 'mintForValidation', args: [account, viem.parseEther('1000')] });
const gameHash = await wallet.deployContract({ abi: fixtures.ValidationGame.abi, bytecode: `0x${fixtures.ValidationGame.evm.bytecode.object}`, gas: 5_000_000n });
const gameReceipt = await publicClient.waitForTransactionReceipt({ hash: gameHash });
assert.equal(gameReceipt.status, 'success', 'Local game fixture must deploy successfully');
const gameConfig = {
  chainId: sepolia.id, address: gameReceipt.contractAddress, abi: fixtures.ValidationGame.abi,
  actions: { playOdd: { functionName: 'choose', args: [true] }, playEven: { functionName: 'choose', args: [false] }, resolve: { functionName: 'finish', args: ['$pendingRound'] } },
  reads: { pendingRound: { functionName: 'turns', args: ['$account'], path: ['0'], emptyValue: '0' }, score: { functionName: 'points', args: ['$account'], path: [] }, leaderboard: { functionName: 'ranking', args: [], accountsPath: ['0'], scoresPath: ['1'] } },
};
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.md': 'text/plain' };
const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (!pathname.startsWith('/preview/')) { response.writeHead(404).end(); return; }
  const path = resolve('dist', pathname.slice('/preview/'.length) || 'index.html');
  if (!path.startsWith(resolve('dist') + '/')) { response.writeHead(403).end(); return; }
  try { response.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream' }); response.end(await readFile(path)); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/preview/`;
let browser;
let sent = [];
let holdReceipts = false;
let forceRpcFailure = false;
let fakeRevert = false;
const localRpc = async body => {
  try {
    if (holdReceipts && body.method === 'eth_getTransactionReceipt') return { id: body.id, jsonrpc: '2.0', result: null };
    let result = await local.request({ method: body.method, params: body.params ?? [] });
    if (fakeRevert && body.method === 'eth_getTransactionReceipt' && result) result = { ...result, status: '0x0' };
    return { id: body.id, jsonrpc: '2.0', result };
  } catch (error) { return { id: body.id, jsonrpc: '2.0', error: { code: error.code ?? -32000, message: error.message, data: error.data } }; }
};
async function intercept(context) {
  await context.route(/https:\/\/(ethereum-sepolia-rpc\.publicnode\.com|sepolia\.drpc\.org)\/?/, async route => {
    if (forceRpcFailure) { await route.abort('failed'); return; }
    const body = route.request().postDataJSON();
    const result = Array.isArray(body) ? await Promise.all(body.map(localRpc)) : await localRpc(body);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
  });
}
async function injectWallet(context) {
  await context.exposeBinding('localWalletRequest', async (_source, args) => {
    if (args.method === 'eth_sendTransaction') {
      assert.equal(Number(args.params[0].chainId ?? sepolia.id), sepolia.id);
      sent.push(args.params[0]);
      // Browser wallets estimate gas. Ganache's raw RPC otherwise defaults to 90,000.
      if (!args.params[0].gas) {
        const estimate = await local.request({ method: 'eth_estimateGas', params: args.params });
        args.params[0].gas = viem.toHex(BigInt(estimate) * 120n / 100n);
      }
    }
    return local.request(args);
  });
  await context.addInitScript(({ accounts }) => {
    const listeners = new Map();
    let chain = '0xaa36a7';
    let current = accounts[0];
    let authorized = localStorage.getItem('validation-wallet-authorized') === 'yes';
    let reject = false;
    let pendingReject;
    let unknownChain = false;
    const provider = {
      isMetaMask: false,
      request: async args => {
        if (args.method === 'eth_chainId') return chain;
        if (args.method === 'eth_accounts') return authorized ? [current] : [];
        if (args.method === 'eth_requestAccounts') { authorized = true; localStorage.setItem('validation-wallet-authorized', 'yes'); return [current]; }
        if (args.method === 'wallet_requestPermissions') { authorized = true; localStorage.setItem('validation-wallet-authorized', 'yes'); return [{ parentCapability: 'eth_accounts', caveats: [{ type: 'restrictReturnedAccounts', value: [current] }] }]; }
        if (args.method === 'wallet_getPermissions') return [{ parentCapability: 'eth_accounts' }];
        if (args.method === 'wallet_switchEthereumChain') {
          if (unknownChain) throw Object.assign(new Error('Unknown chain'), { code: 4902 });
          chain = args.params[0].chainId; provider.emit('chainChanged', chain); return null;
        }
        if (args.method === 'wallet_addEthereumChain') {
          window.__addedChain = args.params[0]; unknownChain = false; chain = args.params[0].chainId; provider.emit('chainChanged', chain); return null;
        }
        if (args.method === 'eth_sendTransaction' && reject) {
          reject = false;
          if (pendingReject) { await pendingReject; pendingReject = undefined; }
          throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
        }
        if (args.method === 'wallet_getCapabilities') return {};
        return window.localWalletRequest(args);
      },
      on: (event, fn) => { const set = listeners.get(event) ?? new Set(); set.add(fn); listeners.set(event, set); },
      removeListener: (event, fn) => listeners.get(event)?.delete(fn),
      emit: (event, data) => listeners.get(event)?.forEach(fn => fn(data)),
    };
    window.__testWallet = {
      switchChain: (next, unknown = false) => { chain = next; unknownChain = unknown; provider.emit('chainChanged', next); },
      setAccount: next => { current = next; provider.emit('accountsChanged', [next]); },
      rejectNext: () => { reject = true; },
      deferRejection: () => { reject = true; pendingReject = new Promise(resolve => { window.__releaseRejection = resolve; }); },
    };
    const info = { uuid: crypto.randomUUID(), name: 'Validation wallet', icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="purple"/></svg>', rdns: 'local.validation.wallet' };
    const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info, provider } }));
    window.addEventListener('eip6963:requestProvider', announce);
    window.ethereum = provider;
    announce();
  }, { accounts });
}
async function screenshot(page, name, fullPage = false) {
  await page.screenshot({ path: resolve(outputDir, `${name}.png`), fullPage });
}
async function waitText(locator, value, timeout = 15000) {
  await locator.getByText(value, { exact: false }).first().waitFor({ timeout });
}
async function confirmation(page, count) {
  await page.waitForFunction(count => document.querySelectorAll('#activity .tx-status.confirmed').length >= count, count, { timeout: 25000 });
}
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await intercept(context);
  await injectWallet(context);
  const page = await context.newPage();
  const errors = [], missing = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.url().startsWith(url) && response.status() >= 400) missing.push(response.url()); });
  await page.goto(url);
  await waitText(page.locator('.core-stats'), '41');
  assert.equal(await page.getByRole('button', { name: 'Ping SQK', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Play Odd', exact: true }).isDisabled(), true);
  pass('Production export at /preview/; real assets, disconnected controls and core reads');
  for (const width of [320, 390, 768, 1000, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}px overflow`);
    await screenshot(page, `disconnected-${width}`, width === 1440);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok((await page.getByRole('button', { name: 'Connect wallet', exact: true }).boundingBox()).y < 844);
  const pingBox = await page.getByRole('button', { name: 'Ping SQK', exact: true }).boundingBox();
  assert.ok(pingBox.y + pingBox.height < 844);
  await page.locator('.mobile-nav').getByRole('link', { name: 'Log', exact: true }).click();
  await page.locator('#activity').waitFor();
  await page.evaluate(() => document.querySelector('.mobile-nav a[href="#wallet"]').click());
  assert.ok(await page.locator('#wallet').evaluate(el => el.getBoundingClientRect().top >= 0 && el.getBoundingClientRect().top < 100));
  await page.evaluate(() => window.scrollTo(0, 0));
  pass('320/390/768/1000/1440 reflow; product, Connect and Ping on first 390px screen');
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Browser wallet', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Validation wallet', exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Coinbase Wallet', exact: true }).count(), 1);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => !!document.activeElement.closest('dialog')), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button', { name: 'Connect wallet', exact: true }).evaluate(el => el === document.activeElement), true);
  pass('EIP-6963 discovery, generic row hidden, Coinbase row, focus containment and return');
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await page.getByRole('button', { name: 'Validation wallet', exact: true }).click();
  await waitText(page.locator('.balances'), '1000');
  await screenshot(page, 'connected-390');
  pass('Browser wallet connection and live ETH/SQK balances');
  await page.evaluate(() => window.__testWallet.switchChain('0x1', true));
  await page.getByRole('button', { name: 'Switch to Sepolia', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Ping SQK', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Review transfer', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'Switch to Sepolia', exact: true }).click();
  await page.waitForFunction(() => !!window.__addedChain);
  assert.equal((await page.evaluate(() => window.__addedChain)).chainId, '0xaa36a7');
  await page.waitForFunction(() => !document.querySelector('#ping button').disabled);
  pass('Wrong-chain write gates, switchEthereumChain and addEthereumChain fallback');
  holdReceipts = true;
  await page.getByRole('button', { name: 'Ping SQK', exact: true }).click();
  await waitText(page.locator('#ping'), 'Submitted.');
  assert.equal(sent.length, 1);
  const ping = viem.decodeFunctionData({ abi: viem.erc20Abi, data: sent[0].data });
  assert.equal(ping.functionName, 'approve');
  assert.equal(ping.args[0].toLowerCase(), account.toLowerCase()); assert.equal(ping.args[1], 0n);
  assert.equal(sent[0].to.toLowerCase(), SQK);
  assert.equal(await page.locator('#activity .tx-status.pending').count(), 1);
  holdReceipts = false;
  await local.request({ method: 'evm_mine', params: [] });
  await confirmation(page, 1);
  assert.equal(await publicClient.readContract({ address: SQK, abi: viem.erc20Abi, functionName: 'balanceOf', args: [account] }), viem.parseEther('1000'));
  pass('Ping exact calldata, zero token movement, pending → receipt and Etherscan link');
  await page.locator('#recipient').fill('invalid');
  await page.locator('#transfer-amount').fill('1001');
  await page.getByRole('button', { name: 'Review transfer', exact: true }).click();
  await waitText(page.locator('.two-column'), 'exceeds your SQK balance');
  assert.equal(await page.locator('#recipient').getAttribute('aria-invalid'), 'true');
  assert.equal(sent.length, 1);
  await page.locator('#recipient').fill(recipient);
  await page.locator('#transfer-amount').fill('0.0000000000000000001');
  await page.getByRole('button', { name: 'Review transfer', exact: true }).click();
  await waitText(page.locator('.two-column'), 'no more than 18');
  await page.locator('#transfer-amount').fill('1.250000000000000001');
  await page.getByRole('button', { name: 'Review transfer', exact: true }).click();
  await page.getByRole('dialog', { name: 'Review SQK transfer' }).waitFor();
  await waitText(page.getByRole('dialog', { name: 'Review SQK transfer' }), viem.getAddress(recipient));
  await screenshot(page, 'transfer-review-390');
  await page.getByRole('button', { name: 'Send SQK', exact: true }).click();
  await confirmation(page, 2);
  assert.equal(await publicClient.readContract({ address: SQK, abi: viem.erc20Abi, functionName: 'balanceOf', args: [recipient] }), viem.parseEther('1.250000000000000001'));
  pass('Transfer rejects invalid address, excess balance and precision; exact bigint transfer confirmed');
  await page.locator('#spender').fill(spender);
  await page.locator('#approval-amount').fill('12.5');
  await page.waitForFunction(() => [...document.querySelectorAll('.form-summary')].some(el => el.textContent.includes('Current allowance0 SQK')));
  await page.getByRole('button', { name: 'Approve SQK', exact: true }).click();
  await page.getByRole('button', { name: 'Approve allowance', exact: true }).click();
  await confirmation(page, 3);
  assert.equal(await publicClient.readContract({ address: SQK, abi: viem.erc20Abi, functionName: 'allowance', args: [account, spender] }), viem.parseEther('12.5'));
  await page.getByRole('button', { name: 'Approve SQK', exact: true }).click();
  await waitText(page.locator('.two-column'), 'Revoke the existing allowance');
  await page.locator('#approval-amount').fill('not a number');
  await page.getByRole('button', { name: 'Revoke to zero', exact: true }).click();
  await page.getByRole('button', { name: 'Revoke allowance', exact: true }).click();
  await confirmation(page, 4);
  assert.equal(await publicClient.readContract({ address: SQK, abi: viem.erc20Abi, functionName: 'allowance', args: [account, spender] }), 0n);
  pass('Approve exact allowance, nonzero reset rule, revoke ignores amount and sets zero');
  await page.evaluate(() => window.__testWallet.rejectNext());
  await page.getByRole('button', { name: 'Ping SQK', exact: true }).click();
  await waitText(page.locator('#ping'), 'Request declined');
  assert.equal(sent.length, 4);
  assert.equal(await page.getByRole('button', { name: 'Ping SQK', exact: true }).isEnabled(), true);
  pass('Wallet rejection is recoverable and does not fabricate a transaction');
  await page.locator('#token-name').fill('Validation Token');
  await page.locator('#token-symbol').fill('LAB');
  await page.locator('#token-supply').fill('12345.25');
  await page.getByRole('button', { name: 'Review token deployment', exact: true }).click();
  await page.getByRole('button', { name: 'Deploy token', exact: true }).click();
  await confirmation(page, 5);
  await waitText(page.locator('#launchpad'), '12345.25 LAB');
  const deployedAddress = await page.locator('.deployed-result .address-text').innerText();
  const tokenAddress = deployedAddress.match(/0x[0-9a-fA-F]{40}/)[0];
  assert.equal(await publicClient.readContract({ address: tokenAddress, abi: viem.erc20Abi, functionName: 'totalSupply' }), viem.parseEther('12345.25'));
  const artifact = JSON.parse(await readFile('src/generated/LabToken.json', 'utf8'));
  assert.equal(artifact.abi.some(item => item.name === 'mint' || item.name === 'owner'), false);
  pass('Actual LabToken bytecode deployed locally; totalSupply, deployer balance and no mint/owner verified');
  await page.getByRole('button', { name: 'Configure game', exact: true }).click();
  await page.locator('#game-json').fill(JSON.stringify({ ...gameConfig, chainId: 1 }));
  await page.getByRole('button', { name: 'Save configuration', exact: true }).click();
  await waitText(page.getByRole('dialog', { name: 'Lab configuration' }), 'chainId 11155111');
  await page.locator('#game-json').fill(JSON.stringify(gameConfig));
  await page.getByRole('button', { name: 'Save configuration', exact: true }).click();
  await waitText(page.getByRole('dialog', { name: 'Lab configuration' }), 'saved for this browser');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.waitForFunction(() => ![...document.querySelectorAll('#game button')].find(b => b.textContent === 'Play Odd').disabled);
  await page.getByRole('button', { name: 'Play Odd', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm Odd', exact: true }).click();
  await confirmation(page, 6);
  await page.waitForFunction(() => ![...document.querySelectorAll('#game button')].find(b => b.textContent.startsWith('Resolve pending')).disabled);
  assert.equal(await page.getByRole('button', { name: 'Play Even', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'Resolve pending round', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm resolve', exact: true }).click();
  await confirmation(page, 7);
  await page.waitForFunction(() => document.querySelectorAll('.leaderboard-list li').length === 1);
  assert.equal(await publicClient.readContract({ address: gameConfig.address, abi: gameConfig.abi, functionName: 'points', args: [account] }), 1n);
  await page.getByRole('button', { name: 'Play Even', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm Even', exact: true }).click();
  await confirmation(page, 8);
  const turn = await publicClient.readContract({ address: gameConfig.address, abi: gameConfig.abi, functionName: 'turns', args: [account] });
  assert.equal(turn[1], false);
  pass('Configured game adapter: wrong-chain config rejected; Odd, Even, pending round, Resolve, score and ranking');
  for (const player of accounts.slice(1)) {
    await wallet.writeContract({ account: player, address: gameConfig.address, abi: gameConfig.abi, functionName: 'choose', args: [true], gas: 200_000n });
    const turn = await publicClient.readContract({ address: gameConfig.address, abi: gameConfig.abi, functionName: 'turns', args: [player] });
    await wallet.writeContract({ account: player, address: gameConfig.address, abi: gameConfig.abi, functionName: 'finish', args: [turn[0]], gas: 200_000n });
  }
  await page.getByRole('button', { name: 'Refresh balances and chain state', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.leaderboard-list li').length === 10);
  pass('Top-ten cap reads actual local fixture contract data from twelve generated players');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export log', exact: true }).click();
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(exported.chainId, sepolia.id); assert.equal(exported.transactions.length, 8);
  await page.locator('.log-filter select').selectOption('pending');
  await waitText(page.locator('#activity'), 'No matching transactions');
  await page.locator('.log-filter select').selectOption('all');
  assert.equal(await page.locator('#activity .transaction-list > li').count(), 8);
  assert.equal(await page.locator('#activity a[href^="https://sepolia.etherscan.io/tx/"]').count(), 8);
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('#activity .tx-status.confirmed').length === 8);
  await page.waitForFunction(() => document.querySelector('.status-label.connected')?.textContent.includes('Connected'));
  pass('Persistent full-hash log, status filter, export control and wallet reconnect after reload');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await screenshot(page, 'connected-1440', true);
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  await writeFile(resolve(outputDir, 'axe.json'), JSON.stringify(scan.violations, null, 2));
  assert.equal(scan.violations.length, 0, JSON.stringify(scan.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))));
  pass('axe WCAG A/AA automated scan on connected production UI', '0 violations');
  assert.deepEqual(errors, []); assert.deepEqual(missing, []);
  pass('No browser JavaScript exceptions or missing local production assets');
  await page.locator('#recipient').fill(recipient);
  await page.locator('#transfer-amount').fill('1');
  await page.getByRole('button', { name: 'Review transfer', exact: true }).click();
  await page.getByRole('dialog', { name: 'Review SQK transfer' }).waitFor();
  await page.evaluate(next => window.__testWallet.setAccount(next), accounts[3]);
  await page.getByRole('dialog', { name: 'Review SQK transfer' }).waitFor({ state: 'hidden' });
  assert.equal(sent.length, 8);
  await page.evaluate(next => window.__testWallet.setAccount(next), account);
  await page.waitForFunction(() => document.querySelector('.wallet-address')?.textContent.toLowerCase().includes(document.querySelector('.wallet-control span').textContent.slice(0, 6).toLowerCase()));
  pass('Account changes invalidate an open transfer review without sending');
  await page.evaluate(() => window.__testWallet.deferRejection());
  await page.getByRole('button', { name: 'Ping SQK', exact: true }).click();
  await page.getByRole('button', { name: 'Preparing ping…', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Review transfer', exact: true }).isDisabled(), true);
  await page.evaluate(() => window.__releaseRejection());
  await waitText(page.locator('#ping'), 'Request declined');
  assert.equal(sent.length, 8);
  pass('Only one wallet request can be pending; controls recover after a deferred rejection');
  fakeRevert = true;
  await page.getByRole('button', { name: 'Ping SQK', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('#activity .tx-status.reverted').length === 1);
  await waitText(page.locator('#ping'), 'Transaction reverted');
  fakeRevert = false;
  pass('Explicitly mocked reverted receipt displays failure, preserves hash and avoids success');
  forceRpcFailure = true;
  await page.getByRole('button', { name: 'Refresh balances and chain state', exact: true }).click();
  await waitText(page.locator('.core-panel'), 'Unavailable');
  await screenshot(page, 'rpc-failure');
  forceRpcFailure = false;
  await page.locator('.core-panel').getByRole('button', { name: 'Retry', exact: true }).click();
  await waitText(page.locator('.core-panel'), 'Live reads');
  pass('RPC failure is visibly unavailable and Retry restores live reads');
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1', hasTouch: true });
  await intercept(mobile);
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(url);
  await mobilePage.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  for (const name of ['MetaMask', 'Coinbase Wallet', 'Rabby', 'Phantom']) assert.equal(await mobilePage.getByRole('link', { name: `Open in ${name}`, exact: true }).count(), 1);
  assert.equal(await mobilePage.getByRole('button', { name: 'Coinbase Smart Wallet', exact: true }).count(), 1);
  assert.equal(await mobilePage.getByRole('button', { name: 'Browser wallet', exact: true }).count(), 0);
  await screenshot(mobilePage, 'mobile-wallet-sheet');
  await mobile.close();
  pass('Phone wallet sheet: four in-app links plus Coinbase Smart Wallet');
  await context.close();
  try {
    const safari = await webkit.launch({ headless: true });
    try {
      const safariContext = await safari.newContext({ viewport: { width: 390, height: 844 } });
      await intercept(safariContext); const page = await safariContext.newPage(); await page.goto(url);
      await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
      await page.getByRole('dialog', { name: 'Connect a wallet' }).waitFor(); await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await screenshot(page, 'webkit-390'); pass('WebKit wallet opening, dismissal and mobile reflow');
    } finally { await safari.close(); }
  } catch (error) { results.push({ name: 'WebKit', passed: null, detail: String(error.message).split('\n').slice(0, 5).join(' ') }); console.log('LIMITATION WebKit cannot launch with the available host libraries.'); }
} catch (error) {
  results.push({ name: 'Validation run', passed: false, detail: error.stack });
  console.error(error);
  if (browser) { for (const context of browser.contexts()) for (const page of context.pages()) { await screenshot(page, 'failure', true).catch(() => {}); await writeFile(resolve(outputDir, 'failure.html'), await page.content()).catch(() => {}); } }
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await local.disconnect();
  await new Promise(resolve => server.close(resolve));
  await writeFile(resolve(outputDir, 'results.json'), JSON.stringify(results, null, 2));
}
