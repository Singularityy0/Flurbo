// Settlement alarm: wakes the existing GitHub monitor (which then triggers the worker) only when an
// automatic resolver action is due. It holds no signing key, no RPC secret and no Redis credential.
// It reads public chain state and GitHub run history, and its only write is a workflow dispatch.
// Runtime-neutral: no Node built-ins, so the same code can be bundled for a scheduled edge function.
import { decodeFunctionResult, encodeFunctionData, parseAbi } from 'viem';
import { resolverAbi } from '../shared/pilot.mjs';
import { settlementCalendar, dueEntries, nextWake } from '../shared/settlement-calendar.mjs';

export const ALARM_DEFAULTS = Object.freeze({
  minRedispatchSeconds: 600, // Retry cadence while the same due set stays unresolved.
  recoverySeconds: 1800,     // Dispatch anyway when the calendar is unavailable and nothing ran recently.
  maxSkewSeconds: 300,       // A chain snapshot further than this from the alarm clock is stale.
  stuckRunSeconds: 1800,     // An active run older than this is reported as stuck, not duplicated.
});
const ACTIVE = new Set(['queued', 'in_progress', 'waiting', 'requested', 'pending']);
const address = value => /^0x[0-9a-f]{40}$/.test(value);
// Canonical Multicall3 (listed by viem for Monad testnet). The public RPC rate-limits each batched
// call separately, so every read goes through one aggregate3 call at a pinned block.
export const MULTICALL3 = '0xca11bde05977b3631167028862be2a173976ca11';
const multicallAbi = parseAbi(['function aggregate3((address target,bool allowFailure,bytes callData)[] calls) payable returns ((bool success,bytes returnData)[] returnData)']);

// Public subset of verified manifests. Nothing here is secret.
export function alarmConfig(input) {
  const c = { ...ALARM_DEFAULTS, ...input };
  if (!/^[\w.-]+\/[\w.-]+$/.test(c.repository || '') || !/^[\w.-]+\.ya?ml$/.test(c.monitorWorkflow || '')
    || !/^[\w.-]+\.ya?ml$/.test(c.workerWorkflow || '') || !address(String(c.signer).toLowerCase())
    || !Array.isArray(c.pools) || !c.pools.length) throw new Error('Invalid alarm configuration');
  for (const k of Object.keys(ALARM_DEFAULTS)) if (!Number.isSafeInteger(c[k]) || c[k] <= 0) throw new Error('Invalid alarm configuration');
  const pools = c.pools.map(p => {
    if (!address(p.pool) || !address(p.resolver) || !['rehearsal', 'ethereum-activity', 'release'].includes(p.mode)
      || typeof p.evidence !== 'boolean' || !Array.isArray(p.observationEnds) || !p.observationEnds.length
      || p.observationEnds.some(t => !Number.isSafeInteger(t))) throw new Error('Invalid alarm pool');
    return { ...p };
  });
  if (new Set(pools.map(p => p.pool)).size !== pools.length || pools.filter(p => p.evidence).length > 1) throw new Error('Invalid alarm pools');
  return { ...c, signer: c.signer.toLowerCase(), pools };
}

export function alarmPoolsFromManifests(manifests, evidencePool = null) {
  return manifests.map(m => ({
    pool: m.pool.toLowerCase(), resolver: m.resolver.toLowerCase(),
    mode: ['rehearsal', 'ethereum-activity'].includes(m.publication.mode) ? m.publication.mode : 'release',
    evidence: !!evidencePool && m.pool.toLowerCase() === evidencePool.toLowerCase(),
    observationEnds: m.publication.draft.events.map(e => e.observationEndsAt),
  }));
}

// Two requests per tick: the latest block, then one Multicall3 read of every pool at that block.
export function jsonRpc(endpoint, fetcher = fetch) {
  return async (method, params) => {
    const response = await fetcher(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    if (!response.ok) throw new Error('RPC unavailable');
    const body = await response.json();
    if (body?.error || body?.result === undefined) throw new Error('RPC call failed');
    return body.result;
  };
}

export async function readCalendars(config, rpc) {
  const block = await rpc('eth_getBlockByNumber', ['latest', false]);
  if (!block?.number || !block?.timestamp || !block?.hash) throw new Error('Invalid block');
  const calls = [];
  const call = (target, functionName, args = []) => calls.push({ target, functionName, callData: encodeFunctionData({ abi: resolverAbi, functionName, args }) });
  for (const p of config.pools) {
    call(p.resolver, 'delivered');
    p.observationEnds.forEach((_, i) => { call(p.resolver, 'caseState', [i]); call(p.resolver, 'assertionDeadline', [i]); });
  }
  const data = encodeFunctionData({ abi: multicallAbi, functionName: 'aggregate3',
    args: [calls.map(c => ({ target: c.target, allowFailure: false, callData: c.callData }))] });
  const results = decodeFunctionResult({ abi: multicallAbi, functionName: 'aggregate3',
    data: await rpc('eth_call', [{ to: MULTICALL3, data }, block.number]) });
  if (!Array.isArray(results) || results.length !== calls.length || results.some(r => !r.success)) throw new Error('Invalid multicall result');
  const decode = i => decodeFunctionResult({ abi: resolverAbi, functionName: calls[i].functionName, data: results[i].returnData });
  let i = 0;
  const snapshot = { blockNumber: String(BigInt(block.number)), timestamp: Number(BigInt(block.timestamp)) };
  return config.pools.map(p => {
    const delivered = decode(i++);
    const cases = p.observationEnds.map(() => {
      const c = decode(i++), assertionDeadline = String(decode(i++));
      return { phase: Number(c.phase), proposal: Number(c.proposal), asserter: c.asserter, evidenceHash: c.evidenceHash,
        challengeUntil: String(c.challengeUntil), voteUntil: String(c.voteUntil), assertionDeadline };
    });
    const state = { manifest: { pool: p.pool, publication: { mode: p.mode, draft: { events: p.observationEnds.map(t => ({ observationEndsAt: t })) } } },
      snapshot, delivered, cases };
    return settlementCalendar(state, { owner: config.signer, owned: null, evidence: p.evidence });
  });
}

const seconds = iso => Math.floor(Date.parse(iso) / 1000);

// Pure decision. GitHub's workflow concurrency groups remain the hard guarantee against parallel runs
// (at most one running and one pending per group); this only avoids pointless or repeated dispatches.
export function alarmDecision({ now, calendars = null, calendarError = null, runs = null, runsError = null, config }) {
  // Without run history the alarm cannot deduplicate; fail closed. The scheduled workflows remain a backstop.
  if (runsError || !Array.isArray(runs)) return { action: 'skip', reason: 'run-history-unavailable' };
  const active = runs.filter(r => ACTIVE.has(r.status));
  if (active.length) {
    const oldest = Math.min(...active.map(r => seconds(r.created_at)));
    return { action: 'skip', reason: now - oldest > config.stuckRunSeconds ? 'stuck-run' : 'in-flight' };
  }
  const starts = runs.map(r => seconds(r.created_at)).filter(Number.isFinite);
  const lastRun = starts.length ? Math.max(...starts) : null;
  const stale = !calendarError && Array.isArray(calendars)
    && calendars.some(c => Math.abs(now - c.snapshot.timestamp) > config.maxSkewSeconds);
  if (calendarError || !Array.isArray(calendars) || stale) {
    // Recovery: the alarm cannot see what is due, so it wakes the worker at a slow, bounded cadence.
    if (lastRun === null || now - lastRun >= config.recoverySeconds) return { action: 'dispatch', reason: 'recovery', detail: stale ? 'stale-calendar' : 'calendar-unavailable' };
    return { action: 'skip', reason: stale ? 'stale-calendar' : 'calendar-unavailable' };
  }
  const due = calendars.flatMap(c => dueEntries(c, now).map(e => ({ ...e, pool: c.pool })));
  const wake = nextWake(calendars, now);
  if (!due.length) return { action: 'skip', reason: 'idle', nextWake: wake };
  // Dispatch once per change in the due set; while it stays unresolved, retry at most every minRedispatch.
  const newest = Math.max(...due.map(e => e.readyAt));
  // If several runs already saw this due set and it persists, the worker is blocked (monitoring,
  // allowlist, funds). Back off to the recovery cadence instead of burning a run every ten minutes.
  const attempts = starts.filter(t => t >= newest).length;
  const interval = attempts >= 3 ? config.recoverySeconds : config.minRedispatchSeconds;
  if (lastRun !== null && newest <= lastRun && now - lastRun < interval)
    return { action: 'skip', reason: attempts >= 3 ? 'backing-off' : 'recently-dispatched', due, attempts, nextWake: wake };
  return { action: 'dispatch', reason: 'due', due, nextWake: wake };
}

export class GitHubError extends Error { constructor(status) { super('GitHub request failed'); this.status = status; } }

// Least privilege available is repository-wide Actions permission: read to list runs, write to dispatch.
// GitHub cannot scope a token to one workflow. The token never appears in results or errors.
export function githubActions({ repository, token, monitorWorkflow, workerWorkflow, ref = 'main', fetcher = fetch }) {
  const base = `https://api.github.com/repos/${repository}/actions/workflows/`;
  const headers = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'flurbo-settlement-alarm',
    ...(token ? { authorization: `Bearer ${token}` } : {}) };
  const get = async file => {
    const response = await fetcher(`${base}${file}/runs?per_page=10&branch=${ref}`, { headers });
    if (!response.ok) throw new GitHubError(response.status);
    const body = await response.json();
    if (!Array.isArray(body?.workflow_runs)) throw new GitHubError(502);
    return body.workflow_runs.map(r => ({ workflow: file, status: r.status, event: r.event, created_at: r.created_at }));
  };
  return {
    async listRuns() { return [...await get(monitorWorkflow), ...await get(workerWorkflow)]; },
    async dispatch() {
      if (!token) throw new GitHubError(401);
      const response = await fetcher(`${base}${monitorWorkflow}/dispatches`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ ref }) });
      if (response.status !== 204) throw new GitHubError(response.status);
    },
  };
}

export async function alarmTick({ config, rpc, github, now = () => Math.floor(Date.now() / 1000), dispatch = false }) {
  let calendars = null, calendarError = null, runs = null, runsError = null;
  try { calendars = await readCalendars(config, rpc); } catch { calendarError = 'chain-read-failed'; }
  try { runs = await github.listRuns(); } catch (error) { runsError = error instanceof GitHubError ? `github-${error.status}` : 'github-unavailable'; }
  const decision = alarmDecision({ now: now(), calendars, calendarError, runs, runsError, config });
  const summary = { ...decision, checkedAt: now(), ...(calendarError ? { calendarError } : {}), ...(runsError ? { runsError } : {}) };
  if (decision.action !== 'dispatch') return summary;
  if (!dispatch) return { ...summary, action: 'would-dispatch' };
  try { await github.dispatch(); return { ...summary, dispatched: true }; }
  catch (error) {
    const status = error instanceof GitHubError ? error.status : 0;
    // Auth or configuration failures need a person; rate limits and outages retry on the next tick.
    return { ...summary, action: 'dispatch-failed', status, retryable: ![401, 403, 404, 422].includes(status) };
  }
}
