import { useEffect, useState, useSyncExternalStore } from 'react';
import { formatUnits } from 'viem';
import * as kuru from '../../web/src/kuru';
import * as learning from '../../web/src/learning/execution';
import { amount } from '../../web/src/portfolio';
import { useRequest } from './hooks';
import { api } from './api';
import { auth } from './runtime';
import { legacyProvider, externalWallet, type WalletKind } from './wallet';
import { operations } from './operations';
import { Button, Card, Choice, Copy, External, Field, Heading, Notice, Title } from './ui';

const actionLabels = { deposit: 'Deposit', withdraw: 'Withdraw', 'limit-buy': 'Limit buy', 'limit-sell': 'Limit sell', 'market-buy': 'Market buy', 'market-sell': 'Market sell', cancel: 'Cancel order', approve: 'Approve deposit' };
export function Kuru({ kind }: { kind: WalletKind }) {
  const login = useSyncExternalStore(auth.subscribe, auth.getSnapshot), wallet = useSyncExternalStore(externalWallet.subscribe, externalWallet.getSnapshot), operation = useSyncExternalStore(operations.subscribe, operations.getSnapshot);
  const owner = wallet.address;
  const data = useRequest<kuru.State>(), review = useRequest<kuru.Review>();
  const [action, setAction] = useState<kuru.Action>({ kind: 'deposit', asset: 'cash', amount: '1', price: '0.45', minOut: '0.4', order: '' });
  const [clock, setClock] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(t); }, []);
  const refresh = (before = '') => owner && void data.run(() => kuru.loadState(owner, before), true);
  useEffect(() => { refresh(); return () => { data.cancel(); review.cancel(); }; }, [owner]);
  useEffect(() => { review.cancel(true); }, [action, owner, kind]);
  return <><Title>Receipt market.</Title><Copy>Trade H Yes receipts from the original pool through Kuru.</Copy><Notice>{data.error}</Notice>
    <Button secondary title="Refresh Kuru" onPress={() => refresh()} />
    {data.value && <Card>{[['Wallet AUSD', data.value.wallet.ausd_atoms], ['Wallet receipts', data.value.wallet.receipt_atoms], ['Available Kuru AUSD', data.value.wallet.margin_available_ausd_atoms], ['Available Kuru receipts', data.value.wallet.margin_available_receipt_atoms]].map(([label, value]) => <Copy key={label}>{label}: {amount(value)}</Copy>)}<Copy small>Available balances exclude funds reserved for open orders. Withdrawal returns available funds to this wallet.</Copy></Card>}
    <Card><Heading>Choose an action</Heading><Choice value={action.kind} options={Object.entries(actionLabels).filter(([v]) => v !== 'approve').map(([value, label]) => ({ value: value as kuru.Action['kind'], label }))} onChange={kind => setAction({ ...action, kind })} />
      <Choice value={action.asset} options={[{ value: 'cash', label: 'AUSD' }, { value: 'receipt', label: 'H Yes receipts' }]} onChange={asset => setAction({ ...action, asset })} />
      {action.kind === 'cancel' ? <Field label="Order ID" value={action.order} onChange={order => setAction({ ...action, order })} numeric /> : <Field label={action.kind === 'market-buy' ? 'AUSD to spend' : 'Amount'} value={action.amount} onChange={amount => setAction({ ...action, amount })} numeric />}
      {action.kind.startsWith('limit') && <Field label="Limit price in AUSD" value={action.price} onChange={price => setAction({ ...action, price })} numeric />}
      {action.kind.startsWith('market') && <Field label="Minimum received after fees" value={action.minOut} onChange={minOut => setAction({ ...action, minOut })} numeric />}
      <Button title={review.busy ? 'Preparing review...' : 'Review action'} disabled={!owner || review.busy || operation.busy || !!operation.pending} onPress={() => void review.run(async () => { const provider = legacyProvider(kind); try { return await kuru.prepare(provider, action, owner!, login.address!); } finally { provider.destroy(); } }, true)} /><Notice>{review.error}</Notice>
    </Card>
    {review.value && <Card><Heading>{actionLabels[review.value.action.kind]}</Heading><Copy>Amount: {review.value.action.amount} {review.value.action.asset === 'cash' ? 'test AUSD' : 'receipts'}</Copy>{review.value.action.kind === 'cancel' && <Copy>Order #{review.value.action.order}</Copy>}
      <Copy>Maximum network fee: {formatUnits(BigInt(review.value.gas) * BigInt(review.value.gasPrice), 18)} test MON</Copy>{review.value.netOut && <Copy>Simulated net received: {amount(review.value.netOut)}</Copy>}
      <Copy small>Approval grants permission only. It does not deposit or trade. Limits and minimum proceeds are rechecked before signing.</Copy>
      <Button title={clock >= review.value.expires ? 'Review expired' : 'Confirm in wallet'} disabled={clock >= review.value.expires || operation.busy || !!operation.pending} onPress={() => void operations.kuru(review.value!, kind, () => review.isCurrent(review.value!))} />
    </Card>}
    {data.value && <><Heading>Open orders</Heading>{data.value.orders.map(o => <Card key={o.id}><Copy>#{o.id} · {o.side} · {amount(o.price_units)} AUSD</Copy><Copy>{amount(o.remaining_atoms)} receipts remaining</Copy><Button secondary title="Select order to cancel" onPress={() => setAction({ ...action, kind: 'cancel', order: o.id })} /></Card>)}
      <Button secondary title="Newest orders" onPress={() => refresh()} />{data.value.orders_page.next_before && <Button secondary title="Older orders" onPress={() => refresh(data.value!.orders_page.next_before!)} />}
      <Heading>Recent activity</Heading>{kuru.events(data.value.activity.logs, data.value.contracts.market, owner ?? '').map((e, i) => <Card key={i}><Copy>{e.name} · Order #{String(e.args.orderId)}</Copy><External title="View receipt" url={`https://testnet.monadscan.com/tx/${e.hash}`} /></Card>)}<Copy small>Recent activity is a bounded block window, not complete history.</Copy></>}
  </>;
}

type LearningPool = { schema: string; pool: string; updater: string; block: string; updates: string; collateralAtoms: string; reserveAtoms: string; covered: boolean; open: boolean; modelReady: boolean; operator: boolean };
export function Learning() {
  const data = useRequest<LearningPool>(), proposal = useRequest<learning.Review>(), comparison = useRequest<any>();
  const operation = useSyncExternalStore(operations.subscribe, operations.getSnapshot), wallet = useSyncExternalStore(externalWallet.subscribe, externalWallet.getSnapshot);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => { void data.run(signal => api('/api/learning/pool', undefined, signal)); const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, []);
  return <><Title>Learning lab.</Title><Copy>A separate testnet pool for funded price updates. A synthetic Rust fixture learns from one A AND B observation. There is no live observation feed or automatic repricing.</Copy>
    <Button secondary title="Refresh pool status" onPress={() => void data.run(signal => api('/api/learning/pool', undefined, signal))} /><Notice>{data.error}</Notice>
    {data.value && <Card><Copy>{data.value.open ? 'Open' : 'Closed'} · {data.value.covered ? 'Covered' : 'Coverage unavailable'}</Copy><Copy>{amount(data.value.collateralAtoms)} test AUSD in pool</Copy><Copy>Reserve: {amount(data.value.reserveAtoms)} test AUSD</Copy><Copy>Updates: {data.value.updates}</Copy><Copy small>{data.value.pool} · Block {data.value.block}</Copy></Card>}
    <Button title="Prepare synthetic proposal" disabled={!data.value?.operator || !data.value?.modelReady || proposal.busy || operation.busy || !!operation.pending} onPress={() => void proposal.run(async signal => { const value = await api<learning.Review>('/api/learning/proposal', {}, signal); learning.validateReview(value); return value; }, true)} /><Notice>{proposal.error}</Notice>
    {proposal.value && <Card><Heading>Review the proposed update</Heading><Copy>Maximum added funding: {amount(proposal.value.fundingAtoms)} test AUSD</Copy><Copy>One A AND B share: {amount(proposal.value.quoteBeforeAtoms)} to {amount(proposal.value.quoteAfterAtoms)} test AUSD</Copy><Copy small>These are quantity quotes, not probabilities. {proposal.value.notice}</Copy><Copy small>Expected revision {proposal.value.snapshot.revision}. Only the configured deployer can sign.</Copy><Copy small>Connected MetaMask: {wallet.address ?? 'Connect in Wallet'}</Copy><Button title={clock / 1000 >= proposal.value.expiresAt ? 'Proposal expired' : 'Confirm proposal in MetaMask'} disabled={!wallet.address || clock / 1000 >= proposal.value.expiresAt || operation.busy || !!operation.pending} onPress={() => void operations.learning(proposal.value!, () => proposal.isCurrent(proposal.value!))} /></Card>}
    <Button secondary title="Load research comparison" disabled={comparison.busy} onPress={() => void comparison.run(async signal => {
      const value = await api<any>('/api/learning/comparison', undefined, signal);
      const scenarios = ['stationary', 'regime_change', 'noisy', 'poison_recovery', 'higher_order'];
      const models = ['pairwise_all', 'pairwise_singles', 'independent_all', 'uniform'];
      if (value.schema !== 'flurbo.learning-comparison.v1' || value.input !== 'synthetic' || value.changesExecutablePrices !== false || !Array.isArray(value.summaries) || value.summaries.length !== 20 || !Number.isFinite(Date.parse(value.generatedAt)) || scenarios.some(scenario => models.some(model => { const rows = value.summaries.filter((r: any) => r.scenario === scenario && r.model === model); return rows.length !== 1 || !Number.isFinite(rows[0].finalMse) || rows[0].finalMse < 0 || rows[0].finalMse > 1; }))) throw new Error('Research comparison could not be verified.');
      return value;
    }, true)} /><Notice>{comparison.error}</Notice>
    {comparison.value?.schema === 'flurbo.learning-comparison.v1' && <Card><Heading>Synthetic research</Heading><Copy small>This comparison does not change executable prices. It does not reproduce historical-data experiments or establish statistical loss guarantees.</Copy>{comparison.value.summaries?.map((row: any, i: number) => <Copy key={i}>{row.scenario} · {row.model}: MSE {Number(row.initialMse).toFixed(4)} to {Number(row.finalMse).toFixed(4)}</Copy>)}</Card>}
  </>;
}
