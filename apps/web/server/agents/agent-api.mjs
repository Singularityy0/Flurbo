import { randomUUID } from 'node:crypto';
import { pilotCall } from '../../shared/pilot.mjs';
import { agentStore, memoryBackend, redisBackend } from './agent-store.mjs';
import { quoteClaims, verifyReceipt, readResolution } from './agent-market.mjs';
import { STRATEGY, DEFAULT_CONFIG, SCHEMAS, FlurboError, assertConfig, candidateClaims, decide, claimKey, parseMarket, parseForecast, parseQuoteResult,
  parsePairAnalytics, parseClaimImplied, decisionToJSON, decisionFromJSON, recordPaperFill, paperFillToJSON, paperFillFromJSON, evaluatePaper, forecastToJSON,
  claimFromJSON, isNamespace, parseAtoms } from '../../../../packages/sdk/src/index.ts';

// Agent routes. Called only after the application's session and invite checks, with the verified login.
// Ownership always comes from that login. Agents never sign: proposals return an unsigned review that
// the user confirms in MetaMask through the existing transaction flow.
class HttpError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }
const fail = (status, message, code) => { throw new HttpError(status, message, code); };
const keysExactly = (input, allowed, required = allowed) => {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !allowed.includes(k)) || required.some(k => !(k in input)))
    fail(400, 'Unexpected request fields.');
  return input;
};
const PROPOSAL_TTL_SECONDS = 300;
const nowSeconds = () => Math.floor(Date.now() / 1000);
const MODES = ['paper', 'approval'];

function configFromInput(raw, maxTrade) {
  const c = keysExactly(raw, ['quantityAtoms', 'slippageBps', 'minEdgeBps', 'minEdgeAtoms', 'maxCostAtoms', 'minEvidence', 'maxEvidenceAgeDays', 'includeSingles', 'paperBudgetAtoms']);
  let config;
  try {
    config = assertConfig({ quantityAtoms: parseAtoms(c.quantityAtoms), slippageBps: c.slippageBps, minEdgeBps: c.minEdgeBps, minEdgeAtoms: parseAtoms(c.minEdgeAtoms),
      maxCostAtoms: parseAtoms(c.maxCostAtoms), minEvidence: c.minEvidence, maxEvidenceAgeDays: c.maxEvidenceAgeDays, includeSingles: c.includeSingles }, maxTrade);
  } catch (e) { fail(400, e instanceof FlurboError ? e.message : 'Invalid strategy settings.'); }
  const paperBudget = parseAtoms(c.paperBudgetAtoms);
  if (paperBudget <= 0n || paperBudget > 10_000_000_000n) fail(400, 'Paper budget must be between 0 and 10,000 test AUSD.');
  return { ...c, quantityAtoms: config.quantityAtoms.toString(), minEdgeAtoms: config.minEdgeAtoms.toString(), maxCostAtoms: config.maxCostAtoms.toString(), paperBudgetAtoms: paperBudget.toString() };
}
const strategyConfig = c => ({ quantityAtoms: BigInt(c.quantityAtoms), slippageBps: c.slippageBps, minEdgeBps: c.minEdgeBps, minEdgeAtoms: BigInt(c.minEdgeAtoms),
  maxCostAtoms: BigInt(c.maxCostAtoms), minEvidence: c.minEvidence, maxEvidenceAgeDays: c.maxEvidenceAgeDays, includeSingles: c.includeSingles });
export const DEFAULT_PROFILE_CONFIG = Object.freeze({ quantityAtoms: DEFAULT_CONFIG.quantityAtoms.toString(), slippageBps: DEFAULT_CONFIG.slippageBps,
  minEdgeBps: DEFAULT_CONFIG.minEdgeBps, minEdgeAtoms: DEFAULT_CONFIG.minEdgeAtoms.toString(), maxCostAtoms: DEFAULT_CONFIG.maxCostAtoms.toString(),
  minEvidence: DEFAULT_CONFIG.minEvidence, maxEvidenceAgeDays: DEFAULT_CONFIG.maxEvidenceAgeDays, includeSingles: DEFAULT_CONFIG.includeSingles, paperBudgetAtoms: '50000000' });

// Proposal status as the user should read it. An expired review with no transaction is shown as expired.
export function proposalView(record, now = nowSeconds()) {
  if (record.status === 'awaiting-approval' && now >= record.review.expiresAt && !record.transactions.some(t => t.status === 'submitted')) return { ...record, status: 'expired' };
  return record;
}

export function agentApi({ command = null, hosted = false, serviceFor, links, rpc, now = nowSeconds }) {
  if (hosted && !command) throw new Error('Durable agent storage is required when hosted');
  const store = agentStore(command ? redisBackend(command) : memoryBackend());
  const service = namespace => {
    if (!isNamespace(namespace)) fail(400, 'Choose a supported market.');
    const s = serviceFor(namespace);
    if (!s) fail(404, 'That market is not available.');
    return s;
  };
  const load = async (account, id) => { const found = await store.get(account, id); if (!found) fail(404, 'Agent not found.'); return found; };
  const linkedOwner = async (account, owner, origin) => {
    if (typeof owner !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(owner)) fail(400, 'Choose a linked MetaMask wallet.');
    const { wallets } = await links.list(account, origin);
    if (!wallets.includes(owner.toLowerCase())) fail(403, 'Link this MetaMask wallet to your Flurbo account first.');
    return owner.toLowerCase();
  };

  async function evaluate(account, id, input) {
    keysExactly(input, ['forecast']);
    const { profile } = await load(account, id);
    if (profile.status !== 'active') fail(409, 'Resume this agent before evaluating.');
    if (!await store.allowEvaluation(account, now() * 1000)) fail(429, 'Evaluation limit reached for this hour. Try later.', 'RATE_LIMITED');
    const svc = service(profile.market.namespace);
    const market = parseMarket(await svc.markets(), profile.market.namespace);
    if (market.pool !== profile.market.pool) fail(409, 'This market no longer matches the agent. Create a new agent.');
    let forecast;
    // The server cannot verify who produced a submitted forecast, so it is always recorded as the user's.
    try { forecast = parseForecast({ ...input.forecast, source: { kind: 'user', name: 'account' } }, { eventCount: market.events.length, pool: market.pool, now: new Date(now() * 1000) }); }
    catch (e) { fail(400, e instanceof FlurboError ? e.message : 'Invalid forecast.'); }
    const config = strategyConfig(profile.config), quotes = new Map();
    const candidates = market.open ? candidateClaims(market, forecast, config) : [];
    if (candidates.length) {
      const snapshot = { blockNumber: market.snapshot.blockNumber.toString(), blockHash: market.snapshot.blockHash, timestamp: market.snapshot.timestamp };
      const results = await quoteClaims({ service: svc, rpc, claims: candidates, quantityAtoms: config.quantityAtoms, snapshot });
      candidates.forEach((claim, i) => quotes.set(claimKey(claim), parseQuoteResult(results[i], market.events.length)));
    }
    let implied = null;
    if (forecast.joint.events.length === 2 && svc.analytics) {
      try { implied = parsePairAnalytics(await svc.analytics({ a: forecast.joint.events[0], b: forecast.joint.events[1] }), market.pool); } catch { implied = null; }
      if (implied && implied.snapshot.blockHash !== market.snapshot.blockHash) implied = { ...implied, stale: true };
    }
    const decision = decide({ market, forecast, config, now: now(), quotes, implied: implied && !implied.stale ? implied : null });
    // Model-implied probability of the proposed claim from the canonical claim analytics. Context for the
    // person approving; the decision itself rests only on the forecast and executable quotes.
    let proposalImplied = null;
    if (decision.proposal && svc.claimAnalytics) {
      try {
        const c = parseClaimImplied(await svc.claimAnalytics({ scope: decision.proposal.claim.scope, mask: decision.proposal.claim.mask.toString() }), market.pool, market.events.length);
        proposalImplied = { marketTenths: c.market, independentTenths: c.independent, differenceTenths: c.difference, sameSnapshot: c.snapshot.blockHash === market.snapshot.blockHash };
      } catch { proposalImplied = null; }
    }
    const record = { id: randomUUID(), kind: 'decision', createdAt: now(), strategy: STRATEGY, forecast: forecastToJSON(forecast),
      decision: decisionToJSON(decision), impliedStale: !!implied?.stale, proposalImplied };
    await store.records(account, id, async list => [[record, ...list], null]);
    return record;
  }

  async function paper(account, id, input) {
    keysExactly(input, ['decisionId']);
    const { profile } = await load(account, id), eventCount = await eventCountFor(profile);
    return store.records(account, id, async list => {
      const source = list.find(r => r.kind === 'decision' && r.id === input.decisionId);
      if (!source) fail(404, 'Decision not found.');
      const fills = list.filter(r => r.kind === 'paper').map(r => paperFillFromJSON(r.fill, eventCount));
      const memory = { fills: async () => fills, add: async () => {} };
      let fill;
      try { fill = await recordPaperFill(memory, decisionFromJSON(source.decision, eventCount), { now: now(), id: randomUUID(), budgetAtoms: BigInt(profile.config.paperBudgetAtoms) }); }
      catch (e) { fail(409, e instanceof FlurboError ? e.message : 'Paper trade rejected.'); }
      const record = { id: fill.id, kind: 'paper', createdAt: now(), decisionId: source.id, fill: paperFillToJSON(fill) };
      return [[record, ...list], record];
    });
  }
  async function eventCountFor(profile) { return service(profile.market.namespace).manifest.publication.draft.events.length; }

  // Prepare the unsigned review through the existing transaction preparation, then prove it still carries
  // the proposed claim, quantity and a limit no worse than the decision allowed.
  async function prepareFor(profile, decision, owner) {
    const svc = service(profile.market.namespace), p = decision.proposal;
    let review;
    try { review = await svc.prepare({ owner, action: 'buy', scope: p.claim.scope, mask: p.claim.mask.toString(), quantity: p.quantityAtoms.toString(), slippageBps: p.slippageBps }); }
    catch (e) { fail(409, /Not enough test AUSD/.test(e?.message) ? 'This wallet does not hold enough test AUSD for this purchase.' : 'The purchase could not be prepared at the current price. Evaluate again.'); }
    const call = pilotCall({ to: review.transaction.to, data: review.transaction.data, manifest: svc.manifest });
    const limit = BigInt(review.amountAtoms);
    if (!call || review.schema !== 'flurbo.pilot-review.v1' || review.transaction.from.toLowerCase() !== owner) fail(503, 'Unexpected transaction review.');
    if (review.action === 'buy') {
      const [scope, mask, quantity, maxCost] = call.args;
      if (call.name !== 'buy' || scope !== p.claim.scope || mask !== p.claim.mask || quantity !== p.quantityAtoms || maxCost !== limit) fail(503, 'The review does not match the proposed claim.');
    } else if (review.action === 'approve') {
      if (call.name !== 'approve' || String(call.args[0]).toLowerCase() !== svc.manifest.pool || call.args[1] !== limit) fail(503, 'Unexpected approval review.');
    } else fail(503, 'Unexpected transaction review.');
    if (limit > p.worstCostAtoms) fail(409, 'The price moved above what this decision allowed. Evaluate again.', 'PRICE_MOVED');
    if (limit > BigInt(profile.config.maxCostAtoms)) fail(409, 'This purchase exceeds the agent budget.');
    return review;
  }

  async function propose(account, id, input, origin) {
    keysExactly(input, ['decisionId', 'owner']);
    const { profile } = await load(account, id);
    if (profile.status !== 'active') fail(409, 'Resume this agent before proposing a trade.');
    if (profile.mode !== 'approval') fail(409, 'This agent is in paper mode. Switch it to approval mode to prepare real trades.');
    const owner = await linkedOwner(account, input.owner, origin), eventCount = await eventCountFor(profile);
    const found = (await load(account, id)).records.find(r => r.kind === 'decision' && r.id === input.decisionId);
    if (!found) fail(404, 'Decision not found.');
    const decision = decisionFromJSON(found.decision, eventCount);
    if (decision.outcome !== 'propose' || !decision.proposal) fail(409, 'This decision abstained. There is nothing to approve.');
    // One live proposal per decision: a confirmed, in-flight or waiting proposal blocks another, so a single
    // decision can never turn into a second purchase. Rejected, failed or expired proposals may be retried.
    const records = (await load(account, id)).records;
    if (records.some(r => r.kind === 'proposal' && r.decisionId === found.id && ['awaiting-approval', 'submitted', 'approval-confirmed', 'confirmed'].includes(proposalView(r, now()).status)))
      fail(409, 'This decision already has a proposal in progress or confirmed. Evaluate again for a new decision.', 'PROPOSAL_EXISTS');
    if (now() >= decision.proposal.quoteExpiresAt + PROPOSAL_TTL_SECONDS) fail(409, 'This decision is too old. Evaluate again.');
    const review = await prepareFor(profile, decision, owner);
    const record = { id: randomUUID(), kind: 'proposal', createdAt: now(), updatedAt: now(), decisionId: found.id, owner, account: account.toLowerCase(),
      claim: found.decision.proposal.claim, quantityAtoms: found.decision.proposal.quantityAtoms, status: 'awaiting-approval', review, transactions: [] };
    return store.records(account, id, async list => [[record, ...list], record]);
  }

  // Proposal lifecycle. Only a verified receipt for the reviewed purchase marks it confirmed.
  async function track(account, id, proposalId, input, origin) {
    const allowed = { refresh: ['action'], submitted: ['action', 'hash'], check: ['action'], rejected: ['action'] };
    if (!input || !allowed[input.action]) fail(400, 'Unknown proposal action.');
    keysExactly(input, allowed[input.action]);
    const { profile, records } = await load(account, id), eventCount = await eventCountFor(profile);
    const current = records.find(r => r.kind === 'proposal' && r.id === proposalId);
    if (!current) fail(404, 'Proposal not found.');
    if (current.account !== account.toLowerCase()) fail(404, 'Proposal not found.');
    let next = { ...current, updatedAt: now() };
    if (input.action === 'refresh') {
      if (current.transactions.some(t => t.status === 'submitted')) fail(409, 'A transaction is still being tracked. Check it before preparing another.');
      if (!['awaiting-approval', 'approval-confirmed', 'rejected', 'expired'].includes(proposalView(current, now()).status)) fail(409, 'This proposal can no longer be refreshed.');
      await linkedOwner(account, current.owner, origin);
      const decision = decisionFromJSON(records.find(r => r.kind === 'decision' && r.id === current.decisionId).decision, eventCount);
      if (now() >= decision.proposal.quoteExpiresAt + PROPOSAL_TTL_SECONDS) fail(409, 'This decision is too old. Evaluate again.');
      next = { ...next, status: 'awaiting-approval', review: await prepareFor(profile, decision, current.owner) };
    } else if (input.action === 'submitted') {
      if (typeof input.hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(input.hash)) fail(400, 'Invalid transaction hash.');
      if (current.transactions.some(t => t.status === 'submitted')) fail(409, 'A transaction is already being tracked for this proposal.');
      if (current.status !== 'awaiting-approval') fail(409, 'This proposal is not waiting for a transaction.');
      next = { ...next, status: 'submitted', transactions: [...current.transactions, { hash: input.hash.toLowerCase(), action: current.review.action, status: 'submitted', review: current.review }] };
    } else if (input.action === 'rejected') {
      if (current.status !== 'awaiting-approval') fail(409, 'Only a waiting proposal can be marked rejected.');
      next = { ...next, status: 'rejected' };
    } else {
      const pending = current.transactions.find(t => t.status === 'submitted');
      if (!pending) return proposalView(current, now());
      let result;
      try { result = await verifyReceipt({ rpc, review: pending.review, hash: pending.hash, manifest: service(profile.market.namespace).manifest }); }
      catch { fail(503, 'The transaction could not be checked. Try again shortly.'); }
      if (['unknown', 'pending', 'confirming'].includes(result.status)) return { ...proposalView(current, now()), check: result.status };
      const tx = { ...pending, status: result.status, blockNumber: result.blockNumber ?? null, paidAtoms: result.paidAtoms ?? null };
      const transactions = current.transactions.map(t => (t.hash === pending.hash ? tx : t));
      const status = result.status === 'confirmed' ? (pending.action === 'buy' ? 'confirmed' : 'approval-confirmed') : 'failed';
      next = { ...next, status, transactions, ...(status === 'failed' ? { failure: result.status === 'mismatch' ? 'The transaction does not match the reviewed purchase.' : 'The transaction reverted on-chain.' } : {}) };
    }
    return store.records(account, id, async list => {
      if (!list.some(r => r.id === proposalId)) fail(404, 'Proposal not found.');
      return [list.map(r => (r.id === proposalId ? next : r)), proposalView(next, now())];
    });
  }

  // Honest accounting. Paper results are simulated; live results cover only confirmed agent-originated
  // purchases, at the cost the receipt shows. Collected payouts belong to the wallet in Portfolio and are
  // not attributed to an agent. Unknown values are null with a reason, never zero.
  async function performance(account, id) {
    const { profile, records } = await load(account, id), svc = service(profile.market.namespace), eventCount = svc.manifest.publication.draft.events.length;
    let resolution = null, resolutionKnown = true;
    try { resolution = await readResolution({ rpc, pool: svc.manifest.pool }); } catch { resolutionKnown = false; }
    const paper = evaluatePaper(records.filter(r => r.kind === 'paper').map(r => paperFillFromJSON(r.fill, eventCount)), { eventCount, resolution });
    if (!resolutionKnown) paper.missing.push('The pool resolution could not be read just now.');
    const confirmed = records.filter(r => r.kind === 'proposal' && r.status === 'confirmed');
    const buys = confirmed.flatMap(r => r.transactions.filter(t => t.action === 'buy' && t.status === 'confirmed'));
    const known = buys.filter(t => t.paidAtoms !== null);
    const live = { mode: 'live', confirmedPurchases: buys.length, costBasisAtoms: known.length === buys.length ? known.reduce((s, t) => s + BigInt(t.paidAtoms), 0n).toString() : null,
      realizedPnlAtoms: null, collectedPayoutAtoms: null,
      missing: [...(known.length !== buys.length ? ['Some purchase costs could not be read from their receipts.'] : []),
        'Collected payouts and realized results are shown per wallet in Portfolio and are not attributed to this agent.'] };
    const s = v => (v === null || v === undefined ? null : v.toString());
    return { schema: 'flurbo.agent-performance.v1', paper: { ...paper, costBasisAtoms: s(paper.costBasisAtoms),
      realized: paper.realized && { count: paper.realized.count, payoutAtoms: s(paper.realized.payoutAtoms), pnlAtoms: s(paper.realized.pnlAtoms) },
      unrealized: paper.unrealized && { count: paper.unrealized.count, valueAtoms: s(paper.unrealized.valueAtoms), pnlAtoms: s(paper.unrealized.pnlAtoms) } }, live };
  }

  async function quote(input) {
    keysExactly(input, ['namespace', 'scope', 'mask', 'quantityAtoms', 'side']);
    const svc = service(input.namespace), eventCount = svc.manifest.publication.draft.events.length;
    let claim, quantity;
    try { claim = claimFromJSON({ chainId: 10143, pool: svc.manifest.pool, scope: input.scope, mask: input.mask }, eventCount); quantity = parseAtoms(input.quantityAtoms); }
    catch (e) { return { status: 'unavailable', reason: 'unsupported_claim', detail: e instanceof FlurboError ? e.message : 'Unsupported claim.' }; }
    if (quantity === 0n || quantity > 100_000_000n) return { status: 'unavailable', reason: 'quantity_limit', detail: 'Quantity must be between one atom and 100 shares.' };
    if (!['buy', 'sell'].includes(input.side)) fail(400, 'Choose buy or sell.');
    return (await quoteClaims({ service: svc, rpc, claims: [claim], quantityAtoms: quantity, side: input.side }))[0];
  }

  function profileFrom(input, existing = null) {
    const name = input.name ?? existing?.name;
    if (typeof name !== 'string' || !/^[\p{L}\p{N} ._-]{3,48}$/u.test(name.trim())) fail(400, 'Use a name of 3 to 48 letters, numbers or spaces.');
    const mode = input.mode ?? existing?.mode;
    if (!MODES.includes(mode)) fail(400, 'Choose paper or approval mode.');
    const status = input.status ?? existing?.status ?? 'active';
    if (!['active', 'paused'].includes(status)) fail(400, 'Choose active or paused.');
    return { name: name.trim(), mode, status };
  }

  const routes = async ({ method, path, input, login, origin }) => {
    const account = login.address.toLowerCase(), parts = path.split('/').slice(3); // ['/', 'api', 'agents', ...]
    if (method === 'GET' && parts.length === 0) return { schema: 'flurbo.agents.v1', durable: store.durable, agents: await store.list(account) };
    if (method === 'POST' && parts.length === 0) {
      keysExactly(input, ['name', 'namespace', 'mode', 'config'], ['name', 'namespace', 'mode']);
      const svc = service(input.namespace), base = profileFrom(input);
      const maxTrade = 100_000_000n;
      const profile = { schema: SCHEMAS.profile, ...base, status: 'active', strategy: STRATEGY, market: { namespace: input.namespace, pool: svc.manifest.pool,
        title: String(svc.manifest.publication.draft.title ?? '') }, config: configFromInput(input.config ?? { ...DEFAULT_PROFILE_CONFIG }, maxTrade), createdAt: now(), updatedAt: now() };
      return store.create(account, profile);
    }
    if (method === 'POST' && parts.length === 1 && parts[0] === 'quote') return quote(input);
    const id = parts[0];
    if (method === 'GET' && parts.length === 1) {
      const { profile, records } = await load(account, id);
      return { profile, records: records.map(r => (r.kind === 'proposal' ? proposalView(r, now()) : r)) };
    }
    if (method !== 'POST') fail(405, 'Method not allowed.');
    if (parts.length === 2 && parts[1] === 'update') {
      keysExactly(input, ['name', 'mode', 'status', 'config'], []);
      const updated = await store.update(account, id, async current => ({ ...current, ...profileFrom(input, current),
        config: input.config ? configFromInput(input.config, 100_000_000n) : current.config, updatedAt: now() }));
      return updated ?? fail(404, 'Agent not found.');
    }
    if (parts.length === 2 && parts[1] === 'delete') { keysExactly(input, []); return (await store.remove(account, id)) ? { deleted: true } : fail(404, 'Agent not found.'); }
    if (parts.length === 2 && parts[1] === 'evaluate') return evaluate(account, id, input);
    if (parts.length === 2 && parts[1] === 'performance') { keysExactly(input, []); return performance(account, id); }
    if (parts.length === 2 && parts[1] === 'paper') return paper(account, id, input);
    if (parts.length === 2 && parts[1] === 'proposal') return propose(account, id, input, origin);
    if (parts.length === 3 && parts[1] === 'proposals') return track(account, id, parts[2], input, origin);
    fail(404, 'Unknown agent endpoint.');
  };

  return {
    durable: store.durable,
    // Returns {status, body}. Unexpected failures are reported without internal detail.
    async handle(request) {
      try { return { status: 200, body: await routes(request) }; }
      catch (e) {
        if (e instanceof HttpError) return { status: e.status, body: { error: e.message, ...(e.code ? { code: e.code } : {}) } };
        if (e?.status === 409) return { status: 409, body: { error: e.message } };
        return { status: 503, body: { error: 'The agent service is temporarily unavailable. Nothing was traded.' } };
      }
    },
  };
}
