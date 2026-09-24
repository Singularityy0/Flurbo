import { SessionStore, cookieValue, LOGIN_MS } from './session.mjs';
import { parseTransaction, recoverTransactionAddress } from 'viem';
import { validWithdrawal } from './withdrawal-policy.mjs';
import { kuruCall } from '../shared/kuru.mjs';
import { TESTNET } from './network.mjs';
import { learningDeployment } from '../shared/learning-contracts.mjs';
import { pilotCall } from '../shared/pilot.mjs';

export function localApi({ hosts = ['localhost:18767', '127.0.0.1:18767'], store = new SessionStore(),
  publicOrigin = null, rpcUrl = 'http://127.0.0.1:18545', dashboardUrl = 'http://127.0.0.1:18765', getLearningReport = () => null,
  learningPool = null, learningOperatorAccount = null, learningDashboardUrl = null, pilot: publishedPilot = null, rehearsal = null, evidence = null } = {}) {
  const hosted = publicOrigin !== null;
  if (hosted && (publicOrigin !== 'https://flurbo.singu.online' || !rpcUrl.startsWith('https://'))) throw new Error('Invalid hosted API configuration');
  // A bounded global limit avoids trusting spoofable forwarded IP headers.
  let minute = 0, requests = 0;
  const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body)); };
  const cookie = (name, value, age) => `${name}=${value}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${age}${hosted ? '; Secure' : ''}`;
  async function body(req) {
    if (req.headers['content-type'] !== 'application/json') throw new Error('JSON required');
    let text = '';
    for await (const chunk of req) { text += chunk; if (text.length > 24_000) throw new Error('Request too large'); }
    return JSON.parse(text);
  }
  return async (req, res, next) => {
    if (!req.url?.startsWith('/api/')) return next();
    const host = req.headers.host;
    if (hosted ? host !== new URL(publicOrigin).host : !hosts.includes(host)) return send(res, 403, { error: 'Unsupported application host' });
    const origin = publicOrigin || `http://${host}`;
    if ((req.headers.origin && req.headers.origin !== origin) || (req.method !== 'GET' && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') return send(res, 403, { error: 'Same-origin request required' });
    const url = new URL(req.url, origin), sid = cookieValue(req.headers.cookie, 'flurbo_session');
    try {
      if (hosted) {
        const current = Math.floor(Date.now() / 60_000);
        if (current !== minute) { minute = current; requests = 0; }
        if (++requests > 600) { res.setHeader('Retry-After', '60'); return send(res, 429, { error: 'Service busy. Retry shortly.' }); }
      }
      if (req.method === 'GET' && url.pathname === '/api/network') return send(res, 200, hosted ? TESTNET : { environment: 'local_fork', chain_id: 10143 });
      if(url.pathname.startsWith('/api/pilot/')||url.pathname.startsWith('/api/rehearsal/')) {
        const isRehearsal=url.pathname.startsWith('/api/rehearsal/');
        const pilot=isRehearsal?rehearsal:publishedPilot;
        if(isRehearsal)url.pathname=url.pathname.replace('/api/rehearsal/','/api/pilot/');
        // Content-addressed evidence is public so counterparties can inspect a cited URI.
        const evidenceHash=url.pathname.match(/^\/api\/pilot\/evidence\/(0x[0-9a-f]{64})$/)?.[1];
        if(evidenceHash && req.method==='GET' && !url.search && evidence) {
          const content=await evidence.get(evidenceHash);
          res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'public, max-age=31536000, immutable'}); res.end(content); return;
        }
        const login=await store.read(sid,origin);
        if(!login || login.method!=='passkey') return send(res,401,{error:'Sign in with your Flurbo passkey'});
        if(!pilot) return send(res,503,{error:isRehearsal?'The separate rehearsal is not deployed and configured yet. The real-event market remains unchanged.':'The real-event pilot is not published yet. Reviewer identities, final event rules and a verified deployment are required.'});
        if(req.method==='GET' && url.pathname==='/api/pilot/status') {
          if([...url.searchParams.keys()].some(k=>k!=='wallet') || url.searchParams.getAll('wallet').length>1) return send(res,400,{error:'Invalid pilot query'});
          return send(res,200,await pilot.status(url.searchParams.get('wallet')||undefined));
        }
        if(url.search) return send(res,400,{error:'Unexpected pilot query'});
        if(req.method==='POST' && url.pathname==='/api/pilot/prepare') return send(res,200,await pilot.prepare(await body(req)));
        if(req.method==='POST' && url.pathname==='/api/pilot/position') {
          const input=await body(req); return send(res,200,await pilot.position(input.owner,input.scope,input.mask));
        }
        if(req.method==='POST' && url.pathname==='/api/pilot/positions') {
          const input=await body(req); return send(res,200,await pilot.positions(input.owner,input.claims));
        }
        if(req.method==='POST' && url.pathname==='/api/pilot/history') {
          const input=await body(req);
          if(!pilot.index || Object.keys(input).length) return send(res,400,{error:'Pilot history unavailable or unexpected input'});
          await pilot.snapshot();
          return send(res,200,await pilot.index.refresh());
        }
        if(req.method==='POST' && url.pathname==='/api/pilot/evidence') {
          if(!evidence) return send(res,503,{error:'Evidence storage unavailable'});
          const input=await body(req);
          if(!pilot.manifest.publication.draft.events.some(e=>e.id===input.eventId)) return send(res,400,{error:'Unknown pilot event'});
          return send(res,200,await evidence.put(input,login.address,pilot.manifest.draftHash));
        }
        if(req.method==='POST' && url.pathname==='/api/pilot/rpc') {
          const input=await body(req);
          if(!input || !Array.isArray(input.params) || !['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_call','eth_estimateGas','eth_gasPrice','eth_getTransactionCount','eth_getTransactionReceipt','eth_getTransactionByHash','eth_getBalance','eth_sendRawTransaction'].includes(input.method)) return send(res,400,{error:'Unsupported pilot RPC'});
          if(input.method==='eth_sendRawTransaction') {
            const raw=input.params[0];
            if(typeof raw!=='string' || !/^0x[0-9a-f]+$/i.test(raw)) return send(res,400,{error:'Invalid transaction'});
            const tx=parseTransaction(raw), sender=await recoverTransactionAddress({serializedTransaction:raw});
            if(sender.toLowerCase()!==login.address || tx.chainId!==10143 || tx.type!=='legacy' || (tx.value??0n)!==0n
              || !tx.gas || tx.gas>15_000_000n || !tx.gasPrice || tx.gasPrice>500_000_000_000n
              || !pilotCall({to:tx.to,data:tx.data,manifest:pilot.manifest})) return send(res,403,{error:'Transaction differs from pilot signing policy'});
            await pilot.snapshot();
          }
          const upstream=await fetch(rpcUrl,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:input.method,params:input.params}),signal:AbortSignal.timeout(20_000)});
          const result=await upstream.json();
          if(!upstream.ok || result.error) return send(res,400,{error:'Monad rejected the pilot request. Check tracking before retrying.'});
          return send(res,200,{result:result.result});
        }
        return send(res,404,{error:'Unknown pilot endpoint'});
      }
      if (['/api/learning/pool', '/api/learning/proposal'].includes(url.pathname)) {
        const session = await store.read(sid, origin);
        if (!session || session.method !== 'passkey') return send(res, 401, { error: 'Sign in with your Flurbo passkey' });
        if (url.search) return send(res, 400, { error: 'Learning review accepts no query inputs' });
        const operator = Boolean(learningOperatorAccount && session.address === learningOperatorAccount);
        if (url.pathname === '/api/learning/pool') {
          if (req.method !== 'GET') return send(res, 405, { error: 'Pool status is read-only' });
          if (!learningPool) return send(res, 503, { error: 'Learning pool reader unavailable' });
          return send(res, 200, { ...await learningPool.status(), operator });
        }
        if (req.method !== 'POST') return send(res, 405, { error: 'Use explicit proposal preparation' });
        if (!operator) return send(res, 403, { error: 'Learning operator account required' });
        const input = await body(req);
        if (!input || Array.isArray(input) || typeof input !== 'object' || Object.keys(input).length) return send(res, 400, { error: 'This synthetic fixture accepts no custom inputs' });
        if (!learningPool) return send(res, 503, { error: 'Learning pool reader unavailable' });
        return send(res, 200, await learningPool.prepare());
      }
      if (url.pathname === '/api/learning/comparison') {
        if (req.method !== 'GET') return send(res, 405, { error: 'Comparison is read-only' });
        if (!await store.read(sid, origin)) return send(res, 401, { error: 'Sign in to view the comparison' });
        if (url.search) return send(res, 400, { error: 'This comparison accepts no inputs' });
        const learningReport = getLearningReport();
        return learningReport ? send(res, 200, learningReport) : send(res, 503, { error: 'Rust comparison is unavailable on this server. Trading is separate.' });
      }
      if (hosted && url.pathname === '/api/local-wallet-setup') return send(res, 404, { error: 'Local funding is not available on public Monad testnet' });
      if (url.pathname.startsWith('/api/auth/')) {
        if (req.method === 'GET' && url.pathname === '/api/auth/session') return send(res, 200, { session: await store.read(sid, origin) });
        if (req.method !== 'POST') return send(res, 405, { error: 'Method unavailable' });
        if (url.pathname === '/api/auth/challenge') {
          const input = await body(req);
          if (input.method !== undefined && input.method !== 'passkey') return send(res, 400, { error: 'Use your Flurbo passkey to sign in. Extension wallets are for trading after login.' });
          const challenge = await store.challenge(input.address, origin, 'passkey');
          res.setHeader('Set-Cookie', cookie('flurbo_challenge', challenge.id, 300));
          return send(res, 200, { message: challenge.message });
        }
        if (url.pathname === '/api/auth/verify') {
          const input = await body(req);
          const session = await store.verify(cookieValue(req.headers.cookie, 'flurbo_challenge'), input.signature, origin);
          await store.revoke(sid);
          res.setHeader('Set-Cookie', [cookie('flurbo_session', session.sessionId, LOGIN_MS / 1000), cookie('flurbo_challenge', '', 0)]);
          return send(res, 200, { session: { address: session.address, expiresAt: session.expiresAt, method: session.method } });
        }
        if (url.pathname === '/api/auth/logout') {
          await store.revoke(sid);
          res.setHeader('Set-Cookie', [cookie('flurbo_session', '', 0), cookie('flurbo_challenge', '', 0)]);
          return send(res, 200, { session: null });
        }
        return send(res, 404, { error: 'Unknown account endpoint' });
      }
      if (url.pathname === '/api/rpc' && req.method === 'POST') {
        const input = await body(req);
        const market = input.market ?? 'original';
        if (!['original', 'learning'].includes(market)) return send(res, 400, { error: 'Unknown trading market' });
        if (market === 'learning' && (!hosted || !learningDashboardUrl)) return send(res, 503, { error: 'Learning market unavailable' });
        const selectedDashboard = market === 'learning' ? learningDashboardUrl : dashboardUrl;
        const allowed = ['eth_chainId', 'eth_getBlockByNumber', 'eth_call', 'eth_estimateGas', 'eth_gasPrice', 'eth_getTransactionCount', 'eth_getTransactionReceipt', 'eth_getTransactionByHash', 'eth_getBalance', 'eth_sendRawTransaction'];
        if (!allowed.includes(input.method) || !Array.isArray(input.params)) return send(res, 400, { error: 'Unsupported RPC method' });
        if (hosted && !await store.read(sid, origin)) return send(res, 401, { error: 'Sign in before using the account RPC' });
        if (input.method === 'eth_sendRawTransaction') {
          const login = await store.read(sid, origin);
          if (!login) return send(res, 401, { error: 'Sign in before submitting' });
          const serializedTransaction = input.params[0];
          if (typeof serializedTransaction !== 'string' || !/^0x[0-9a-f]+$/i.test(serializedTransaction)) return send(res, 400, { error: 'Invalid signed transaction' });
          const tx = parseTransaction(serializedTransaction);
          const sender = await recoverTransactionAddress({ serializedTransaction });
          const faucet = hosted && tx.to?.toLowerCase() === TESTNET.faucet && tx.data?.toLowerCase() === TESTNET.faucetSelector + login.address.slice(2).padStart(64, '0');
          const deployment = faucet ? Response.json({ environment: 'public_testnet', chain_id: 10143, contracts: { cash: TESTNET.cash } }) : await fetch(`${selectedDashboard}/api/state`, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
          const state = await deployment.json();
          const cash = state.contracts?.cash?.toLowerCase(), pool = state.contracts?.pool?.toLowerCase();
          const selector = tx.data?.slice(0, 10);
          if (!deployment.ok || sender.toLowerCase() !== login.address || tx.chainId !== 10143 || (tx.value ?? 0n) !== 0n || tx.type !== 'legacy' ||
              !tx.gas || tx.gas > 30_000_000n || state.environment !== (hosted ? 'public_testnet' : 'local_fork') ||
              (hosted && (state.chain_id !== 10143 || cash !== TESTNET.cash)) ||
              !faucet && market === 'learning' && (state.market_id !== 'learning' || pool !== learningDeployment.pool) ||
              !faucet && !(market === 'original' && kuruCall({ to: tx.to, data: tx.data, account: login.address, contracts: state.contracts })) && !(tx.to?.toLowerCase() === cash ? validWithdrawal({ to: tx.to, data: tx.data, account: login.address, cash, pool }) || selector === '0x095ea7b3' && tx.data.length === 138 &&
                tx.data.slice(10, 74).toLowerCase() === pool?.slice(2).padStart(64, '0')
                : tx.to?.toLowerCase() === pool && (market === 'learning' ? ['0x3e6b6cde', '0xc39849c5', '0xdf992423'] : ['0x3e6b6cde', '0xc39849c5', '0xb0a52172', '0xf6c4eade', '0xdf992423']).includes(selector))) return send(res, 403, { error: 'Only this account and the configured Monad contracts are supported' });
        }
        const upstream = await fetch(rpcUrl, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: input.method, params: input.params }), signal: AbortSignal.timeout(20_000) });
        const result = await upstream.json();
        if (!upstream.ok || result.error) return send(res, 400, { error: 'Monad rejected the request. Check transaction status before retrying.' });
        return send(res, 200, { result: result.result });
      }
      const readRoutes = ['/api/health', '/api/state', '/api/quote', '/api/transaction', '/api/portfolio', '/api/kuru', '/api/kuru-scan'];
      const learningRoute = url.pathname.startsWith('/api/markets/learning/');
      const readPath = learningRoute ? url.pathname.replace('/api/markets/learning/', '/api/') : url.pathname;
      if (readPath.startsWith('/api/kuru')) {
        if (learningRoute) return send(res, 404, { error: 'Kuru is only available for the original pool' });
        if (!await store.read(sid, origin)) return send(res, 401, { error: 'Sign in to use Kuru' });
      }
      if (readPath === '/api/portfolio' && !await store.read(sid, origin)) return send(res, 401, { error: 'Sign in to view your portfolio' });
      if (learningRoute) {
        if (!hosted || !learningDashboardUrl) return send(res, 503, { error: 'Learning market unavailable' });
        if (!await store.read(sid, origin)) return send(res, 401, { error: 'Sign in to trade on the learning market' });
      }
      const funding = !hosted && req.method === 'POST' && url.pathname === '/api/local-wallet-setup';
      if (!(req.method === 'GET' && readRoutes.includes(readPath)) && !funding) return send(res, 404, { error: 'Unknown workspace endpoint' });
      const input = funding ? await body(req) : undefined;
      const upstream = await fetch(`${learningRoute ? learningDashboardUrl : dashboardUrl}${readPath}${url.search}`, { method: funding ? 'POST' : 'GET', redirect: 'error',
        headers: funding ? { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:18765' } : {},
        body: funding ? JSON.stringify(input) : undefined, signal: AbortSignal.timeout(readPath === '/api/kuru-scan' ? 45_000 : readPath === '/api/kuru' ? 30_000 : 20_000) });
      const result = await upstream.json();
      if (hosted && upstream.ok && ['state', 'quote', 'transaction', 'portfolio', 'kuru', 'kuru-scan'].includes(readPath.split('/').pop()) &&
          (result.environment !== 'public_testnet' || result.chain_id !== 10143 || learningRoute &&
            (result.market_id !== 'learning' || result.contracts?.pool !== learningDeployment.pool || result.contracts?.cash !== TESTNET.cash))) return send(res, 503, { error: 'Public testnet deployment verification required' });
      return send(res, upstream.status, result);
    } catch { return send(res, 503, { error: 'Service unavailable or request rejected. Refresh before retrying. No automatic transaction retry is performed.' }); }
  };
}
