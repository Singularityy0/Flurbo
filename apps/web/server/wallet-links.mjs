import { randomBytes } from 'node:crypto';
import { verifyMessage } from 'viem';
import { digest } from './session.mjs';

const address = value => typeof value === 'string' && /^0x[0-9a-f]{40}$/i.test(value);
const MAX_WALLETS = 20;
export function walletLinks({ command, now = Date.now } = {}) {
  const challenges = new Map(), accounts = new Map(), owners = new Map(), budgets = new Map();
  const key = (kind, value) => `flurbo:wallet-links:v1:${kind}:${digest(value)}`;
  async function list(login, origin) {
    const id = origin + ':' + login;
    const wallets = command ? await command('SMEMBERS', key('account', id)) : [...(accounts.get(id) || [])];
    return { account: login, wallets: wallets.sort() };
  }
  async function challenge(login, wallet, origin, session) {
    if (!address(wallet) || wallet.toLowerCase() === login) throw Error('Choose a MetaMask trading address, not your Mera account address.');
    wallet = wallet.toLowerCase();
    const rate = key('rate', session + ':' + Math.floor(now()/60000));
    const count = command ? await command('EVAL', "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],120) end; return n", 1, rate) : (budgets.get(rate) || 0) + 1;
    if (!command) { if (budgets.size > 1000) budgets.clear(); budgets.set(rate, count); }
    if (count > 10) throw Error('Too many linking attempts. Try again in a minute.');
    const id = randomBytes(32).toString('base64url'), expires = now() + 300000;
    const message = `Link MetaMask to Flurbo\nOrigin: ${origin}\nMera account: ${login}\nTrading wallet: ${wallet}\nChain: Monad testnet (10143)\nNonce: ${id}\nExpires: ${new Date(expires).toISOString()}\nThis links this wallet's public holdings and activity to your Flurbo account across devices. It does not move funds or authorize transactions.`;
    const value = { login, wallet, origin, session: digest(session), expires, message };
    if (command) await command('SET', key('challenge', id), JSON.stringify(value), 'EX', 300);
    else { for (const [k,v] of challenges) if(v.expires <= now()) challenges.delete(k); if(challenges.size>=1000) throw Error('Linking is busy. Retry shortly.'); challenges.set(id, value); }
    return { id, message };
  }
  async function verify(login, id, signature, origin, session) {
    const raw = command ? await command('GETDEL', key('challenge', id)) : challenges.get(id);
    if (!command) challenges.delete(id);
    const proof = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!proof || proof.login !== login || proof.origin !== origin || proof.session !== digest(session) || proof.expires <= now() || !/^0x[0-9a-f]{130}$/i.test(signature || '') ||
      !await verifyMessage({ address: proof.wallet, message: proof.message, signature })) throw Error('Wallet proof rejected. Reconnect and try again.');
    const accountId = origin + ':' + login, walletId = origin + ':' + proof.wallet;
    if (command) {
      const result = await command('EVAL', `local owner=redis.call('GET',KEYS[2]); if owner and owner~=ARGV[1] then return -1 end; if redis.call('SISMEMBER',KEYS[1],ARGV[2])==0 and redis.call('SCARD',KEYS[1])>=${MAX_WALLETS} then return -2 end; redis.call('SET',KEYS[2],ARGV[1]); redis.call('SADD',KEYS[1],ARGV[2]); return 1`, 2, key('account', accountId), key('owner', walletId), login, proof.wallet);
      if (result === -1) throw Error('This MetaMask wallet is linked to another Flurbo account. Sign in to that account.');
      if (result !== 1) throw Error('This account has reached its 20-wallet limit.');
    } else {
      if (owners.has(walletId) && owners.get(walletId) !== login) throw Error('This MetaMask wallet is linked to another Flurbo account. Sign in to that account.');
      const set = accounts.get(accountId) || new Set();
      if (!set.has(proof.wallet) && set.size >= MAX_WALLETS) throw Error('This account has reached its 20-wallet limit.');
      set.add(proof.wallet); accounts.set(accountId, set); owners.set(walletId, login);
    }
    return list(login, origin);
  }
  return { list, challenge, verify };
}
