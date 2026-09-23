import { address, assertContext, prepare, prepareRedemption, prepareConversion, sendReviewed, reconcile, setupLocalWallet, walletMessage, WalletError } from './wallet.mjs';
import { formatUnits, parseUnits, snapshotFresh } from './claims.mjs';

const KEY = 'flurbo.local.pending.v1';
const $ = id => document.getElementById(id);
const text = (id, message) => { $(id).textContent = message; };
const hashOK = hash => /^0x[0-9a-fA-F]{64}$/.test(hash);

export function mountTrading(hooks) {
  const providers = [];
  let provider, account = null, review = null, operation = false, checking = false, generation = 0, pending = null, lastHash = '';
  let removeListeners = () => {};
  function conversionQuantity() {
    try { return parseUnits($('conversion-quantity').value.trim()); } catch { return null; }
  }
  function persist(value) {
    try {
      if (value) sessionStorage.setItem(KEY, JSON.stringify(value)); else sessionStorage.removeItem(KEY);
    } catch { throw new WalletError('Browser session storage is unavailable. Submission is blocked to avoid losing transaction tracking.'); }
    pending = value;
  }
  try {
    const saved = sessionStorage.getItem(KEY);
    if (saved) {
      pending = JSON.parse(saved);
      if (!pending?.plan?.tx?.data || !pending.plan.account || (pending.hash && !hashOK(pending.hash))) throw new Error();
      text('execution-status', pending.hash ? 'Restored submitted transaction. Checking canonical receipt…' : 'A wallet request was interrupted. Check your wallet before doing anything else. Do not submit a duplicate.');
    }
  } catch {
    // Keep a lock for an unreadable record rather than silently allowing a duplicate submission.
    pending = { plan: null, hash: null };
    text('execution-status', 'Saved transaction tracking is unreadable. Check your wallet, then clear tracking explicitly.');
  }
  function update() {
    const locked = operation || Boolean(pending);
    const quote = hooks.getQuote()?.quote;
    const side = quote?.side === 'sell' ? 'sell' : 'buy';
    const state = hooks.getState?.(), selection = hooks.getSelection?.();
    const conversionQty = conversionQuantity();
    const connectedWallet = account && state?.wallet?.address === account ? state.wallet : null;
    const internalH = connectedWallet?.positions.find(p => p.scope === 128 && p.mask === 2)?.quantity_atoms;
    const canConvert = !locked && connectedWallet && state.conversion_available && snapshotFresh(state.snapshot) && conversionQty;
    $('review-wrap').disabled = !canConvert || internalH === undefined || BigInt(internalH) < BigInt(conversionQty);
    $('review-unwrap').disabled = !canConvert || BigInt(connectedWallet.receipt_atoms) < BigInt(conversionQty);
    $('conversion-quantity').disabled = locked;
    text('conversion-status', !connectedWallet ? 'Connect your wallet to view convertible H YES balances.'
      : !conversionQty ? 'Enter a positive conversion quantity with up to six decimal places.'
      : `H YES in pool: ${formatUnits(internalH)} · Receipts in wallet: ${formatUnits(connectedWallet.receipt_atoms)}. ${!state.conversion_available || !snapshotFresh(state.snapshot) ? 'Conversion unavailable; refresh and check receipt backing.' : 'Only wallet receipts can be unwrapped; Kuru margin is excluded.'}`);
    const owned = state?.wallet?.address === account ? state.wallet.positions.find(p => p.scope === selection?.scope && p.mask === selection?.mask) : null;
    const resolved = state?.pool?.resolved;
    text('settlement-status', !state ? 'Settlement data unavailable.' : !resolved
      ? (state.pool.phase === 'closed' ? 'Trading has closed. Awaiting the resolver’s outcome; redemption is not available yet.' : 'Market open. Payouts become redeemable after close and resolution.')
      : `Resolved: ${state.cluster.events.map(e => `${String.fromCharCode(65 + e.index)} ${state.pool.resolved_state & (1 << e.index) ? 'YES' : 'NO'}`).join(' · ')}. ${owned ? `${selection.label || 'Selected claim'}: ${owned.settlement}; ${formatUnits(owned.redeemable_atoms)} AUSD redeemable across your held units.` : 'Connect your wallet and select a held claim.'}`);
    $('review-redeem').disabled = locked || !account || !selection || !state?.redemption_available || !snapshotFresh(state.snapshot) || !owned || BigInt(owned.quantity_atoms) < BigInt(selection.quantity) || BigInt(selection.quantity) <= 0n;
    text('review-redeem', owned?.settlement === 'losing' ? 'Review clearing losing units (0 AUSD)' : 'Review redeem winnings');
    text('review-trade', quote ? `Review ${side} →` : 'Get a quote to review');
    text('execution-help', !account ? 'Connect your test wallet, then get a pool quote.'
      : resolved ? 'Trading has ended. Select your claim and quantity, then review redemption below.'
      : !quote ? 'Wallet connected. Get a fresh pool quote to enable the buy or sell review.'
      : review ? 'Click the confirmation button below to open MetaMask.'
      : `Click Review ${side} to check funding and show the confirmation button. Reviewing does not open MetaMask; confirming does.`);
    $('execution-help').hidden = locked;
    $('connect-wallet').disabled = locked || providers.length === 0 || Boolean(account);
    $('setup-wallet').disabled = locked || providers.length === 0;
    $('disconnect-wallet').disabled = locked || !account;
    $('wallet-provider').disabled = locked || Boolean(account) || providers.length === 0;
    $('review-trade').disabled = locked || !account || !hooks.getQuote()?.quote;
    $('confirm-trade').disabled = locked || !review || Date.now() / 1000 >= review.quoteExpiry;
    $('confirm-trade').hidden = !review;
    $('cancel-review').hidden = !review;
    $('cancel-review').disabled = locked;
    $('slippage').disabled = locked;
    $('clear-tracking').hidden = !pending;
    $('check-execution').hidden = !pending;
    $('check-execution').disabled = operation || checking;
    $('clear-tracking').disabled = operation || checking;
    $('replacement-area').hidden = !pending;
    $('execution-hash').textContent = pending?.hash || lastHash;
    $('review-details').hidden = !review;
    if (review && Date.now() / 1000 >= review.quoteExpiry && !operation) invalidate('Review expired. Request another quote.');
  }
  function invalidate(message) {
    ++generation; review = null;
    $('review-details').replaceChildren();
    if (message && !pending && !operation) text('execution-status', message);
    update();
  }
  function disconnect(message = 'Wallet disconnected from this page. Wallet permissions are unchanged.') {
    removeListeners(); account = null; provider = null;
    invalidate(); text('signer-status', message); hooks.accountChanged(null); update();
  }
  function addProvider(candidate, name) {
    if (!candidate || typeof candidate.request !== 'function' || typeof candidate.on !== 'function' || typeof candidate.removeListener !== 'function' || providers.some(p => p.provider === candidate) || providers.length >= 10) return;
    const option = document.createElement('option'); option.value = String(providers.length);
    option.textContent = typeof name === 'string' ? name.slice(0, 80) : 'Browser wallet';
    if (providers.length === 0) $('wallet-provider').replaceChildren();
    providers.push({ provider: candidate }); $('wallet-provider').append(option);
    if (providers.length === 1) $('wallet-provider').value = '0';
    if (!account) text('signer-status', 'Select a browser wallet and connect your dedicated local test account.');
    update();
  }
  window.addEventListener('eip6963:announceProvider', event => addProvider(event.detail?.provider, event.detail?.info?.name));
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  addProvider(window.ethereum, 'Browser wallet (injected)');
  if (!providers.length) text('signer-status', 'No browser wallet detected. Open this URL in a desktop browser with your wallet extension, then reload. The in-app browser may not provide a wallet.');

  function connected(selected, candidate) {
    removeListeners(); provider = selected; account = candidate;
    const changed = () => disconnect('Wallet account or network changed. Reconnect and review again. Any open wallet request must be handled in the wallet.');
    for (const name of ['accountsChanged', 'chainChanged', 'disconnect']) selected.on(name, changed);
    removeListeners = () => { for (const name of ['accountsChanged', 'chainChanged', 'disconnect']) selected.removeListener(name, changed); };
    text('signer-status', `Connected ${account} · local fork verified`);
    hooks.accountChanged(account);
  }
  $('setup-wallet').addEventListener('click', async () => {
    if (operation || pending) return;
    const selected = providers[Number($('wallet-provider').value)]?.provider;
    if (!selected) return;
    disconnect('Setting up your selected test account…');
    operation = true; update();
    text('setup-status', 'Approve account/network prompts in MetaMask. Verifying the local fork before topping up test balances…');
    try {
      const owner = await setupLocalWallet(selected, hooks);
      connected(selected, owner);
      text('setup-status', 'Ready: local fork verified, with at least 10 local test AUSD and 10 local MON. Request a quote to begin.');
    } catch (error) { text('setup-status', walletMessage(error)); }
    finally { operation = false; update(); }
  });

  $('connect-wallet').addEventListener('click', async () => {
    operation = true; update();
    try {
      const selected = providers[Number($('wallet-provider').value)]?.provider;
      if (!selected) throw new WalletError('Select an available wallet.');
      const accounts = await selected.request({ method: 'eth_requestAccounts' });
      if (!Array.isArray(accounts) || !accounts.length) throw new WalletError('No account was authorized.');
      const candidate = address(accounts[0]);
      const state = await hooks.readSnapshot(candidate);
      await assertContext(selected, state, candidate);
      connected(selected, candidate);
    } catch (error) { text('signer-status', walletMessage(error)); }
    finally { operation = false; update(); }
  });
  $('disconnect-wallet').addEventListener('click', () => disconnect());
  $('slippage').addEventListener('change', () => invalidate('Slippage changed. Review again.'));
  $('cancel-review').addEventListener('click', () => invalidate('Review cancelled. Nothing submitted.'));
  $('conversion-quantity').addEventListener('input', () => invalidate('Conversion quantity changed. Review again.'));
  for (const kind of ['wrap', 'unwrap']) $('review-' + kind).addEventListener('click', async () => {
    const quantity = conversionQuantity();
    if (!provider || !account || !quantity || pending || operation) return;
    const current = ++generation, signer = provider, owner = account;
    review = null; operation = true; update(); text('execution-status', 'Checking H YES holdings, canonical receipt and gas…');
    try {
      const state = await hooks.readSnapshot(owner, { scope: 128, mask: 2 });
      const plan = await prepareConversion(signer, state, kind, owner, quantity);
      if (current !== generation || signer !== provider || owner !== account) throw new WalletError('Inputs or wallet changed. Review again.');
      review = plan;
      const amount = formatUnits(plan.quantity);
      const lines = [kind === 'wrap' ? `Wrap ${amount} internal H YES units into ${amount} wallet receipts.` : `Burn ${amount} wallet receipts to restore ${amount} internal H YES units.`,
        `From: ${plan.account}`, `Pool: ${plan.pool}`, `Canonical H YES receipt: ${plan.receipt}`,
        'No AUSD is spent or paid. No token approval or Kuru order is submitted.',
        `Proposed gas budget: ${formatUnits(plan.gasBudget, 18)} MON. Review any wallet edits.`,
        'This review expires within 30 seconds. The conversion contract has no transaction deadline.'];
      $('review-details').replaceChildren(...lines.map(line => { const p = document.createElement('p'); p.textContent = line; return p; }));
      $('confirm-trade').textContent = `Confirm ${kind} in wallet`;
      text('execution-status', 'Review the conversion, then click the confirmation button to open your wallet.');
    } catch (error) { text('execution-status', walletMessage(error)); }
    finally { operation = false; update(); }
  });
  $('review-redeem').addEventListener('click', async () => {
    const selection = hooks.getSelection?.();
    if (!provider || !account || !selection || pending || operation) return;
    const current = ++generation, signer = provider, owner = account;
    review = null; operation = true; update(); text('execution-status', 'Checking settlement, ownership, payout and gas…');
    try {
      const state = await hooks.readSnapshot(owner, selection);
      const plan = await prepareRedemption(signer, state, selection, owner, selection.quantity);
      if (current !== generation || signer !== provider || owner !== account) throw new WalletError('Inputs or wallet changed. Review again.');
      review = plan;
      const lines = [`${plan.payout === '0' ? 'Clear losing' : 'Redeem winning'} units: ${formatUnits(plan.quantity)} · ${selection.label || `scope ${plan.scope}, mask ${plan.mask}`}`,
        `From: ${plan.account}`, `Contract: ${plan.pool}`, `Exact payout: ${formatUnits(plan.payout)} AUSD. These internal claim units will be burned.`,
        plan.payout === '0' ? 'This losing claim pays zero. Clearing it is optional and costs gas.' : 'Redemption pays the settled outcome; no token spending approval is needed.',
        `Proposed gas budget: ${formatUnits(plan.gasBudget, 18)} MON. Review any wallet edits.`,
        'The review expires in 30 seconds or sooner. The redemption contract has no transaction deadline.'];
      $('review-details').replaceChildren(...lines.map(line => { const p = document.createElement('p'); p.textContent = line; return p; }));
      $('confirm-trade').textContent = plan.payout === '0' ? 'Confirm clearing for 0 AUSD in wallet' : 'Redeem winnings in wallet';
      text('execution-status', 'Review the payout and units, then click the confirmation button to open your wallet.');
    } catch (error) { text('execution-status', walletMessage(error)); }
    finally { operation = false; update(); }
  });
  $('review-trade').addEventListener('click', async () => {
    const quoted = hooks.getQuote();
    if (!provider || !account || !quoted?.quote || pending || operation) return;
    const current = ++generation, signer = provider, owner = account;
    review = null; operation = true; update(); text('execution-status', 'Checking account, local fork, balances, allowance and gas…');
    try {
      const state = await hooks.readSnapshot(owner, quoted.quote);
      const plan = await prepare(signer, state, quoted, owner, Number($('slippage').value));
      if (current !== generation || signer !== provider || owner !== account) throw new WalletError('Inputs or wallet changed. Review again.');
      review = plan;
      const lines = [
        plan.kind === 'approve' ? (plan.approval === '0' ? 'Reset the existing AUSD allowance to zero first.' : `Approve exactly ${formatUnits(plan.approval)} AUSD for this pool.`)
          : `${plan.kind === 'buy' ? 'Buy' : 'Sell'} ${formatUnits(plan.quantity)} claim units · scope ${plan.scope}, mask ${plan.mask}`,
        `From: ${plan.account}`, `Contract: ${plan.tx.to}`,
        plan.kind === 'approve' ? `Spender: ${plan.pool}. This step does not buy a claim. Get a new quote after confirmation.`
          : `${plan.kind === 'buy' ? 'Maximum cost' : 'Minimum proceeds'}: ${formatUnits(plan.limit)} AUSD · ${plan.bps / 100}% slippage`,
        `Proposed gas budget: ${formatUnits(plan.gasBudget, 18)} MON. Review any wallet edits.`,
        plan.kind === 'approve' ? 'Token approval has no on-chain expiry; this review expires with the quote.'
          : `Contract deadline: ${new Date(plan.deadline * 1000).toLocaleTimeString()}. Submit this review before the quote expires.`,
      ];
      $('review-details').replaceChildren(...lines.map(line => { const p = document.createElement('p'); p.textContent = line; return p; }));
      $('confirm-trade').textContent = plan.kind === 'approve'
        ? (plan.approval === '0' ? 'Confirm allowance reset in wallet' : 'Approve AUSD in wallet')
        : `Confirm ${plan.kind} in wallet`;
      text('execution-status', `Review the details, then click “${$('confirm-trade').textContent}” to open MetaMask.`);
    } catch (error) { text('execution-status', walletMessage(error)); }
    finally { operation = false; update(); }
  });
  $('confirm-trade').addEventListener('click', async () => {
    if (!review || !provider || !account || pending || operation) return;
    const plan = structuredClone(review), signer = provider, current = generation;
    let requested = false;
    operation = true; update(); text('execution-status', 'Rechecking the reviewed transaction before opening your wallet…');
    try {
      const state = await hooks.readSnapshot(plan.account, { scope: plan.scope, mask: plan.mask });
      const hash = await sendReviewed(signer, plan, state, () => current === generation && signer === provider && plan.account === account, () => {
        persist({ plan, hash: null }); requested = true;
        text('execution-status', 'Confirm or reject in your wallet. Changing this page cannot cancel an open wallet request.');
      });
      if (!hashOK(hash)) throw new WalletError('Wallet returned no valid transaction hash. Check the wallet before retrying.');
      persist({ plan, hash: hash.toLowerCase() });
      text('execution-status', 'Submitted. Waiting for a canonical receipt and matching contract event…');
      review = null; hooks.invalidateQuote('Transaction submitted. Waiting for confirmation.');
      await checkPending();
    } catch (error) {
      if (requested && error?.code === 4001) persist(null);
      text('execution-status', requested && pending ? 'Submission outcome is uncertain. Check your wallet and enter its transaction hash below. Do not submit again.' : walletMessage(error));
    } finally { operation = false; update(); }
  });

  async function checkPending(candidate) {
    if (!pending?.plan || checking) return;
    const hash = candidate || pending.hash;
    if (!hash) return;
    if (!hashOK(hash)) { text('execution-status', 'Enter a full 0x transaction hash from your wallet.'); return; }
    const record = pending; checking = true;
    try {
      const result = await hooks.readTransaction(hash);
      if (pending !== record) return;
      const status = reconcile(record.plan, result.transaction);
      if (status === 'mismatch') {
        text('execution-status', 'Included transaction does not match the reviewed calldata and contract event. Check the wallet; tracking stays locked.'); return;
      }
      if (candidate && result.transaction.status !== 'unknown') {
        if (result.transaction.sender !== record.plan.account || result.transaction.to !== record.plan.tx.to || result.transaction.input !== record.plan.tx.data) {
          text('execution-status', 'That hash is not the reviewed transaction or an identical replacement. Check the wallet.'); return;
        }
        persist({ ...record, hash: hash.toLowerCase() });
      }
      if ((status === 'matched' || status === 'reverted') && result.transaction.confirmations >= 2) {
        persist(null); review = null;
        const completed = ['wrap', 'unwrap'].includes(record.plan.kind)
          ? `${record.plan.kind === 'wrap' ? 'Wrap' : 'Unwrap'} confirmed: ${formatUnits(record.plan.quantity)} H YES units converted 1:1. No AUSD spent or paid. Balances are refreshing.`
          : record.plan.kind === 'redeem'
          ? `Redemption confirmed: ${formatUnits(record.plan.quantity)} units burned, ${formatUnits(record.plan.payout)} AUSD paid. Balances are refreshing.`
          : record.plan.kind === 'approve'
          ? (record.plan.approval === '0'
            ? 'Allowance reset confirmed. No claims bought. Next: get a fresh buy quote and review the AUSD approval.'
            : 'AUSD approval confirmed. No claims bought. Next: get a fresh buy quote and review the buy.')
          : `${record.plan.kind === 'buy' ? 'Buy' : 'Sell'} confirmed for ${formatUnits(record.plan.quantity)} claim units (scope ${record.plan.scope}, mask ${record.plan.mask}). Balances are refreshing; do not repeat the trade to refresh them.`;
        text('execution-status', status === 'reverted' ? 'Transaction reverted. No trade, approval, conversion or redemption was applied. Refresh and review again.'
          : `${completed} Exact calldata and contract event matched, with ${result.transaction.confirmations} canonical confirmations.`);
        lastHash = hash;
        hooks.invalidateQuote('Transaction completed. Request a fresh quote.');
        hooks.refresh();
      } else text('execution-status', `${result.transaction.status.replaceAll('_', ' ')} · ${result.transaction.confirmations} canonical confirmation(s). Waiting for two and the matching event. Unknown or replaced transactions are never automatically resubmitted.`);
    } catch { text('execution-status', 'Receipt or canonical chain data unavailable. Tracking remains active; no retry is submitted.'); }
    finally { checking = false; update(); }
  }
  $('check-execution').addEventListener('click', () => checkPending($('replacement-hash').value.trim() || undefined));
  $('clear-tracking').addEventListener('click', () => {
    if (operation) return;
    if (!window.confirm('Check your wallet first. Clearing this record does NOT cancel a transaction or an open wallet request. Clear tracking only after you have verified its outcome.')) return;
    persist(null); review = null; text('execution-status', 'Tracking cleared by you. This does not cancel anything in the wallet or on-chain.');
    hooks.invalidateQuote('Tracking cleared. Request a fresh quote.'); update();
  });
  setInterval(() => { if (pending?.hash) checkPending(); }, 5000);
  update();
  return { update, invalidate: () => invalidate(), get busy() { return operation || Boolean(pending) || Boolean(review); } };
}
