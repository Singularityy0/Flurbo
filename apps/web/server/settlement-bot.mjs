// Opt-in in-process scheduler for hosts without a reliable free cron, enabled with
// FLURBO_SETTLEMENT_BOT=true. Each cycle runs one monitor pass, then the resolution worker with the
// same bounded drain as `run-resolution.mjs --drain`. Cycles never overlap. Durable state, leases and
// signer journals stay in Redis, so a restart only skips a cycle and a second runner cannot double-act.
const ACTIVE = ['submitted', 'resubmitted', 'confirmed'];

export function settlementBot({ env = process.env, intervalMs = 120_000, firstDelayMs = 30_000, log = console.log,
  monitor = async () => (await import('../scripts/notify-settlement.mjs')).runNotifications({ env, args: [], output: line => log('[settlement-monitor] ' + line) }),
  resolve = async () => (await import('../scripts/run-resolution.mjs')).runResolution(env),
  failure = async error => (await import('../scripts/run-resolution.mjs')).resolutionFailure(error),
  metrics = null, funds = null, sleep = ms => new Promise(done => setTimeout(done, ms)), now = Date.now, schedule = setTimeout, cancel = clearTimeout } = {}) {
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 60_000) throw Error('Settlement cycles must be at least one minute apart');
  let timer = null, stopped = true, running = false;
  const status = { enabled: true, intervalSeconds: intervalMs / 1000, cycles: 0, lastStartedAt: null, lastFinishedAt: null, monitor: 'not_run', worker: 'not_run', metrics: metrics ? 'not_run' : 'disabled', funds: funds ? 'not_run' : 'disabled' };

  async function work() {
    const deadline = now() + 150_000;
    for (let pass = 0; pass < 12; pass++) {
      let result;
      try { result = await resolve(); } catch (error) { const report = await failure(error); log('[settlement-worker] ' + JSON.stringify(report)); return report.code || 'resolution_stopped'; }
      log('[settlement-worker] ' + JSON.stringify(result));
      if (!ACTIVE.includes(result?.status) || now() > deadline) return String(result?.status || 'unknown');
      await sleep(4_000);
    }
    return 'drain_limit';
  }

  async function cycle() {
    if (running || stopped) return;
    running = true; status.cycles++; status.lastStartedAt = new Date(now()).toISOString();
    try {
      if (env.FLURBO_MONITOR_ENABLED === 'true') {
        try { status.monitor = (await monitor()) === 0 ? 'ok' : 'attention'; } catch { status.monitor = 'failed'; log('[settlement-monitor] {"status":"notification_failed"}'); }
      } else status.monitor = 'disabled';
      // Like the scheduled Actions worker, this runs even after a failed monitor pass. The worker
      // itself refuses pools whose monitoring is stale and can still finish healthy ones.
      try { status.worker = env.FLURBO_RESOLUTION_ENABLED === 'true' ? await work() : 'disabled'; } catch { status.worker = 'failed'; }
      // Operator metrics run last, so settlement never waits on them, and a metrics failure never stops settlement.
      if (metrics && !stopped) {
        try { status.metrics = String(await metrics()); } catch { status.metrics = 'failed'; log('[metrics] {"status":"failed"}'); }
      }
      if (funds && !stopped) {
        try { status.funds = String(await funds()); } catch { status.funds = 'failed'; log('[funds] {"status":"failed"}'); }
      }
    } finally {
      running = false; status.lastFinishedAt = new Date(now()).toISOString();
      if (!stopped) timer = schedule(cycle, Math.max(1_000, intervalMs - (Date.parse(status.lastFinishedAt) - Date.parse(status.lastStartedAt))));
    }
  }

  return {
    start() { if (!stopped) return; stopped = false; timer = schedule(cycle, firstDelayMs); },
    stop() { stopped = true; if (timer) cancel(timer); timer = null; },
    status: () => ({ ...status, running }),
  };
}
