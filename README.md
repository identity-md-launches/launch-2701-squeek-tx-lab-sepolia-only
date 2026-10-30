# Squeek Tx Lab

A single-page, Sepolia-only transaction workbench for Squeekchain. Built with React,
TypeScript, Vite, wagmi, viem and TanStack Query. The finished static website is in
[`dist/`](dist/index.html); it is included with source and `package-lock.json`.

## Run and rebuild

Use Node.js 22.12 or newer and npm:

```sh
npm ci
npm run typecheck
npm run build
npm run preview
```

Preview serves the production export on port 4173. `npm run dev` starts Vite's development
server. Serve `dist/` over HTTP(S); opening `index.html` as a filesystem URL is not supported.
No backend, environment file, API key, WalletConnect project ID or private credential is
needed. Vite's `base` is `./`; scripts, fonts, images and configuration use relative URLs.
Hash navigation works at a gateway subpath without server rewrites.

When changing the launchpad contract, regenerate its bundled artifact before rebuilding:

```sh
npm run contracts
npm run build
```

`contracts/LabToken.sol` uses OpenZeppelin ERC20 5.6.1. The pinned solc 0.8.38 compiler,
optimizer (200 runs), and Paris EVM target produce `src/generated/LabToken.json`.
The constructor accepts name, symbol and supply in base units; it mints the entire supply
to `msg.sender`. It has 18 decimals, no owner, no additional minting and no fees.
The deployment form uses exact bigint amounts and displays a review before asking the
wallet to deploy. Gas is estimated before deployment.

## What works

| Tool | Behavior |
| --- | --- |
| Wallet | Named browser wallets through EIP-6963; Sepolia switching and chain-add fallback; address, ETH/SQK balances, and live SqueekCore state. |
| Ping SQK | Calls `approve(connectedAccount, 0)` on SQK. No tokens move; test ETH pays gas. |
| Transfer SQK | Validates recipient and decimal precision, rejects amounts above balance, shows a full review, and reads the balance again before sending. |
| Approve / Revoke | Reads allowance; sets an explicit approval or revokes to zero. A nonzero allowance must be revoked before another nonzero approval. |
| SqueekHamsterGuess | Configurable real-contract adapter for Odd, Even, Resolve, pending round, score and top ten. **Disabled until the real game deployment is configured.** |
| Token launchpad | Deploys the included fixed-supply ERC20 from the connected wallet; displays the receipt's deployed address and reads the deployer's token balance. |
| Transaction log | Tracks every page-submitted hash, pending/confirmed/reverted/replaced states, Sepolia Etherscan links, JSON export, and browser-local persistence. |

All sends independently check the connected account and network, simulate contract
calls, and check the wallet again immediately before signing. The only configured chain
is Sepolia (`11155111`). No mainnet transaction route or key-entry form exists.
Receipt status uses one confirmation, not finalized-chain guarantees. A stalled receipt
retains its hash and offers another status check. Wallet replacement links are retained.

The wallet sheet includes MetaMask, Coinbase Wallet, Rabby and Phantom in-app browser
links on phones without an injected wallet, plus Coinbase Smart Wallet. Coinbase's SDK
opens its own authentication UI. Mobile links preserve the current page URL; installed
wallet apps and a public HTTPS URL are needed for real-device use.

## Contract provenance

Addresses and the SqueekCore state tuple were read from the official documentation on
2026-10-30:

| Contract | Sepolia address | Source |
| --- | --- | --- |
| SQK | `0x6872bfa5ccc3e9e440c6c16e5ffdabb8dba4cc76` | [SqueekToken reference](https://docs.squeekchain.com/developers/token/) |
| SqueekCore proxy | `0x74665dAecA35A2303e767E76a2FF1FB6F93e119f` | [SqueekCore reference](https://docs.squeekchain.com/developers/core/) |

The [deployment record](https://docs.squeekchain.com/developers/#deployments) identifies
these contracts. `src/chain.ts` pins them and uses the published core `state()` tuple;
SQK uses viem's standard ERC20 ABI. PublicNode is the primary RPC, with dRPC as fallback.
Each snapshot reads one fresh block; reads refresh every 15 seconds and after receipts.
The app marks RPC failures unavailable and retains the last known timestamp. It does
not independently attest the entire upgradeable Squeekchain contract graph.

## After launch: configure the game

The brief and official deployment documentation did not supply SqueekHamsterGuess's
address or ABI. The previous attempt stopped for these values. This implementation
chooses the brief's owner-settable configuration option: `public/game-config.json` is
explicitly `null`, with no guessed address, ABI, game rules, fee or leaderboard data.
The rest of the app remains usable.

The site maintainer supplies the real Sepolia address, JSON ABI and action/read mappings
in `public/game-config.json`, then rebuilds. A visitor can also load a configuration in
**Lab configuration** as a local override; it affects only that browser. Invalid chain IDs,
unmatched ABI functions, invalid mappings and missing contract code prevent activation.

See [`public/game-configuration.md`](public/game-configuration.md) for the exact schema,
output mappings and adapter limits. It is also bundled into the website. No sample
deployment is silently substituted. Games needing offchain signatures, event-indexed
rankings or additional dynamic inputs need an adapter based on their real interface.
The actual intended game remains unverified until its owner supplies it.

The social image is bundled at `dist/social.png`. The final hosting URL is assigned
outside this task; `og:image` remains relative. A publisher can use an absolute image
URL if its sharing platform requires one. No hosting or blockchain deployment was
performed by the worker.

## Validation performed

Run the included interaction harness after building:

```sh
npx playwright install chromium webkit
npm run validate
```

The harness starts and closes its own subpath HTTP server and ephemeral local EVM.
It generates accounts in memory, intercepts only the test browser's Sepolia RPC requests,
and deploys clearly named local fixtures. No test account, fixture ABI, fake score or
mock RPC is shipped in the production export. Nothing is sent to a public chain.
Output is written to `test/scratch/validation/` by default; this directory is disposable.

Actual final results:

- Production build and TypeScript `--noEmit`: **passed**. A second build/typecheck with
  normal dependency resolution in a temporary clean copy also passed.
- Chromium production interaction harness: **20 checks passed**. Includes exact ping
  calldata, bigint transfers, validation errors, approve/revoke, real local ERC20
  deployment, configurable game writes and top ten, wrong-chain/add-chain flow, account
  changes, rejection, pending/reverted receipt states, persistence, export and RPC retry.
- Automated axe accessibility scan on the connected UI: **0 violations** for the selected
  WCAG A/AA rules. This is not a claim of complete accessibility compliance.
- Pinned `taste@1`: **16/16 checks passed**, at 320, 390 and 1440px with reduced motion.
  Additional rendered reflow checks passed at 768 and 1000px.
- Browser-tool inspection: actual Sepolia core reads loaded; local resources returned
  successfully; no console warnings/errors in the final inspected state; keyboard focus
  and mobile/desktop layouts inspected. Coinbase's real SDK opened its wallet popup.
- **Not verified:** WebKit could not launch because required host libraries are absent;
  physical mobile wallets, passkey authorization, public-network signatures, the missing
  real game, assistive-technology sessions and browser-native 200% zoom.

Build warnings are nonfatal third-party `use client` directives, an unused dependency
branch referencing `node:worker_threads`, and a main JS chunk above Vite's 650 KB warning
threshold. Ganache used its JavaScript fallback because its optional native binary does
not support the available Node ABI. These warnings did not prevent the recorded checks.

The full six-domain design review, repaired findings and evidence are in
[`artifacts/validation.md`](artifacts/validation.md). The implemented design system is
documented in [`DESIGN.md`](DESIGN.md). Verification is the worker's report, not an
independent certification.

## Restricted-workspace dependency mode

To keep all dependency directories outside a restricted repository, the build scripts
also support an external installation:

```sh
mkdir -p /tmp/squeek-deps
cp package.json package-lock.json /tmp/squeek-deps/
npm ci --prefix /tmp/squeek-deps --cache /tmp/squeek-npm-cache
SQUEEK_DEPENDENCIES=/tmp/squeek-deps npm run build
SQUEEK_DEPENDENCIES=/tmp/squeek-deps npm run typecheck
PLAYWRIGHT_BROWSERS_PATH=/tmp/squeek-browsers /tmp/squeek-deps/node_modules/.bin/playwright install chromium webkit
PLAYWRIGHT_BROWSERS_PATH=/tmp/squeek-browsers SQUEEK_DEPENDENCIES=/tmp/squeek-deps npm run validate
```

That mode was used for this assignment. No ignore file was changed. No dependency
directory, cache, registry mirror, tarball or submodule is part of the deliverable.
Source, the lockfile, local runtime assets, contract bytecode and the complete `dist/`
remain included. Bundle measurements are in `artifacts/bundle-budget.json`.

## Credits

Original UI, hamster mark and social artwork; locally bundled DM Sans and IBM Plex Mono
under the SIL Open Font License (`src/assets/*LICENSE.txt`). Mobile wallet marks come
from [RainbowKit](https://github.com/rainbow-me/rainbowkit) under its included MIT license
in `public/wallets/LICENSE.txt`. The Rabby link follows its
[mobile universal-link handler](https://github.com/RabbyHub/rabby-mobile/blob/develop/apps/mobile/src/hooks/universalLink.ts).
The Coinbase connector follows [wagmi's SDK integration](https://wagmi.sh/react/api/connectors/coinbaseWallet).

Design guidance was adapted from Jakub Krehel's Better Interface, commit
`267330e1adfc66a718fb65fa6918c1f06d0a689e` (MIT), and documentation guidance from Paul
Bakaus's Impeccable, commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8` (Apache-2.0).
Their combined supplied license is retained in `artifacts/Better-Interface-LICENSE.txt`.
