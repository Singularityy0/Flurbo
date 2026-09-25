import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { pilotRpc, pilotService } from '../server/pilot.mjs';
import { checkSettlement, monitorIdentity, validateMonitorCheckpoint } from '../server/settlement-monitor.mjs';
import { redisCommand } from '../server/redis-session.mjs';
import { settlementLease } from '../server/settlement-store.mjs';
import { emailConfig, resendDelivery, validateEmailState, queueReport, drainEmails } from '../server/settlement-email.mjs';

export function watchdog(env, request = fetch) {
  const url = env.FLURBO_MONITOR_HEALTHCHECK_URL || '';
  if (!/^https:\/\/hc-ping\.com\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(url)) throw new Error('Configure independent watchdog');
  return async failed => {
    const response = await request(url + (failed ? '/fail' : ''), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error('Watchdog unavailable');
  };
}

export async function notifyPool({ manifest, command, rpc, config, send,
  now = () => Math.floor(Date.now() / 1000), test = false, inspect = checkSettlement }) {
  // Validate static bindings before accepting persisted state or creating an email.
  pilotService({ manifest, rpc, now });
  const identity = monitorIdentity(manifest), lease = await settlementLease(command, identity);
  try {
    let state = await lease.load() ?? { schema: 'flurbo.settlement-mail.v1', identity,
      checkpoint: null, report: null, signature: null, lastQueuedAt: 0, queue: [] };
    validateEmailState(state, identity); validateMonitorCheckpoint(state.checkpoint, manifest);
    if (state.queue.some(item => item.body.from !== config.from || JSON.stringify(item.body.to) !== JSON.stringify(config.to))) {
      throw new Error('Reconcile pending mail before changing recipient or sender');
    }
    let result;
    try { result = await inspect({ manifest, rpc, now, previous: state.checkpoint }); }
    catch {
      result = { checkpoint: state.checkpoint, report: { checkedAt: now(), pool: manifest.pool,
        resolver: manifest.resolver, status: 'check_failed', alerts: [{ code: 'MONITOR_READ_FAILED', severity: 'critical',
          message: 'Chain state could not be verified. Inspect the RPC and resolver manually. Prior observations are not current.' }] } };
    }
    // Five-minute jobs have scheduling jitter. Use a 15-minute hosted gap alarm;
    // the independent watchdog covers a job that never returns at all.
    result.report.alerts = result.report.alerts.filter(a => a.code !== 'CHECK_GAP');
    if (state.checkpoint && now() - state.checkpoint.checkedAt > 900) result.report.alerts.push({
      code: 'HOSTED_CHECK_GAP', severity: 'critical', message: 'Over 15 minutes since the last verified read. Intermediate assertions may have been missed; review chain history manually.',
    });
    if (result.report.status !== 'check_failed') result.report.status = result.report.alerts.some(a => a.severity !== 'info') ? 'attention_required' : 'observed';
    result.report.notice = 'Read-only observation; no transaction submitted. Email delivery state is tracked separately. Neither email acceptance nor this snapshot certifies truth or continuous coverage.';
    state = queueReport(state, result.report, config, now(), { test });
    state.report = result.report; state.checkpoint = result.checkpoint;
    // Observation and pending email are saved atomically before any external send.
    await lease.save(state);
    const delivered = await drainEmails(state, { save: lease.save, renew: lease.renew, send, now });
    return { status: result.report.status, pool: manifest.pool, acceptedEmails: delivered.accepted,
      pendingEmails: delivered.state.queue.length };
  } finally { await lease.release(); }
}

export async function runNotifications({ env = process.env, args = process.argv.slice(2), request = fetch,
  output = console.log, now = () => Math.floor(Date.now() / 1000), inspect = checkSettlement } = {}) {
  let ping;
  try {
    ping = watchdog(env, request);
    if (args.length > 1 || args.length === 1 && args[0] !== '--test-email') throw new Error('Invalid arguments');
    const config = emailConfig(env), command = redisCommand(env, request), send = resendDelivery(config, request);
    const root = fileURLToPath(new URL('../../../', import.meta.url));
    const manifests = [JSON.parse(env.FLURBO_PILOT_MANIFEST_JSON ?? await readFile(resolve(root, 'config/pilot-testnet.json'), 'utf8')),
      JSON.parse(env.FLURBO_REHEARSAL_MANIFEST_JSON || '')];
    if (manifests[0].publication?.mode === 'rehearsal' || manifests[1].publication?.mode !== 'rehearsal'
      || monitorIdentity(manifests[0]) === monitorIdentity(manifests[1])) throw new Error('Configure both distinct pools');
    const extras=env.FLURBO_PRACTICE_COLLECTIONS_JSON?JSON.parse(env.FLURBO_PRACTICE_COLLECTIONS_JSON):[];
    if(!Array.isArray(extras)||extras.length>8)throw Error('Invalid practice collections');
    for(const row of extras){
      if(!row?.manifest||row.manifest.publication?.mode!=='rehearsal'
        ||manifests.some(manifest=>manifest.pool===row.manifest.pool||manifest.resolver===row.manifest.resolver))throw Error('Duplicate or invalid practice collection');
      // Validate every additional manifest before delivering any observations.
      pilotService({manifest:row.manifest,rpc:async()=>{throw Error('No read during configuration');},now});
      manifests.push(row.manifest);
    }
    let failed = false;
    for (const manifest of manifests) {
      try {
        const deadline = AbortSignal.timeout(45_000);
        const rpc = pilotRpc(env.FLURBO_ALCHEMY_TESTNET_RPC_URL || 'https://testnet-rpc.monad.xyz', (url, options) =>
          request(url, { ...options, signal: AbortSignal.any([deadline, options.signal]) }));
        const result = await notifyPool({ manifest, command, rpc, config, send, now, inspect, test: args[0] === '--test-email' });
        output(JSON.stringify(result));
        if (result.status === 'check_failed' || result.pendingEmails > 0) failed = true;
      } catch {
        failed = true; output(JSON.stringify({ status: 'notification_failed', message: 'Inspect RPC, mail, durable state and lease configuration. No transaction submitted; upstream details withheld.' }));
      }
    }
    // Warning/critical resolver alerts are successful monitoring when delivered.
    // Failed reads, unsent notifications or storage errors must not refresh a healthy heartbeat.
    await ping(failed);
    return failed ? 2 : 0;
  } catch {
    if (ping) await ping(true).catch(() => {});
    output(JSON.stringify({ status: 'notification_failed', message: 'Monitor configuration or watchdog failed. Check hosting secrets and service dashboards; sensitive details withheld.' }));
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await runNotifications();
