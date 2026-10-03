import React, { useState, useEffect, useSyncExternalStore } from 'react';
import { Linking, View } from 'react-native';
import { readPerplContext, preparePerplDeposit, type PerplContext, type PerplReview, AUSD_TOKEN } from './perpl';
import { externalWallet, legacyProvider, type WalletKind } from './wallet';
import { operations } from './operations';
import { useRequest } from './hooks';
import { Button, Card, Choice, Copy, Field, Heading, Notice, Title } from './ui';

export function PerplTrade({ kind, accessApproved }: { kind: WalletKind; accessApproved: boolean | null }) {
  const wallet = useSyncExternalStore(externalWallet.subscribe, externalWallet.getSnapshot);
  const operation = useSyncExternalStore(operations.subscribe, operations.getSnapshot);
  const owner = wallet.address;

  const contextReq = useRequest<PerplContext>();
  const reviewReq = useRequest<PerplReview>();

  const [selectedMarketId, setSelectedMarketId] = useState<number>(0);
  const [depositAmount, setDepositAmount] = useState('50');
  const [showDeposit, setShowDeposit] = useState(false);

  useEffect(() => {
    void contextReq.run(signal => readPerplContext(AUSD_TOKEN, signal));
  }, []);

  const markets = contextReq.value?.markets ?? [];
  const selectedMarket = markets.find(m => m.id === selectedMarketId) ?? markets[0];

  const handleReviewDeposit = () => {
    if (!owner) return;
    void reviewReq.run(async () => {
      const p = legacyProvider(kind);
      try {
        return await preparePerplDeposit(p, owner, depositAmount);
      } finally {
        p.destroy();
      }
    }, true);
  };

  const handleConfirm = () => {
    if (!reviewReq.value) return;
    void operations.perpl(reviewReq.value, kind, () => reviewReq.isCurrent(reviewReq.value!));
  };

  return (
    <>
      <Title>Perpl Perpetual Trading.</Title>
      <Copy>Decentralized perpetual contracts on Monad testnet collateralized with test AUSD.</Copy>

      {accessApproved === false && (
        <Notice>Your account has requested preview access. Trades require operator approval.</Notice>
      )}

      <Notice>{contextReq.error}</Notice>
      <Button
        secondary
        title={contextReq.busy ? 'Fetching prices...' : 'Refresh Perpl prices'}
        disabled={contextReq.busy}
        onPress={() => void contextReq.run(signal => readPerplContext(AUSD_TOKEN, signal))}
      />

      {markets.length > 0 && (
        <Card>
          <Heading>Choose a perpetual market</Heading>
          <Choice
            value={String(selectedMarket?.id ?? 0)}
            options={markets.slice(0, 5).map(m => ({
              value: String(m.id),
              label: `${m.symbol} (${(m.mark / 10 ** m.decimals).toLocaleString()} AUSD)`
            }))}
            onChange={val => {
              reviewReq.cancel();
              setSelectedMarketId(Number(val));
            }}
          />

          {selectedMarket && (
            <View style={{ marginVertical: 8 }}>
              <Copy>Current mark price: {(selectedMarket.mark / 10 ** selectedMarket.decimals).toLocaleString()} AUSD</Copy>
              <Copy small>Status: {selectedMarket.open ? 'Market open' : 'Market closed'}</Copy>
            </View>
          )}

          <Copy small>Orders require a Perpl API key, an exchange account, and order forwarding permission. Review and trade in the Perpl testnet app.</Copy>
          <Button title="Open Perpl testnet trading" onPress={() => void Linking.openURL('https://testnet.perpl.xyz/')} />
        </Card>
      )}

      <Card>
        <Heading>Open a Perpl account</Heading>
        <Copy small>Account collateral is separate from your Flurbo wallet balance. Read the current minimum from Perpl before approving.</Copy>
        <Button
          secondary
          title={showDeposit ? 'Hide account form' : 'Open account with AUSD'}
          onPress={() => setShowDeposit(!showDeposit)}
        />
        {showDeposit && (
          <View style={{ marginTop: 12 }}>
            <Field
              label="Deposit amount (test AUSD)"
              value={depositAmount}
              onChange={setDepositAmount}
              numeric
            />
            <Button
              title="Review account setup"
              disabled={!owner || reviewReq.busy || operation.busy || !!operation.pending || accessApproved === false}
              onPress={handleReviewDeposit}
            />
          </View>
        )}
      </Card>

      {reviewReq.value && (
        <Card>
          <Heading>
            {reviewReq.value.action === 'approve' ? 'Approve AUSD for account setup' : 'Create Perpl account'}
          </Heading>
          <Copy>Amount: {reviewReq.value.amount} test AUSD</Copy>
          <Copy>Maximum network fee: {reviewReq.value.fee} test MON</Copy>
          <Copy small>Signed directly in your MetaMask wallet. All actions are journaled before signing.</Copy>
          <Button
            title="Confirm in wallet"
            disabled={operation.busy || !!operation.pending || Date.now() >= reviewReq.value.expires}
            onPress={handleConfirm}
          />
        </Card>
      )}
      <Notice>{reviewReq.error}</Notice>
    </>
  );
}
