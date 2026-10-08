// Kimi supplies an optional hypothesis for Thesis and What If, never settlement truth.
export async function kimiForecast({ manifest, a, b,
  apiKey = process.env.MOONSHOT_API_KEY || process.env.KIMI_API_KEY,
  apiBase = process.env.MOONSHOT_API_BASE || 'https://api.moonshot.ai/v1',
  model = process.env.MOONSHOT_MODEL || 'kimi-k3', fetcher = fetch }) {
  const events = manifest?.publication?.draft?.events;
  if (!Array.isArray(events)) throw new Error('Manifest missing draft events');
  if (!Number.isInteger(a) || !Number.isInteger(b) || a === b || Math.min(a, b) < 0 || Math.max(a, b) >= events.length) throw new Error('Choose two different valid questions');
  if (!apiKey) throw new Error('Kimi is not configured. Set MOONSHOT_API_KEY on the server.');
  if (!/^https:\/\/api\.moonshot\.(ai|cn)\/v1\/?$/.test(apiBase)) throw new Error('Unsupported Kimi API base URL');
  const eventA = events[a], eventB = events[b];
  const titleA = eventA.title || eventA.question || `Question ${a}`;
  const titleB = eventB.title || eventB.question || `Question ${b}`;
  let response;
  try {
    response = await fetcher(`${apiBase.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [
        { role: 'system', content: 'Give a hypothetical forecast, not a fact or trading advice. Return JSON only with pA, pBgivenYes, pBgivenNo as numbers from 0 to 100, and a short rationale. Do not claim to have consulted sources you did not receive.' },
        { role: 'user', content: `Event A: ${titleA}\nEvent B: ${titleB}\nEstimate P(A), P(B given A), and P(B given not A).` }
      ] }), signal: AbortSignal.timeout(12_000) });
  } catch { throw new Error('Kimi API is unavailable. Try again later.'); }
  if (!response.ok) {
    if (response.status === 429) {
      const failure = await response.json().catch(() => ({}));
      if (/insufficient balance/i.test(failure?.error?.message || '')) throw new Error('Kimi account has insufficient API balance. Check billing on platform.kimi.ai.');
      throw new Error('Kimi rate limit reached. Try again later.');
    }
    throw new Error(`Kimi API returned HTTP ${response.status}`);
  }
  let parsed;
  try {
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    parsed = JSON.parse(content?.match(/\{[\s\S]*\}/)?.[0] || '');
  } catch { throw new Error('Kimi returned invalid JSON'); }
  if (![parsed.pA, parsed.pBgivenYes, parsed.pBgivenNo].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100)) throw new Error('Kimi returned probabilities outside 0 to 100');
  return formatResult({ a, b, eventA, eventB, rawA: parsed.pA, rawBgivenYes: parsed.pBgivenYes,
    rawBgivenNo: parsed.pBgivenNo, rationale: String(parsed.rationale || 'Model hypothesis without supporting evidence.').slice(0, 500), model });
}

function formatResult({ a, b, eventA, eventB, rawA, rawBgivenYes, rawBgivenNo, rationale, model }) {
  const pA = Number(rawA.toFixed(1)), pBgivenYes = Number(rawBgivenYes.toFixed(1)), pBgivenNo = Number(rawBgivenNo.toFixed(1));
  const actualJoint = (pA * pBgivenYes) / 10000;
  const pB = (pA * pBgivenYes + (100 - pA) * pBgivenNo) / 10000;
  const minJoint = Math.max(0, pA / 100 + pB - 1), maxJoint = Math.min(pA / 100, pB);
  return { schema: 'flurbo.kimi-forecast.v1', source: 'moonshot-api', model, a, b,
    eventA: { id: eventA.id, title: eventA.title || eventA.question },
    eventB: { id: eventB.id, title: eventB.title || eventB.question },
    forecast: { pA, pBgivenYes, pBgivenNo }, derivedMarginalB: Number((pB * 100).toFixed(1)), rationale,
    frechetBounds: { minJoint: Number(minJoint.toFixed(4)), maxJoint: Number(maxJoint.toFixed(4)),
      actualJoint: Number(actualJoint.toFixed(4)), valid: actualJoint >= minJoint - 1e-6 && actualJoint <= maxJoint + 1e-6 },
    generatedAt: new Date().toISOString() };
}
