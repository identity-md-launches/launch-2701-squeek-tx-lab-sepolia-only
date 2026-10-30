import { encodeFunctionData, isAddress, type Abi, type AbiFunction, type Address } from 'viem';
import { validAddress } from './format';
import { client, sepolia } from '../chain';

export type Binding = { functionName: string; args: unknown[]; valueWei?: string };
export type ReadBinding = Binding & { path: string[] };
export type GameConfig = {
  chainId: number;
  address: Address;
  abi: Abi;
  actions: Record<'playOdd' | 'playEven' | 'resolve', Binding>;
  reads: {
    pendingRound: ReadBinding & { emptyValue: string };
    score: ReadBinding;
    leaderboard: Binding & ({ rowsPath: string[]; accountPath: string[]; scorePath: string[] } | { accountsPath: string[]; scoresPath: string[] });
  };
};
export const GAME_STORAGE = 'squeek-lab:game-config:v1';
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isPath = (value: unknown): value is string[] => Array.isArray(value) && value.every(part => typeof part === 'string' && !['__proto__', 'prototype', 'constructor'].includes(part));

export function parseGameConfig(value: unknown): GameConfig {
  if (!isRecord(value) || value.chainId !== sepolia.id) throw new Error('Game configuration must specify chainId 11155111.');
  const address = validAddress(String(value.address ?? ''));
  if (!Array.isArray(value.abi) || !value.abi.length) throw new Error('Include the game’s published JSON ABI.');
  const functions = value.abi.filter((item): item is AbiFunction => isRecord(item) && item.type === 'function');
  if (!isRecord(value.actions) || !isRecord(value.reads)) throw new Error('Include actions and reads bindings. See the configuration guide.');
  function binding(raw: unknown, writable: boolean, label: string) {
    if (!isRecord(raw) || typeof raw.functionName !== 'string' || !Array.isArray(raw.args)) throw new Error(`${label} needs a functionName and args array.`);
    const matches = functions.filter(fn => fn.name === raw.functionName && fn.inputs.length === (raw.args as unknown[]).length);
    if (matches.length !== 1) throw new Error(`${label} must match exactly one ABI function by name and argument count.`);
    const fn = matches[0];
    const view = fn.stateMutability === 'view' || fn.stateMutability === 'pure';
    if (writable === view) throw new Error(`${label} has the wrong ABI mutability.`);
    if (raw.valueWei !== undefined && (typeof raw.valueWei !== 'string' || !/^\d+$/.test(raw.valueWei) || (BigInt(raw.valueWei) > 0n && fn.stateMutability !== 'payable'))) throw new Error(`${label} has an invalid native value.`);
    const inspect = (arg: unknown): void => {
      if (typeof arg === 'string' && arg.startsWith('$') && !['$account', '$pendingRound'].includes(arg)) throw new Error(`${label} contains an unknown argument variable.`);
      if (Array.isArray(arg)) arg.forEach(inspect);
      else if (isRecord(arg)) Object.values(arg).forEach(inspect);
    };
    raw.args.forEach(inspect);
  }
  for (const key of ['playOdd', 'playEven', 'resolve']) binding(value.actions[key], true, key);
  for (const key of ['pendingRound', 'score', 'leaderboard']) binding(value.reads[key], false, key);
  for (const key of ['pendingRound', 'score']) {
    if (!isRecord(value.reads[key]) || !isPath(value.reads[key].path)) throw new Error(`${key} needs an output path array; use [] for a scalar.`);
  }
  const pending = value.reads.pendingRound as Record<string, unknown>;
  if (typeof pending.emptyValue !== 'string') throw new Error('pendingRound.emptyValue must identify the contract’s no-pending-round value.');
  const board = value.reads.leaderboard as Record<string, unknown>;
  if (!(isPath(board.rowsPath) && isPath(board.accountPath) && isPath(board.scorePath)) && !(isPath(board.accountsPath) && isPath(board.scoresPath))) throw new Error('Map the leaderboard’s rows and fields, or its account and score arrays.');
  return { ...value, address } as GameConfig;
}

export function atPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const part of path) {
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, part)) throw new Error(`The game returned no field at ${path.join('.')}. Check its output mapping.`);
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
export function bindArgs(binding: Binding, account: Address, pendingRound?: string): readonly unknown[] {
  const replace = (value: unknown): unknown => {
    if (value === '$account') return account;
    if (value === '$pendingRound') {
      if (pendingRound === undefined) throw new Error('Read the pending round before resolving.');
      return pendingRound;
    }
    if (Array.isArray(value)) return value.map(replace);
    if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, replace(val)]));
    return value;
  };
  return binding.args.map(replace);
}
export type GameState = { pendingRound: string; hasPending: boolean; score: string; leaderboard: { address: Address; score: string }[] };

export async function readGame(config: GameConfig, account: Address, blockNumber: bigint): Promise<GameState> {
  if (!(await client.getCode({ address: config.address, blockNumber }))) throw new Error('No game contract exists at this Sepolia address. Check the configuration.');
  const read = (binding: Binding) => client.readContract({ address: config.address, abi: config.abi, functionName: binding.functionName, args: bindArgs(binding, account), blockNumber });
  const [pendingRaw, scoreRaw, boardRaw] = await Promise.all([read(config.reads.pendingRound), read(config.reads.score), read(config.reads.leaderboard)]);
  const scalar = (value: unknown) => {
    if (!['bigint', 'number', 'string', 'boolean'].includes(typeof value)) throw new Error('A game result is not scalar. Check the output path.');
    return String(value);
  };
  const pendingRound = scalar(atPath(pendingRaw, config.reads.pendingRound.path));
  const score = scalar(atPath(scoreRaw, config.reads.score.path));
  const board = config.reads.leaderboard;
  let rows: { address: unknown; score: unknown }[];
  if ('rowsPath' in board) {
    const raw = atPath(boardRaw, board.rowsPath);
    if (!Array.isArray(raw)) throw new Error('Leaderboard rows are not an array. Check the mapping.');
    rows = raw.map(row => ({ address: atPath(row, board.accountPath), score: atPath(row, board.scorePath) }));
  } else {
    const addresses = atPath(boardRaw, board.accountsPath);
    const scores = atPath(boardRaw, board.scoresPath);
    if (!Array.isArray(addresses) || !Array.isArray(scores) || addresses.length !== scores.length) throw new Error('Leaderboard arrays do not match. Check the mapping.');
    rows = addresses.map((address, index) => ({ address, score: scores[index] }));
  }
  const leaderboard = rows.filter(row => row.address !== '0x0000000000000000000000000000000000000000').slice(0, 10).map(row => {
    if (typeof row.address !== 'string' || !isAddress(row.address)) throw new Error('The game returned an invalid leaderboard address.');
    return { address: row.address as Address, score: scalar(row.score) };
  });
  return { pendingRound, hasPending: pendingRound !== config.reads.pendingRound.emptyValue, score, leaderboard };
}

export function gameCall(config: GameConfig, action: keyof GameConfig['actions'], account: Address, pendingRound?: string) {
  const binding = config.actions[action];
  const args = bindArgs(binding, account, pendingRound);
  // Encoding here catches incompatible bindings before a wallet request.
  encodeFunctionData({ abi: config.abi, functionName: binding.functionName, args });
  return { address: config.address, abi: config.abi, functionName: binding.functionName, args, value: BigInt(binding.valueWei ?? '0') };
}
