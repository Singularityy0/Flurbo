import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { pilotRpc, pilotService } from '../server/pilot.mjs';
import { checkSettlement, monitorIdentity, validateMonitorCheckpoint } from '../server/settlement-monitor.mjs';
import { redisCommand } from '../server/redis-session.mjs';
import { settlementLease } from '../server/settlement-store.mjs';
import { emailConfig, resendDelivery, validateEmailState, queueReport, drainEmails, queueReadFailures, READ_FAILURE_IDENTITY } from '../server/settlement-email.mjs';
import {validateActivityDraft} from '../shared/ethereum-activity.mjs';
import {DETERMINISTIC_MODE} from '../server/settlement-publication.mjs';

export function watchdog(env, request = fetch) {
  const url = env.FLURBO_MONITOR_HEALTHCHECK_URL || '';
  if (!/^https:\/\/hc-ping\.com\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(url)) throw new Error('Configure independent watchdog');
  return async failed => {
    const response = await request(url + (failed ? '/fail' : ''), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error('Watchdog unavailable');
  };
}

// A pool counts as failing only after this many checks in a row could not read the chain, each after retries.
export const READ_FAILURE_THRESHOLD = 2;
const READ_ATTEMPTS = 3;
const pause = ms => new Promise(done => setTimeout(done, ms));

export async function notifyPool({ manifest, command, rpc, config, send,
  now = () => Math.floor(Date.now() / 1000), test = false, inspect = checkSettlement, wait = pause }) {
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
    let result = null;
    for (let attempt = 1; attempt <= READ_ATTEMPTS && !result; attempt++) {
      try { result = await inspect({ manifest, rpc, now, previous: state.checkpoint }); }
      catch { if (attempt < READ_ATTEMPTS) await wait(2_000 * attempt); }
    }
    if (!result) {
      // The checkpoint and the last report stay as they were. Failures are reported once for every pool, by
      // runNotifications, after READ_FAILURE_THRESHOLD checks in a row, so a single RPC hiccup sends nothing.
      state.readFailures = (state.readFailures ?? 0) + 1;
      await lease.save(state);
      const delivered = await drainEmails(state, { save: lease.save, renew: lease.renew, send, now });
      return { status: 'check_failed', pool: manifest.pool, readFailures: state.readFailures,
        acceptedEmails: delivered.accepted, pendingEmails: delivered.state.queue.length };
    }
    state.readFailures = 0;
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

export async function notifyReadFailures({ command, config, send, now, failing }) {
  const lease = await settlementLease(command, READ_FAILURE_IDENTITY);
  try {
    let state = await lease.load() ?? { schema: 'flurbo.settlement-mail.v1', identity: READ_FAILURE_IDENTITY,
      checkpoint: null, report: null, signature: null, lastQueuedAt: 0, queue: [] };
    validateEmailState(state, READ_FAILURE_IDENTITY);
    const next = queueReadFailures(state, failing, config, now());
    if (JSON.stringify(next) !== JSON.stringify(state)) await lease.save(next);
    const delivered = await drainEmails(next, { save: lease.save, renew: lease.renew, send, now });
    return { acceptedEmails: delivered.accepted, pendingEmails: delivered.state.queue.length };
  } finally { await lease.release(); }
}

export async function runNotifications({ env = process.env, args = process.argv.slice(2), request = fetch,
  output = console.log, now = () => Math.floor(Date.now() / 1000), inspect = checkSettlement, wait = pause } = {}) {
  let ping;
  try {
    ping = watchdog(env, request);
    if (args.length > 1 || args.length === 1 && args[0] !== '--test-email') throw new Error('Invalid arguments');
    const config = emailConfig(env), command = redisCommand(env, request), send = resendDelivery(config, request);
    const root = fileURLToPath(new URL('../../../', import.meta.url));
    const manifests = [JSON.parse(env.FLURBO_PILOT_MANIFEST_JSON ?? await readFile(resolve(root, 'config/pilot-testnet.json'), 'utf8'))];
    if (['rehearsal','ethereum-activity',DETERMINISTIC_MODE].includes(manifests[0].publication?.mode)) throw new Error('Configure the release pilot pool');
    const extras=env.FLURBO_PRACTICE_COLLECTIONS_JSON?JSON.parse(env.FLURBO_PRACTICE_COLLECTIONS_JSON):[];
    if(!Array.isArray(extras)||extras.length>8)throw Error('Invalid practice collections');
    for(const row of extras){
      if(!row?.manifest||!['rehearsal','ethereum-activity',DETERMINISTIC_MODE].includes(row.manifest.publication?.mode)
        ||manifests.some(manifest=>manifest.pool===row.manifest.pool||manifest.resolver===row.manifest.resolver))throw Error('Duplicate or invalid practice collection');
      // Validate every additional manifest before delivering any observations.
      pilotService({manifest:row.manifest,rpc:async()=>{throw Error('No read during configuration');},now});
      if(row.manifest.publication.mode==='ethereum-activity')validateActivityDraft(row.manifest.publication.draft);
      manifests.push(row.manifest);
    }
    let failed = false;
    const failing = [];
    for (const manifest of manifests) {
      try {
        const deadline = AbortSignal.timeout(45_000);
        const rpc = pilotRpc(env.FLURBO_ALCHEMY_TESTNET_RPC_URL || 'https://testnet-rpc.monad.xyz', (url, options) =>
          request(url, { ...options, signal: AbortSignal.any([deadline, options.signal]) }));
        const result = await notifyPool({ manifest, command, rpc, config, send, now, inspect, wait, test: args[0] === '--test-email' });
        output(JSON.stringify(result));
        if (result.pendingEmails > 0) failed = true;
        if (result.status === 'check_failed') {
          if (result.readFailures >= READ_FAILURE_THRESHOLD) failing.push({ pool: manifest.pool, readFailures: result.readFailures });
        }
      } catch {
        failed = true; output(JSON.stringify({ status: 'notification_failed', message: 'Inspect RPC, mail, durable state and lease configuration. No transaction submitted; upstream details withheld.' }));
      }
    }
    // One email for every pool whose reads keep failing, and one when they recover.
    try {
      const mail = await notifyReadFailures({ command, config, send, now, failing });
      if (mail.pendingEmails > 0) failed = true;
    } catch {
      failed = true; output(JSON.stringify({ status: 'notification_failed', message: 'Read failure notice could not be stored or sent; details withheld.' }));
    }
    if (failing.length) failed = true;
    // Warning/critical resolver alerts are successful monitoring when delivered. Reads failing on consecutive
    // checks, unsent notifications or storage errors must not refresh a healthy heartbeat; a single failed
    // check (after retries) is retried next cycle without paging anyone.
    await ping(failed);
    return failed ? 2 : 0;
  } catch {
    if (ping) await ping(true).catch(() => {});
    output(JSON.stringify({ status: 'notification_failed', message: 'Monitor configuration or watchdog failed. Check hosting secrets and service dashboards; sensitive details withheld.' }));
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await runNotifications();
