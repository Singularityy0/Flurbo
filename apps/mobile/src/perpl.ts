import { encodeFunctionData, formatUnits, parseAbi, parseUnits, type Hex } from 'viem';

export type Provider = {
  request: (input: { method: string; params?: unknown[] }) => Promise<unknown>;
};

const hexInteger = (value: unknown): bigint => {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{1,64}$/i.test(value)) throw new Error('Invalid integer');
  return BigInt(value);
};

export const PERPL_CONTEXT = 'https://testnet.perpl.xyz/api/v1/pub/context';
export const PERPL_EXCHANGE = '0x1964c32f0be608e7d29302aff5e61268e72080cc';
export const AUSD_TOKEN = '0xa9012a055bd4e0edff8ce09f960291c09d5322dc';

export type PerplMarket = { id: number; symbol: string; name: string; open: boolean; mark: number; decimals: number };
export type PerplContext = { markets: PerplMarket[]; minimumDeposit: string; checkedAt: number };

export const perplExchangeAbi = parseAbi([
  'function createAccount(uint256 amountCNS) external returns (uint256)',
  'function getAccountByAddr(address account) external view returns (uint256)'
]);

export const perplErc20Abi = parseAbi([
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)'
]);

export function parsePerplContext(value: any, ausd: string): PerplContext {
  if (value?.chain?.chain_id !== 10143 || !Array.isArray(value.tokens) || !Array.isArray(value.instances) || !Array.isArray(value.markets)) throw new Error('Unsupported Perpl network');
  const instances = value.instances.filter((x: any) => x.address?.toLowerCase() === PERPL_EXCHANGE);
  if (instances.length !== 1) throw new Error('Unknown Perpl exchange');
  const instance = instances[0];
  const token = value.tokens.find((x: any) => x.id === instance.collateral_token_id);
  if (token?.address?.toLowerCase() !== ausd.toLowerCase() || token.decimals !== 6 || token.symbol !== 'AUSD' || !/^[1-9]\d{0,20}$/.test(instance.min_account_open_amount)) throw new Error('Perpl collateral changed');
  const markets: PerplMarket[] = value.markets.filter((x: any) => x.instance_id === instance.id).map((x: any) => {
    if (!Number.isSafeInteger(x.id) || x.id <= 0 || !/^[A-Z0-9]{1,12}$/.test(x.symbol) || typeof x.config?.is_open !== 'boolean' ||
      !Number.isSafeInteger(x.state?.mrk) || x.state.mrk <= 0 || !Number.isInteger(x.config.price_decimals) || x.config.price_decimals < 0 || x.config.price_decimals > 8) throw new Error('Invalid Perpl market');
    return { id: x.id, symbol: x.symbol, name: `${x.symbol} perpetual`, open: x.config.is_open, mark: x.state.mrk, decimals: x.config.price_decimals };
  });
  if (!markets.length || markets.length > 100 || new Set(markets.map(x => x.id)).size !== markets.length) throw new Error('Invalid market list');
  return { markets, minimumDeposit: instance.min_account_open_amount, checkedAt: Date.now() };
}

export async function readPerplContext(ausd: string, signal?: AbortSignal): Promise<PerplContext> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 15_000);
  try {
    const res = await fetch(PERPL_CONTEXT, { signal: controller.signal });
    if (!res.ok) throw new Error('Unavailable');
    return parsePerplContext(await res.json(), ausd);
  } catch { throw new Error('Perpl market data is unavailable. Try again shortly.'); }
  finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}

export type PerplReview = {
  action: 'deposit' | 'approve';
  tx: Record<string, string>;
  block: { number: string; hash: string };
  expires: number;
  fee: string;
  amount?: string;
};

const hex = (v: bigint) => '0x' + v.toString(16);

export async function preparePerplDeposit(p: Provider, owner: string, amountAusd: string): Promise<PerplReview> {
  if (hexInteger(await p.request({ method: 'eth_chainId' })) !== 10143n) throw new Error('Select Monad testnet.');
  const block = await p.request({ method: 'eth_getBlockByNumber', params: ['latest', false] }) as { number: string; hash: string; timestamp: string };
  if (!block?.hash || Date.now() / 1000 - Number(hexInteger(block.timestamp)) > 180) throw new Error('Chain data is stale.');

  if (!/^\d+(?:\.\d{1,6})?$/.test(amountAusd)) throw new Error('Enter a valid AUSD amount with up to six decimals.');
  const atoms = parseUnits(amountAusd, 6);
  const context = await readPerplContext(AUSD_TOKEN);
  if (atoms < BigInt(context.minimumDeposit)) throw new Error(`Opening a Perpl account requires at least ${formatUnits(BigInt(context.minimumDeposit), 6)} test AUSD.`);
  const accountData = encodeFunctionData({ abi: perplExchangeAbi, functionName: 'getAccountByAddr', args: [owner as Hex] });
  try {
    const account = await p.request({ method: 'eth_call', params: [{ to: PERPL_EXCHANGE, data: accountData }, 'latest'] }) as string;
    if (account && BigInt(account) > 0n) throw new Error('Perpl account already exists. Manage collateral on Perpl.');
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Perpl account already exists')) throw error;
    // Perpl may revert getAccountByAddr for a wallet with no account.
  }

  const allowanceCalldata = encodeFunctionData({
    abi: perplErc20Abi,
    functionName: 'allowance',
    args: [owner as Hex, PERPL_EXCHANGE as Hex]
  });
  const rawAllowance = await p.request({
    method: 'eth_call',
    params: [{ to: AUSD_TOKEN, data: allowanceCalldata }, 'latest']
  }) as string;
  const currentAllowance = rawAllowance ? BigInt(rawAllowance) : 0n;

  let tx: Record<string, string>;
  let action: 'deposit' | 'approve';

  if (currentAllowance < atoms) {
    action = 'approve';
    const approveData = encodeFunctionData({
      abi: perplErc20Abi,
      functionName: 'approve',
      args: [PERPL_EXCHANGE as Hex, atoms]
    });
    tx = { from: owner, to: AUSD_TOKEN, data: approveData, value: '0x0', chainId: '0x279f', gas: '', gasPrice: '' };
  } else {
    action = 'deposit';
    const depositData = encodeFunctionData({
      abi: perplExchangeAbi,
      functionName: 'createAccount',
      args: [atoms]
    });
    tx = { from: owner, to: PERPL_EXCHANGE, data: depositData, value: '0x0', chainId: '0x279f', gas: '', gasPrice: '' };
  }

  const { gas: _, gasPrice: __, ...call } = tx;
  await p.request({ method: 'eth_call', params: [call, 'latest'] });
  const gas = hexInteger(await p.request({ method: 'eth_estimateGas', params: [call] })) * 120n / 100n;
  const price = hexInteger(await p.request({ method: 'eth_gasPrice' })) * 2n;
  tx.gas = hex(gas);
  tx.gasPrice = hex(price);

  return {
    action,
    tx,
    block,
    expires: Date.now() + 300_000,
    fee: formatUnits(gas * price, 18),
    amount: amountAusd
  };
}
