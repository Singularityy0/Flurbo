import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { localApi } from './local-api.mjs';
import { hostedConfig } from './network.mjs';
import { RedisSessionStore, redisCommand } from './redis-session.mjs';
import { runComparison } from './learning-comparison.mjs';
import { learningService, learningRpc, loadLearningModel } from './learning-pool.mjs';
import { pilotEvidence } from './pilot.mjs';
import { configurePilot, configureRehearsal } from './pilot-config.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const security = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=31536000', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
};

export function productionServer(config, store, staticRoot = dist) {
  const api = localApi({ publicOrigin: config.origin, rpcUrl: config.rpcUrl, store, getLearningReport: () => config.learningReport,
    learningPool: config.learningPool, learningOperatorAccount: config.learningOperatorAccount,
    learningDashboardUrl: config.learningDashboardUrl, pilot: config.pilot, rehearsal: config.rehearsal, evidence: config.pilotEvidence });
  return createServer({ requestTimeout: 30_000, headersTimeout: 10_000, maxHeaderSize: 16_384 }, async (req, res) => {
    for (const [key, value] of Object.entries(security)) res.setHeader(key, value);
    // Liveness only. This deliberately does not claim contracts or RPC are ready.
    if (req.url === '/healthz' && req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ service: 'flurbo', chain_state: 'not_checked', learning_comparison: config.learningReport ? 'ready' : config.learningStatus || 'unavailable', learning_pool: config.learningPool ? 'configured' : 'unavailable', learning_model: config.learningModelStatus || 'unavailable', pilot_pool: config.pilot ? 'configured' : 'disabled', pilot_address: config.pilot?.manifest.pool || null, pilot_rules_hash: config.pilot?.manifest.rulesHash || null, rehearsal_pool: config.rehearsal ? 'configured' : 'disabled', rehearsal_address: config.rehearsal?.manifest.pool || null, rehearsal_rules_hash: config.rehearsal?.manifest.rulesHash || null })); return; }
    if (req.headers.host !== new URL(config.origin).host) { res.writeHead(421); res.end('Use https://flurbo.singu.online'); return; }
    if(req.url==='/rehearsal-rules'&&req.method==='GET'){
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
      res.end(JSON.stringify({schema:'flurbo-rehearsal.v1',notice:'Scripted testnet fixtures only. These records do not describe real-world events and must never settle the official release market.',
        fixtures:[{event:'A',result:'YES',exercise:'Unchallenged assertion'},{event:'B',result:'NO',exercise:'Intentionally propose YES, challenge with NO, two reviewers vote NO'},{event:'C',result:null,exercise:'No assertion; finalize VOID after its assertion deadline'}]}));return;
    }
    if (!req.url || req.url.length > 4096) { res.writeHead(414); res.end(); return; }
    await api(req, res, async () => {
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
      try {
        const pathname = new URL(req.url, config.origin).pathname;
        const page = ['/', '/login', '/signup', '/account', '/portfolio', '/history', '/kuru', '/events', '/rehearsal'].includes(pathname);
        if (!page && !/^\/(?:assets\/[a-zA-Z0-9_.-]+|favicon\.svg|robots\.txt)$/.test(pathname)) { res.writeHead(404); res.end('Not found'); return; }
        const file = resolve(staticRoot, page ? 'index.html' : pathname.slice(1));
        if (!(await stat(file)).isFile()) throw new Error('Not a file');
        const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain' }[extname(file)] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': page ? 'no-store' : 'public, max-age=31536000, immutable' });
        res.end(req.method === 'HEAD' ? undefined : await readFile(file));
      } catch { if (!res.headersSent) res.writeHead(404); res.end('Not found'); }
    });
  });
}

async function main() {
  const config = hostedConfig();
  const store = new RedisSessionStore(redisCommand());
  await store.command('PING');
  config.pilotEvidence = pilotEvidence(store.command, config.origin);
  config.pilot = await configurePilot({rpcUrl:config.rpcUrl,command:store.command});
  config.rehearsal = await configureRehearsal({rpcUrl:config.rpcUrl,command:store.command});
  if(config.rehearsal&&config.pilot&&(config.rehearsal.manifest.pool===config.pilot.manifest.pool||config.rehearsal.manifest.resolver===config.pilot.manifest.resolver))throw new Error('Rehearsal and real pilot must be separate');
  const comparison = new AbortController();
  config.learningStatus = 'starting';
  // Do not hold up account/trading access while a sleeping free-tier server warms.
  void runComparison({ signal: comparison.signal }).then(report => {
    config.learningReport = report;
    config.learningStatus = 'ready';
    console.log('Rust comparison ready: fixed synthetic suite; executable pool prices unchanged');
  }).catch(() => {
    config.learningStatus = 'unavailable';
    console.error('Rust comparison unavailable; comparison API disabled, existing trading service continues');
  });
  // Optional operator access is a Mera login identity, separate from the immutable
  // MetaMask updater. Never infer administrator access from a client-supplied wallet.
  const operatorAccount = process.env.FLURBO_LEARNING_OPERATOR_ACCOUNT?.toLowerCase();
  config.learningOperatorAccount = /^0x[0-9a-f]{40}$/.test(operatorAccount || '') && !/^0x0{40}$/.test(operatorAccount) ? operatorAccount : null;
  let learningModel = null;
  try {
    const manifest = JSON.parse(await readFile(resolve(root, 'config/learning-testnet.json'), 'utf8'));
    config.learningPool = learningService({ manifest, rpc: learningRpc(config.rpcUrl), modelReport: () => learningModel });
    config.learningModelStatus = 'starting';
    void loadLearningModel().then(report => { learningModel = report; config.learningModelStatus = 'ready'; }).catch(() => {
      config.learningModelStatus = 'unavailable';
      console.error('Learning fixture unavailable; proposal preparation disabled');
    });
  } catch { console.error('Learning pool configuration unavailable; existing trading continues'); }
  let reader, learningReader;
  if (config.learningPool) {
    config.learningDashboardUrl = 'http://127.0.0.1:18768';
    learningReader = spawn(process.env.PYTHON || 'python3', ['scripts/serve_dashboard.py', '--manifest',
      'config/learning-testnet.json', '--learning-market', '--port', '18768',
      '--provider', process.env.FLURBO_ALCHEMY_TESTNET_RPC_URL ? 'alchemy' : 'public'], { cwd: root, stdio: 'inherit', windowsHide: true });
    learningReader.on('error', () => console.error('Learning market reader could not start; requests will remain unavailable'));
    learningReader.on('exit', () => console.error('Learning market reader stopped; requests will remain unavailable'));
  }
  if (process.env.FLURBO_MANIFEST_JSON) {
    const manifest = JSON.parse(process.env.FLURBO_MANIFEST_JSON);
    if (manifest.environment !== 'public_testnet' || manifest.status !== 'verified_snapshot' || manifest.chain_id !== 10143) throw new Error('Verified public Monad testnet manifest required');
    // The non-secret manifest is supplied through hosting configuration, never
    // copied from a developer's local fork or accepted from an HTTP request.
    const { writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const manifestPath = resolve(tmpdir(), 'flurbo-public-manifest.json');
    await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600 });
    reader = spawn(process.env.PYTHON || 'python3', ['scripts/serve_dashboard.py', '--manifest', manifestPath,
      '--provider', process.env.FLURBO_ALCHEMY_TESTNET_RPC_URL ? 'alchemy' : 'public'], { cwd: root, stdio: 'inherit', windowsHide: true });
    reader.on('error', () => { console.error('Public chain reader could not start'); process.exit(1); });
    reader.on('exit', () => { console.error('Public chain reader stopped'); process.exit(1); });
  }
  const server = productionServer(config, store);
  server.listen(config.port, '0.0.0.0', () => console.log('Flurbo server ready; public trading requires a verified deployment manifest'));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
    comparison.abort();
    server.close(() => process.exit(0)); reader?.kill(); learningReader?.kill();
    setTimeout(() => process.exit(0), 5000).unref();
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(() => { console.error('Hosting startup failed. Check origin, network, Redis and public deployment configuration.'); process.exitCode = 1; });
