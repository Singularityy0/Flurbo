import { useEffect, useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { formatUnits } from 'viem';
import { pilotRequest, validatePilotReview, type PilotNamespace, type PilotState, type PilotReview } from '../../web/src/pilot';
import { amount, describeClaimAnswers } from '../../web/src/portfolio';
import { auth, storage } from './runtime';
import { externalWallet, type WalletKind } from './wallet';
import { transactions } from './transactions';
import { makeClaim, quantityAtoms } from './market-model';
import { useRequest } from './hooks';
import { Button, Card, Choice, Copy, Field, Heading, Notice, Title, s } from './ui';

export type MarketList = Pick<PilotState, 'manifest' | 'snapshot'> & { open: boolean; prices: { event: number; yes: string | null; no: string | null }[] };
export function Markets({ namespace, kind, onPortfolio }: { namespace: PilotNamespace; kind: WalletKind; onPortfolio: () => void }) {
  const data = useRequest<MarketList>(), quote = useRequest<PilotReview>();
  const login = useSyncExternalStore(auth.subscribe, auth.getSnapshot), wallet = useSyncExternalStore(externalWallet.subscribe, externalWallet.getSnapshot);
  const tx = useSyncExternalStore(transactions.subscribe, transactions.getSnapshot);
  const owner = wallet.address;
  const [search, setSearch] = useState(''), [answers, setAnswers] = useState<Record<number, boolean>>({}), [mode, setMode] = useState<'all' | 'any'>('all');
  const [quantity, setQuantity] = useState('1'), [side, setSide] = useState<'buy' | 'sell' | 'redeem'>('buy'), [error, setError] = useState('');
  const [clock, setClock] = useState(Date.now()), [rules, setRules] = useState(false);
  const key = `flurbo.mobile.checkout:${namespace}:${login.address}`;
  useEffect(() => {
    try { const saved = JSON.parse(storage.getItem(key) ?? 'null'); if (saved) { makeClaim(saved.answers, saved.mode); quantityAtoms(saved.quantity); setAnswers(saved.answers); setQuantity(saved.quantity); setMode(saved.mode === 'any' ? 'any' : 'all'); } else setAnswers({}); } catch { setAnswers({}); }
    void data.run(signal => pilotRequest('markets', undefined, namespace, signal), true);
    return () => { data.cancel(); quote.cancel(); };
  }, [namespace, login.address]);
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    quote.cancel(true); setError('');
    try { storage.setItem(key, JSON.stringify({ answers, quantity, mode })); } catch { setError('Cannot save this purchase. Restart the app before trading.'); }
    if (!owner || !Object.keys(answers).length || tx.pending) return;
    const timer = setTimeout(() => {
      void quote.run(async signal => {
        const { scope, mask } = makeClaim(answers, mode), units = quantityAtoms(quantity);
        const input = { owner, action: side, scope, mask, quantity: units, slippageBps: 50 };
        const result = await pilotRequest<PilotReview>('prepare', input, namespace, signal);
        validatePilotReview(result);
        if (result.requested.owner.toLowerCase() !== owner.toLowerCase() || result.requested.scope !== scope || result.requested.mask !== mask || result.requested.quantity !== units || result.requested.action !== side || result.manifest.pool !== data.value?.manifest.pool) throw new Error('Price differs from your selection. Refresh before trading.');
        return result;
      }, true);
    }, 400);
    return () => { clearTimeout(timer); quote.cancel(); };
  }, [answers, mode, quantity, side, owner, namespace, data.value?.manifest.pool, tx.pending]);
  const events = data.value?.manifest.publication.draft.events ?? [];
  const names = Object.keys(answers).map(Number).sort((a, b) => a - b).map(i => events[i]?.question).join(' + ');
  let label = ''; try { const c = makeClaim(answers, mode); label = describeClaimAnswers(c.scope, Number(c.mask)); } catch { /* Empty selection. */ }
  function select(event: number, yes: boolean) {
    if (tx.busy) return;
    if (!(event in answers) && Object.keys(answers).length >= 3) { setError('Choose up to three questions for one prediction.'); return; }
    setAnswers(previous => ({ ...previous, [event]: yes }));
  }
  async function confirm() {
    if (!quote.value || quote.busy) return;
    const reviewed = quote.value;
    try { await transactions.submit(reviewed, namespace, kind, () => quote.isCurrent(reviewed)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not submit. Check wallet activity.'); }
  }
  return <>
    <Title>What happens next?</Title><Copy>Pick a question. Choose Yes or No. Combine up to three answers into one prediction.</Copy>
    <Field label="Find a market" value={search} onChange={setSearch} />
    <Button secondary title={data.busy ? 'Stop loading markets' : 'Refresh prices'} onPress={() => data.busy ? data.cancel() : void data.run(signal => pilotRequest('markets', undefined, namespace, signal))} />
    <Notice>{data.error}</Notice>
    {events.map((event, i) => event.question.toLowerCase().includes(search.toLowerCase()) && <Card key={event.id}>
      <Copy small>{namespace === 'rehearsal' ? 'PRACTICE' : 'RELEASE EVENT'} · {data.value?.open ? 'Open' : 'Trading closed'}</Copy><Heading>{event.question}</Heading>
      <Copy small>Closes {new Date(Number(data.value!.manifest.publication.draft.closesAt) * 1000).toLocaleString()}</Copy>
      <View style={s.row}>{[true, false].map(yes => { const price = data.value?.prices.find(p => p.event === i)?.[yes ? 'yes' : 'no']; return <Button key={String(yes)} disabled={tx.busy} secondary={answers[i] !== yes} title={`${yes ? 'Yes' : 'No'}${price == null ? '' : ` · ${amount(price)} AUSD`}`} onPress={() => select(i, yes)} />; })}</View>
      {i in answers && <Button secondary title="Remove from prediction" disabled={tx.busy} onPress={() => setAnswers(old => { const next = { ...old }; delete next[i]; return next; })} />}
    </Card>)}
    <Copy small>Prices are costs for one share, not probabilities. Test assets only. {namespace === 'rehearsal' ? 'Practice outcomes are scripted.' : 'Read the published event rules before trading.'}</Copy>
    {!!Object.keys(answers).length && <Card><Heading>Your prediction</Heading><Copy>{names}</Copy><Copy small>{label}</Copy>
      {Object.keys(answers).length > 1 && <Choice value={mode} options={[{ value: 'all', label: 'All happen (AND)' }, { value: 'any', label: 'At least one (OR)' }]} onChange={setMode} />}
      <Choice value={side} options={[{ value: 'buy', label: 'Buy' }, { value: 'sell', label: 'Sell' }, { value: 'redeem', label: 'Claim payout' }]} onChange={setSide} />
      <Field label="Shares" value={quantity} onChange={setQuantity} numeric />
      <Copy small>Trading with MetaMask: {owner ?? 'connect your wallet in Wallet'}</Copy>
      {!owner && <Button title={wallet.busy ? 'Opening MetaMask...' : 'Connect MetaMask'} disabled={wallet.busy} onPress={() => void externalWallet.connect()} />}
      <Notice>{wallet.error || error || quote.error}</Notice>
      {quote.busy && <Copy>Reading a price for this prediction...</Copy>}
      {quote.value && <><Heading>{quote.value.title}</Heading><Copy>{quote.value.action === 'approve' ? 'Allowance required: ' : side === 'sell' ? 'Minimum received: ' : 'Maximum test AUSD: '}{amount(side === 'sell' ? quote.value.minimumReceivedAtoms : quote.value.amountAtoms)}</Copy>
        <Copy small>Maximum network fee: {formatUnits(BigInt(quote.value.maximumFeeWei), 18)} test MON. Slippage limit: 0.5%.</Copy>
        <Copy small>{quote.value.notice}</Copy>
        {clock / 1000 >= quote.value.expiresAt ? <Notice>Price expired. Change the quantity or refresh this selection before confirming.</Notice> : <Button title={tx.busy ? 'Checking transaction...' : quote.value.action === 'approve' ? 'Approve AUSD in wallet' : `Confirm ${side === 'redeem' ? 'payout' : side} in wallet`} disabled={quote.busy || tx.busy || !!tx.pending} onPress={() => void confirm()} />}
        {quote.value.action === 'approve' && <Copy small>Approval allows the pool to use this amount. It does not buy shares. A fresh purchase confirmation follows.</Copy>}
      </>}

      <Button title="View portfolio" secondary onPress={onPortfolio} />
    </Card>}
    <Button secondary title={rules ? 'Hide market rules' : 'Read market rules'} onPress={() => setRules(!rules)} />
    {rules && events.map(event => <Card key={event.id}><Heading>{event.question}</Heading><Copy>Yes: {event.yesRule}</Copy><Copy>No: {event.noRule}</Copy><Copy small>Observation ends {new Date(Number(event.observationEndsAt) * 1000).toLocaleString()}</Copy></Card>)}
  </>;
}
