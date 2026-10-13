import * as ed from '@noble/ed25519';
import { bytesToHex, hashTypedData, hexToBytes, type Hex } from 'viem';

// Enrollment is wallet-signed (POST /api/v1/api-key/payload then /enroll) from
// the origin Perpl whitelisted: https://flurbo.singu.online. The Ed25519 secret
// stays in the browser and signs each later trading frame.
ed.etc.sha512Async = async (...messages: Uint8Array[]) => {
  const data = ed.etc.concatBytes(...messages);
  const bytes = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  return new Uint8Array(await crypto.subtle.digest('SHA-512', bytes));
};

export const PERPL_CHAIN_ID = 10143;
export const PERPL_EXCHANGE = '0x1964c32f0be608e7d29302aff5e61268e72080cc';
export const PERPL_AUSD = '0xa9012a055bd4e0edff8ce09f960291c09d5322dc';
export const PERPL_KEYS_URL = 'https://testnet.perpl.xyz/apikeys';
export const PERPL_APP_URL = 'https://testnet.perpl.xyz';
export const PERPL_DOCS_URL = 'https://docs.perpl.xyz/resources/for-developers/api/authentication';
export const PERPL_SCOPE_TRADE = 3;
export const PERPL_KEY_LABEL = 'Flurbo';

export type PerplMarket = {
  id: number;
  symbol: string;
  name: string;
  open: boolean;
  mark: number;
  priceDecimals: number;
  sizeDecimals: number;
  orderTtlBlocks: number;
  initialMargin: number;
};
export type PerplContext = { instanceId: number; minimumDeposit: string; markets: PerplMarket[] };
export type PerplAccount = { id: number; instanceId: number; forwarding: boolean; frozen: boolean; lastRequest: number; balance: string };
export type PerplFill = { price?: number; size: number; txid?: string; block?: number };
export const PERPL_ACTIONS = [
  { id: 1, label: 'Open long' },
  { id: 2, label: 'Open short' },
  { id: 3, label: 'Close long' },
  { id: 4, label: 'Close short' },
  { id: 5, label: 'Cancel order' },
  { id: 6, label: 'Add collateral' },
  { id: 7, label: 'Change order' },
] as const;
export type PerplAction = (typeof PERPL_ACTIONS)[number]['id'];

export type PerplOrder = {
  serial: number;
  requestId: number;
  marketId: number;
  accountId: number;
  action: PerplAction;
  orderId?: number;
  phase: 'sent' | 'admitted' | 'filled' | 'failed' | 'closed';
  gateway?: string;
  status?: number;
  reason?: number;
  txid?: string;
  block?: number;
  fill?: PerplFill;
};
type EarlyFill = PerplFill & { oid: number; marketId: number; accountId: number };
export type PerplDesk = {
  instanceId: number;
  accounts: PerplAccount[];
  head: number;
  serial: number;
  stale: boolean;
  lastSequence?: number;
  order: PerplOrder | null;
  earlyFills: EarlyFill[];
};

const record = (value: unknown) => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const whole = (value: unknown, min = 0) => typeof value === 'number' && Number.isSafeInteger(value) && value >= min ? value : null;

export function parsePerplContext(value: unknown): PerplContext {
  const body = record(value);
  const chain = record(body?.chain);
  if (chain?.chain_id !== PERPL_CHAIN_ID || !Array.isArray(body?.tokens) || !Array.isArray(body?.instances) || !Array.isArray(body?.markets)) throw new Error('Unsupported Perpl network');
  const instances = body.instances.filter(item => record(item)?.address?.toString().toLowerCase() === PERPL_EXCHANGE);
  if (instances.length !== 1) throw new Error('Unknown Perpl exchange');
  const instance = record(instances[0]);
  const instanceId = whole(instance?.id, 1);
  if (!instance || instanceId === null || !/^[1-9]\d{0,20}$/.test(String(instance.min_account_open_amount ?? ''))) throw new Error('Unknown Perpl exchange');
  const token = body.tokens.map(record).find(item => item?.id === instance.collateral_token_id);
  if (token?.address?.toString().toLowerCase() !== PERPL_AUSD || token.decimals !== 6 || token.symbol !== 'AUSD') throw new Error('Perpl collateral changed');
  const markets = body.markets.filter(item => record(item)?.instance_id === instanceId).map((item): PerplMarket => {
    const market = record(item);
    const config = record(market?.config);
    const state = record(market?.state);
    const id = whole(market?.id, 1);
    const mark = whole(state?.mrk, 1);
    const priceDecimals = whole(config?.price_decimals, 0);
    const sizeDecimals = whole(config?.size_decimals, 0);
    const orderTtlBlocks = whole(market?.order_ttl_blocks, 1);
    const initialMargin = whole(config?.initial_margin, 1);
    if (!market || id === null || mark === null || priceDecimals === null || priceDecimals > 8 || sizeDecimals === null || sizeDecimals > 8
      || orderTtlBlocks === null || initialMargin === null || typeof config?.is_open !== 'boolean' || !/^[A-Z0-9]{1,12}$/.test(String(market.symbol ?? ''))) throw new Error('Invalid Perpl market');
    return { id, symbol: String(market.symbol), name: `${market.symbol} perpetual`, open: config.is_open, mark, priceDecimals, sizeDecimals, orderTtlBlocks, initialMargin };
  });
  if (!markets.length || markets.length > 100 || new Set(markets.map(item => item.id)).size !== markets.length) throw new Error('Invalid market list');
  return { instanceId, minimumDeposit: String(instance.min_account_open_amount), markets };
}

export function formatScaled(value: number, decimals: number) {
  if (!Number.isSafeInteger(value) || value < 0 || !Number.isInteger(decimals) || decimals < 0 || decimals > 8) return '';
  const raw = String(value).padStart(decimals + 1, '0');
  const frac = decimals ? raw.slice(-decimals).replace(/0+$/, '') : '';
  return raw.slice(0, raw.length - decimals) + (frac ? `.${frac}` : '');
}

export function collateralAmount(raw: string) {
  if (!/^[0-9]{1,24}$/.test(raw)) return '';
  const wholePart = raw.length > 6 ? raw.slice(0, -6).replace(/^0+(?=\d)/, '') : '0';
  const frac = raw.padStart(7, '0').slice(-6).replace(/0+$/, '');
  return frac ? `${wholePart}.${frac}` : wholePart;
}

export function parseApiToken(value: string) {
  const token = value.trim();
  if (/^(?:0x)?[0-9a-f]{64}$/i.test(token)) throw new Error('That value is the private key. Paste it in the private key field.');
  if (!/^[A-Za-z0-9._~+/=-]{16,512}$/.test(token)) throw new Error('Paste the API token from Perpl’s key page.');
  return token;
}

export function parseApiSecret(value: string) {
  const hex = value.trim().replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error('The private key should be 64 hex characters (32 bytes).');
  return ed.etc.hexToBytes(hex);
}

export function parseWalletAddress(value: string) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error('Select a MetaMask account.');
  return value;
}

export type EnrollmentTypedData = {
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  domain: Record<string, unknown>;
  message: Record<string, unknown>;
};

function hexOf(value: unknown, bytes: number) {
  return typeof value === 'string' && new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`).test(value);
}

export async function createApiKeypair() {
  const secret = ed.utils.randomPrivateKey();
  return { secret, publicKeyHex: bytesToHex(await ed.getPublicKeyAsync(secret)), secretHex: bytesToHex(secret) };
}

export function parseEnrollmentPayload(value: unknown): { typedData: EnrollmentTypedData; raw: Record<string, unknown>; mac: string } {
  const body = record(value);
  const typed = record(body?.typed_data);
  const types = record(typed?.types);
  const domain = record(typed?.domain);
  const message = record(typed?.message);
  const primaryType = typeof typed?.primaryType === 'string' ? typed.primaryType : '';
  if (!typed || !types || !domain || !message || !/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(primaryType) || !Array.isArray(types[primaryType]) || !types[primaryType].length) {
    throw new Error('Perpl sent an enrollment payload this page could not sign.');
  }
  if (!hexOf(body?.mac, 32)) throw new Error('Perpl sent an enrollment payload this page could not sign.');
  const fields: EnrollmentTypedData['types'] = {};
  for (const [name, entries] of Object.entries(types)) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(name) || !Array.isArray(entries) || entries.length > 32) throw new Error('Perpl sent an enrollment payload this page could not sign.');
    fields[name] = entries.map(entry => {
      const row = record(entry);
      if (!row || typeof row.name !== 'string' || typeof row.type !== 'string' || !/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(row.name) || !/^[A-Za-z0-9\[\]]{1,64}$/.test(row.type)) {
        throw new Error('Perpl sent an enrollment payload this page could not sign.');
      }
      return { name: row.name, type: row.type };
    });
  }
  return { typedData: { types: fields, primaryType, domain, message }, raw: typed, mac: String(body!.mac) };
}

export function enrollmentDigest(typedData: EnrollmentTypedData): Hex {
  const { EIP712Domain: _ignored, ...types } = typedData.types;
  if (!types[typedData.primaryType]?.length) throw new Error('Perpl sent an enrollment payload this page could not sign.');
  const domain = { ...typedData.domain };
  if (typeof domain.chainId === 'string') domain.chainId = BigInt(domain.chainId);
  return hashTypedData({
    domain: domain as Parameters<typeof hashTypedData>[0]['domain'],
    types,
    primaryType: typedData.primaryType,
    message: typedData.message,
  });
}

export async function proofOfPossession(secret: Uint8Array, typedData: EnrollmentTypedData) {
  return bytesToHex(await ed.signAsync(hexToBytes(enrollmentDigest(typedData)), secret));
}

export function parseEnrolledToken(value: unknown) {
  const body = record(value);
  const nested = record(body?.api_key);
  return parseApiToken(typeof nested?.api_key === 'string' ? nested.api_key : typeof body?.api_key === 'string' ? body.api_key : '');
}

export function enrollmentFailure(status: number, value: unknown) {
  if (status === 401) return 'Sign in again to enroll a Perpl key.';
  if (status === 409) return 'This public key is already registered on Perpl. Try again to create a new key.';
  if (status === 423) return 'This wallet already has 16 Perpl keys. Revoke one at Perpl, then try again.';
  if (status === 404) return 'Perpl has no profile for this wallet. Open the Perpl testnet app first.';
  if (status === 403) return 'Perpl has not approved enrollment from this site.';
  const message = typeof record(value)?.error === 'string' ? String(record(value)!.error).replace(/[^\x20-\x7E]/g, '').slice(0, 160) : '';
  return message || 'Perpl enrollment is unavailable. Try again shortly.';
}

export async function enrollApiKey(input: {
  address: string;
  signTypedData: (typedData: Record<string, unknown>) => Promise<string>;
  fetch?: typeof fetch;
  label?: string;
}) {
  const address = parseWalletAddress(input.address);
  const fetcher = input.fetch ?? fetch;
  const pair = await createApiKeypair();
  const payloadResponse = await fetcher('/api/perpl/api-key/payload', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chain_id: PERPL_CHAIN_ID, address, public_key: pair.publicKeyHex, scope_mask: PERPL_SCOPE_TRADE, label: input.label ?? PERPL_KEY_LABEL }),
  });
  const payloadBody = await payloadResponse.json().catch(() => null);
  if (!payloadResponse.ok) throw new Error(enrollmentFailure(payloadResponse.status, payloadBody));
  const { typedData, raw, mac } = parseEnrollmentPayload(payloadBody);
  const signature = await input.signTypedData(raw);
  if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]{128,144}$/.test(signature)) throw new Error('MetaMask did not return an enrollment signature.');
  const enrollResponse = await fetcher('/api/perpl/api-key/enroll', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chain_id: PERPL_CHAIN_ID, address, typed_data: raw, mac, signature, pop_signature: await proofOfPossession(pair.secret, typedData) }),
  });
  const enrollBody = await enrollResponse.json().catch(() => null);
  if (!enrollResponse.ok) throw new Error(enrollmentFailure(enrollResponse.status, enrollBody));
  return { token: parseEnrolledToken(enrollBody), secret: pair.secret, secretHex: pair.secretHex };
}

export function tradeLeverage(initialMargin: number) {
  if (!Number.isSafeInteger(initialMargin) || initialMargin <= 0 || initialMargin > 10_000) throw new Error('This market has no usable leverage.');
  if (Math.floor(1_000_000 / initialMargin) < 100) throw new Error('This market has no usable leverage.');
  return 100;
}

export function nextRequestId(lastForwarded: number, previous: number) {
  if (!Number.isSafeInteger(lastForwarded) || lastForwarded < 0 || !Number.isSafeInteger(previous) || previous < 0) throw new Error('Invalid request id.');
  const next = Math.max(lastForwarded, previous) + 1;
  if (!Number.isSafeInteger(next)) throw new Error('Invalid request id.');
  return next;
}

export function wsSignInCanonical(timestamp: string, nonce: string) {
  if (!/^[0-9]{10,16}$/.test(timestamp) || !/^[A-Za-z0-9_-]{8,64}$/.test(nonce)) throw new Error('Invalid sign-in.');
  return `${PERPL_CHAIN_ID}\ntrading-ws-signin\n${timestamp}\n${nonce}`;
}

function base64url(bytes: Uint8Array) {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export async function apiKeySignIn(secret: Uint8Array, token: string, now = Date.now(), nonce = base64url(crypto.getRandomValues(new Uint8Array(16)))) {
  const timestamp = String(now);
  const signature = base64url(await ed.signAsync(new TextEncoder().encode(wsSignInCanonical(timestamp, nonce)), secret));
  return { mt: 29, chain_id: PERPL_CHAIN_ID, api_key: token, timestamp, nonce, signature };
}

export function scaleUnits(text: string, decimals: number) {
  const trimmed = text.trim();
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 8 || !/^\d+(?:\.\d+)?$/.test(trimmed)) throw new Error('Enter a positive size for this market.');
  const [whole = '0', frac = ''] = trimmed.split('.');
  if (frac.length > decimals) throw new Error('That size has too many decimal places for this market.');
  const scaled = BigInt(whole) * 10n ** BigInt(decimals) + BigInt((frac + '0'.repeat(decimals)).slice(0, decimals) || '0');
  if (scaled < 1n || scaled > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Enter a positive size for this market.');
  return Number(scaled);
}

export function collateralText(text: string) {
  const amount = text.trim();
  if (!/^(?:[1-9]\d{0,11}|0)(?:\.\d{1,6})?$/.test(amount) || Number(amount) <= 0) throw new Error('Enter a collateral amount in AUSD.');
  return amount;
}

// lb 0 asks Perpl to apply the market's own order window. p 0 with fl 4 is a market IOC.
// Cancel and collateral follow Perpl's documented frames: no size, and collateral carries `a`.
export function orderRequest(input: { action: PerplAction; marketId: number; accountId: number; requestId: number; serial: number; leverage: number; size?: number; price?: number; orderId?: number; amount?: string }) {
  for (const name of ['action', 'marketId', 'accountId', 'requestId', 'serial', 'leverage'] as const) {
    if (!Number.isSafeInteger(input[name]) || input[name] <= 0) throw new Error(`Invalid ${name}.`);
  }
  if (!PERPL_ACTIONS.some(item => item.id === input.action)) throw new Error('Choose an order action.');
  const base = { mt: 22 as const, sn: input.serial, rq: input.requestId, mkt: input.marketId, acc: input.accountId, t: input.action, lb: 0 };
  if (input.action === 5) {
    if (!Number.isSafeInteger(input.orderId) || input.orderId! <= 0) throw new Error('Enter the order id to cancel.');
    return { ...base, oid: input.orderId, s: 0, fl: 0, lv: 0 };
  }
  if (input.action === 6) return { ...base, s: 0, fl: 0, lv: input.leverage, a: collateralText(input.amount ?? '') };
  const size = input.size ?? 0;
  const price = input.price ?? 0;
  if (!Number.isSafeInteger(size) || size < 1 || !Number.isSafeInteger(price) || price < 0) throw new Error('Enter a positive size for this market.');
  if (input.action === 7) {
    if (!Number.isSafeInteger(input.orderId) || input.orderId! <= 0 || price < 1) throw new Error('A change needs the order id, a size, and a limit price.');
    return { ...base, oid: input.orderId, p: price, s: size, fl: 0, lv: input.leverage };
  }
  return { ...base, p: price, s: size, fl: price === 0 ? 4 : 0, lv: input.leverage };
}

export function minimumLong(input: { marketId: number; accountId: number; requestId: number; serial: number; leverage: number }) {
  return orderRequest({ ...input, action: 1, size: 1, price: 0 });
}

export function emptyDesk(instanceId: number): PerplDesk {
  return { instanceId, accounts: [], head: 0, serial: 0, stale: false, order: null, earlyFills: [] };
}

// A reconnect must not forget an order that Perpl has already admitted. The fill can arrive on the next socket.
export function resumeDesk(previous: PerplDesk | null, instanceId: number): PerplDesk {
  const fresh = emptyDesk(instanceId);
  const order = previous?.instanceId === instanceId ? previous.order : null;
  if (!previous || !order || (order.phase !== 'sent' && order.phase !== 'admitted' && order.phase !== 'filled')) return fresh;
  return { ...fresh, accounts: previous.accounts, serial: previous.serial, order, earlyFills: previous.earlyFills };
}

function accountFrom(value: unknown, instanceId: number): PerplAccount | null {
  const row = record(value);
  const id = whole(row?.id, 1);
  const instance = whole(row?.in, 1);
  const lastRequest = whole(row?.lfr, 0);
  if (!row || id === null || instance === null || lastRequest === null || instance !== instanceId || typeof row.fw !== 'boolean' || typeof row.fr !== 'boolean') return null;
  if (typeof row.b !== 'string' || !/^[0-9]{1,40}$/.test(row.b)) return null;
  return { id, instanceId: instance, forwarding: row.fw, frozen: row.fr, lastRequest, balance: row.b };
}

function keepProgress(previous: PerplAccount | undefined, next: PerplAccount): PerplAccount {
  return previous ? { ...next, lastRequest: Math.max(previous.lastRequest, next.lastRequest) } : next;
}

function txHash(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const body = value.trim().replace(/^0x/i, '');
  return /^[0-9a-fA-F]{64}$/.test(body) ? `0x${body.toLowerCase()}` : undefined;
}

function txidOf(...values: unknown[]) {
  let txid: string | undefined;
  let block: number | undefined;
  for (const value of values) {
    const at = record(value);
    if (!at) continue;
    txid ??= txHash(at.txid);
    block ??= whole(at.b, 0) ?? undefined;
  }
  return { txid, block };
}

export function beginOrder(desk: PerplDesk, order: PerplOrder): PerplDesk {
  return {
    ...desk, serial: order.serial, earlyFills: [], order,
    accounts: desk.accounts.map(account => account.id === order.accountId ? { ...account, lastRequest: Math.max(account.lastRequest, order.requestId) } : account),
  };
}

function fail(order: PerplOrder, reason: number | undefined, gateway?: string): PerplOrder {
  return { ...order, phase: 'failed', reason: reason ?? order.reason, gateway: gateway || order.gateway };
}

export function applyFrame(desk: PerplDesk, value: unknown): PerplDesk {
  const frame = record(value);
  const kind = whole(frame?.mt, 1);
  if (!frame || kind === null) return desk;
  if (kind === 19) {
    const rows = Array.isArray(frame.as) ? frame.as : [];
    const accounts = rows.map(row => accountFrom(row, desk.instanceId)).filter((row): row is PerplAccount => row !== null)
      .map(row => keepProgress(desk.accounts.find(account => account.id === row.id), row));
    const sequence = whole(frame.sn, 0);
    return { ...desk, accounts, lastSequence: sequence ?? desk.lastSequence };
  }
  if (kind === 21) {
    const next = accountFrom(frame, desk.instanceId);
    if (!next) return desk;
    const accounts = desk.accounts.some(account => account.id === next.id)
      ? desk.accounts.map(account => account.id === next.id ? keepProgress(account, next) : account)
      : [...desk.accounts, next];
    return { ...desk, accounts };
  }
  if (kind === 100) {
    const sequence = whole(frame.sn, 0);
    const head = whole(frame.h, 0);
    const stale = desk.lastSequence !== undefined && sequence !== null && sequence !== desk.lastSequence + 1;
    return { ...desk, head: head ?? desk.head, stale: desk.stale || stale, lastSequence: !stale && sequence !== null ? sequence : desk.lastSequence };
  }
  if (!desk.order || desk.order.phase === 'failed' || desk.order.phase === 'closed') return desk;
  if (desk.order.phase === 'filled' && (desk.order.fill?.txid || (kind !== 24 && kind !== 25))) return desk;
  if (kind === 3) {
    if (whole(frame.cid, 1) !== desk.order.serial) return desk;
    const status = record(frame.status);
    const code = whole(status?.code, 0);
    if (code === null) return desk;
    if (code === 0) return { ...desk, order: { ...desk.order, phase: 'admitted', gateway: 'Accepted for forwarding.' } };
    const text = typeof status?.error === 'string' ? status.error.replace(/[^\x20-\x7E]/g, '').slice(0, 160) : '';
    return { ...desk, order: fail(desk.order, undefined, text || 'Perpl rejected the order before it reached the chain.') };
  }
  if (kind === 24 && Array.isArray(frame.d)) {
    let next = desk;
    for (const item of frame.d) {
      const row = record(item);
      if (!next.order || whole(row?.rq, 0) !== next.order.requestId) continue;
      const orderId = whole(row?.oid, 1) ?? undefined;
      const status = whole(row?.st, 0) ?? undefined;
      const reason = whole(row?.sr, 0) ?? undefined;
      const stamp = txidOf(row?.at, row?.c);
      const txid = stamp.txid || next.order.txid || next.order.fill?.txid;
      const block = stamp.block ?? next.order.block ?? next.order.fill?.block;
      if (next.order.phase === 'filled') {
        if (orderId === next.order.orderId && txid && txid !== next.order.fill?.txid) {
          next = { ...next, order: { ...next.order, txid, block, fill: { ...next.order.fill!, txid, block } } };
        }
        continue;
      }
      const cancelDone = next.order.action === 5 && status === 5;
      const failed = !cancelDone && (status === 5 || status === 6 || status === 7);
      const order = cancelDone ? { ...next.order, orderId, status, reason, phase: 'closed' as const, txid, block }
        : failed ? fail({ ...next.order, orderId, status, reason, txid, block }, reason) : { ...next.order, orderId, status, reason, txid, block };
      const early = orderId ? next.earlyFills.find(fill => fill.oid === orderId) : undefined;
      next = {
        ...next,
        earlyFills: early ? next.earlyFills.filter(fill => fill !== early) : next.earlyFills,
        order: early && order.phase !== 'failed' ? { ...order, phase: 'filled', fill: { price: early.price, size: early.size, txid: early.txid || txid, block: early.block ?? block } } : order,
      };
    }
    return next;
  }
  if (kind === 25 && Array.isArray(frame.d)) {
    let next = desk;
    for (const item of frame.d) {
      const row = record(item);
      const oid = whole(row?.oid, 1);
      const marketId = whole(row?.mkt, 1);
      const accountId = whole(row?.acc, 1);
      const size = whole(row?.s, 0);
      if (!next.order || oid === null || marketId === null || accountId === null || size === null) continue;
      if (marketId !== next.order.marketId || accountId !== next.order.accountId) continue;
      const stamp = txidOf(row?.at, frame?.at);
      const txid = stamp.txid || next.order.txid;
      const block = stamp.block ?? next.order.block;
      const fill: EarlyFill = { oid, marketId, accountId, size, price: whole(row?.p, 0) ?? undefined, txid, block };
      if (next.order.phase === 'filled') {
        if (next.order.orderId === oid && txid && txid !== next.order.fill?.txid) {
          next = { ...next, order: { ...next.order, txid, block, fill: { price: next.order.fill?.price ?? fill.price, size: next.order.fill?.size ?? size, txid, block: next.order.fill?.block ?? block } } };
        }
        continue;
      }
      if (!next.order.orderId) next = { ...next, earlyFills: [...next.earlyFills, fill].slice(-8) };
      else if (next.order.orderId === oid) next = { ...next, order: { ...next.order, phase: 'filled', txid, block, fill: { price: fill.price, size, txid, block } } };
    }
    return next;
  }
  return desk;
}

export function orderOutcome(order: PerplOrder | null, stale: boolean) {
  if (!order) return null;
  if (order.phase === 'filled' && order.fill) {
    const txid = order.fill.txid || order.txid;
    return { tone: 'ok' as const, text: txid ? 'Filled on Perpl.' : 'Filled on Perpl. The transaction hash has not arrived yet.', txid };
  }
  if (order.phase === 'closed') return { tone: 'done' as const, text: 'Perpl canceled that order. This is not a fill.' };
  if (order.phase === 'failed') {
    const admitted = order.gateway === 'Accepted for forwarding.';
    const text = order.reason === 34 ? 'Order forwarding is off. Turn on one-click trading in the Perpl testnet app, then reconnect.'
      : order.reason === 32 ? 'That request id was already used. Reconnect and place the order once more.'
      : order.reason === 14 ? 'The order expired before Perpl submitted it. This is not a fill.'
      : !admitted && order.gateway ? order.gateway
      : 'Perpl rejected the order. This is not a fill.';
    return { tone: 'bad' as const, text };
  }
  if (stale) return { tone: 'bad' as const, text: 'The stream skipped an update. Reconnect before treating this order as final.' };
  if (order.phase === 'admitted') {
    const extra = order.status === 4 ? ' The order reports filled. Still waiting for the fill record.'
      : order.status === 2 ? ' The order is open and has not filled.' : '';
    return { tone: 'wait' as const, text: `Accepted for forwarding. This is not a fill yet.${extra}` };
  }
  return { tone: 'wait' as const, text: 'Order sent. Waiting for Perpl to accept or reject it.' };
}
