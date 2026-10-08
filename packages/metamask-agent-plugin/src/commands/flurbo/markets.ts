import { readFileSync } from 'node:fs';
import { type CommandIO, PluginCommand } from '@metamask/agent-wallet/plugin';

type Snapshot = { network: { name: string; chainId: number }; markets: { label: string; pool: string; closesAt: number; settlement: string; questions: { index: number; scope: number; question: string }[] }[] };

export default class FlurboMarketsCommand extends PluginCommand<{ network: string; markets: unknown[] }> {
  static requiresAuth = false;
  static requiresInit = false;
  static description = 'List Flurbo pools on Monad testnet with their questions, claim scopes and close times';
  protected readonly pluginCommandId = 'flurbo:markets';

  async execute(_io: CommandIO) {
    const snapshot = JSON.parse(readFileSync(new URL('../../markets-snapshot.json', import.meta.url), 'utf8')) as Snapshot;
    const now = Math.floor(Date.now() / 1000);
    const markets = snapshot.markets.map(market => ({
      label: market.label, pool: market.pool, closesAt: new Date(market.closesAt * 1000).toISOString().replace('.000Z', 'Z'),
      tradingOpen: now < market.closesAt,
      // Yes on one question is scope = 2^index with mask 2; No is mask 1.
      questions: market.questions,
    })).sort((a, b) => Number(b.tradingOpen) - Number(a.tradingOpen) || b.closesAt.localeCompare(a.closesAt));
    return { network: `${snapshot.network.name} (${snapshot.network.chainId})`, markets };
  }
}
