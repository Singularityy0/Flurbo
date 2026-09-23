import { SessionStore, cookieValue, LOGIN_MS } from './session.mjs';
import { parseTransaction, recoverTransactionAddress } from 'viem';

export function localApi({ hosts = ['localhost:18767', '127.0.0.1:18767'] } = {}) {
  const store = new SessionStore();
  const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body)); };
  const cookie = (name, value, age) => `${name}=${value}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${age}`;
  async function body(req) {
    if (req.headers['content-type'] !== 'application/json') throw new Error('JSON required');
    let text = '';
    for await (const chunk of req) { text += chunk; if (text.length > 24_000) throw new Error('Request too large'); }
    return JSON.parse(text);
  }
  return async (req, res, next) => {
    if (!req.url?.startsWith('/api/')) return next();
    const host = req.headers.host;
    // This middleware intentionally serves loopback development only.
    if (!hosts.includes(host)) return send(res, 403, { error: 'Local workspace only' });
    const origin = `http://${host}`;
    if ((req.headers.origin && req.headers.origin !== origin) || (req.method !== 'GET' && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') return send(res, 403, { error: 'Same-origin request required' });
    const url = new URL(req.url, origin), sid = cookieValue(req.headers.cookie, 'flurbo_session');
    try {
      if (url.pathname.startsWith('/api/auth/')) {
        if (req.method === 'GET' && url.pathname === '/api/auth/session') return send(res, 200, { session: store.read(sid, origin) });
        if (req.method !== 'POST') return send(res, 405, { error: 'Method unavailable' });
        if (url.pathname === '/api/auth/challenge') {
          const input = await body(req), challenge = store.challenge(input.address, origin);
          res.setHeader('Set-Cookie', cookie('flurbo_challenge', challenge.id, 300));
          return send(res, 200, { message: challenge.message });
        }
        if (url.pathname === '/api/auth/verify') {
          const input = await body(req);
          const session = await store.verify(cookieValue(req.headers.cookie, 'flurbo_challenge'), input.signature, origin);
          store.revoke(sid);
          res.setHeader('Set-Cookie', [cookie('flurbo_session', session.sessionId, LOGIN_MS / 1000), cookie('flurbo_challenge', '', 0)]);
          return send(res, 200, { session: { address: session.address, expiresAt: session.expiresAt } });
        }
        if (url.pathname === '/api/auth/logout') {
          store.revoke(sid);
          res.setHeader('Set-Cookie', [cookie('flurbo_session', '', 0), cookie('flurbo_challenge', '', 0)]);
          return send(res, 200, { session: null });
        }
        return send(res, 404, { error: 'Unknown account endpoint' });
      }
      if (url.pathname === '/api/rpc' && req.method === 'POST') {
        const input = await body(req);
        const allowed = ['eth_chainId', 'eth_getBlockByNumber', 'eth_call', 'eth_estimateGas', 'eth_gasPrice', 'eth_getTransactionCount', 'eth_sendRawTransaction'];
        if (!allowed.includes(input.method) || !Array.isArray(input.params)) return send(res, 400, { error: 'Unsupported RPC method' });
        if (input.method === 'eth_sendRawTransaction') {
          const login = store.read(sid, origin);
          if (!login) return send(res, 401, { error: 'Sign in before submitting' });
          const serializedTransaction = input.params[0];
          if (typeof serializedTransaction !== 'string' || !/^0x[0-9a-f]+$/i.test(serializedTransaction)) return send(res, 400, { error: 'Invalid signed transaction' });
          const tx = parseTransaction(serializedTransaction);
          const sender = await recoverTransactionAddress({ serializedTransaction });
          const deployment = await fetch('http://127.0.0.1:18765/api/state', { signal: AbortSignal.timeout(20_000) });
          const state = await deployment.json();
          const cash = state.contracts?.cash?.toLowerCase(), pool = state.contracts?.pool?.toLowerCase();
          const selector = tx.data?.slice(0, 10);
          if (!deployment.ok || sender.toLowerCase() !== login.address || tx.chainId !== 10143 || (tx.value ?? 0n) !== 0n || tx.type !== 'legacy' ||
              !tx.gas || tx.gas > 30_000_000n || state.environment !== 'local_fork' ||
              !(tx.to?.toLowerCase() === cash ? selector === '0x095ea7b3' : tx.to?.toLowerCase() === pool && ['0x3e6b6cde', '0xc39849c5', '0xb0a52172', '0xf6c4eade', '0xdf992423'].includes(selector))) return send(res, 403, { error: 'Only this account and the local MVP contracts are supported' });
        }
        const upstream = await fetch('http://127.0.0.1:18545', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: input.method, params: input.params }), signal: AbortSignal.timeout(20_000) });
        const result = await upstream.json();
        if (result.error) return send(res, 400, { error: 'Local chain rejected the request' });
        return send(res, 200, { result: result.result });
      }
      const readRoutes = ['/api/health', '/api/state', '/api/quote', '/api/transaction'];
      const funding = req.method === 'POST' && url.pathname === '/api/local-wallet-setup';
      if (!(req.method === 'GET' && readRoutes.includes(url.pathname)) && !funding) return send(res, 404, { error: 'Unknown workspace endpoint' });
      const input = funding ? await body(req) : undefined;
      const upstream = await fetch(`http://127.0.0.1:18765${url.pathname}${url.search}`, { method: funding ? 'POST' : 'GET',
        headers: funding ? { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:18765' } : {},
        body: funding ? JSON.stringify(input) : undefined, signal: AbortSignal.timeout(20_000) });
      return send(res, upstream.status, await upstream.json());
    } catch { return send(res, 503, { error: 'Request could not complete. Check the local service or retry sign-in.' }); }
  };
}
