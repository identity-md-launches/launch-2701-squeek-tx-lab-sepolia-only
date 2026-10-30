# Connect the actual SqueekHamsterGuess deployment

No SqueekHamsterGuess address or ABI was supplied with this assignment. The official
Squeekchain deployment record lists SQK and SqueekCore, but not this game.
The production default is `null`. Nothing is sent to an invented game contract.

The game owner must provide its real Sepolia address, published JSON ABI and mappings
for the three actions and three reads below. Existing contracts need no changes.
The adapter does not assume function names, odd/even encoding, score layout or fees.
It supports calls with arbitrary constant arguments, the connected account and the
pending round. The ABI must unambiguously identify a function by name and argument count.

## Configure the entire site

Replace `public/game-config.json` with the configuration and rebuild (`npm run build`).
The resulting `dist/game-config.json` is loaded relative to the page at startup.
Only the site maintainer edits this published file. There is no public admin endpoint.

## Configure one browser

Open **Lab configuration**, upload or paste the JSON, and select **Save configuration**.
This is a browser-local override, not a change to other visitors' settings.
Use **Remove override**, then reload, to return to the published site configuration.
Contract data is public. Never put keys or seed phrases in configuration.

## Schema

This is a type description, not a deployable sample. Supply every required value from
the actual game's documentation. No fake address or guessed ABI is included.

```ts
type Binding = {
  functionName: string; // exact function name in the published ABI
  args: unknown[];      // arguments in ABI order; [] for none
  valueWei?: string;   // explicit decimal wei for payable actions; omitted means no ETH value
};
type Read = Binding & { path: string[] };
type Config = {
  chainId: 11155111;
  address: string;     // real, nonzero Sepolia contract address
  abi: Abi;            // published JSON ABI array, not an artifact wrapper
  actions: {
    playOdd: Binding;
    playEven: Binding;
    resolve: Binding;
  };
  reads: {
    pendingRound: Read & { emptyValue: string };
    score: Read;
    leaderboard: Binding & (
      { rowsPath: string[]; accountPath: string[]; scorePath: string[] }
      | { accountsPath: string[]; scoresPath: string[] }
    );
  };
};
```

Arguments may contain `$account` (connected address) and, for actions, `$pendingRound`
(the most recently read round). Use decimal strings for large integer constants to
avoid JSON number precision loss. Arrays and tuple objects are supported recursively.

An output path `[]` selects a scalar or the complete decoded output. A named tuple
field uses its name, such as `["round"]`; an unnamed tuple position uses its string
index, such as `["0"]`. These examples illustrate paths only, not this game's ABI.
`pendingRound.emptyValue` must be the exact string representation the real contract
returns when there is no pending round. It controls whether Play or Resolve is enabled.

The leaderboard mapping supports an array of structs/tuples or two parallel arrays
of addresses and scores. Configure the onchain call to return the global ranking in
descending score order. The first ten nonzero-address rows are shown, preserving the
contract's order. Constant pagination arguments can request the first ten directly.
This adapter does not scan events or fabricate rankings from browser-local players.

## Activation checks and limits

- Chain ID must be 11155111. Zero or invalid addresses are rejected.
- All six bindings must exist in the ABI with the correct mutability and arity.
- Reads verify that code exists, then decode pending round, score and leaderboard.
- Invalid output mappings show a recoverable error and disable game actions.
- A transaction review shows the target contract, function, and explicit native value.
- Every write is simulated, then the wallet's current account and chain are checked again.
- Play is disabled while a round is pending; Resolve requires a pending round.
  The contract simulation is authoritative for settlement timing and other rules.

Games requiring an indexer-only leaderboard, an offchain signature, an unprovided secret,
dynamic arguments other than account/round, or token staking not expressed in these
bindings need a dedicated adapter after their real interface is supplied. Do not guess
their behavior. Test the actual deployment before enabling it for visitors.
