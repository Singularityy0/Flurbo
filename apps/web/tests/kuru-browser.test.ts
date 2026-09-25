import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { encodeEventTopics, encodeAbiParameters, parseAbiParameters } from 'viem';
import { kuruAbi } from '../shared/kuru.mjs';

test('Kuru deep link, wallet review, reload recovery and responsive layout work in the production bundle', { skip: !process.env.FLURBO_TEST_PLAYWRIGHT }, async () => {
  const { chromium } = await import(pathToFileURL(process.env.FLURBO_TEST_PLAYWRIGHT!).href);
  const browser = await chromium.launch({ headless: true, executablePath: process.env.FLURBO_TEST_BROWSER });
  const account = '0x' + '11'.repeat(20), hash = '0x' + 'aa'.repeat(32), block = '0x' + 'bb'.repeat(32);
  const contracts = { pool: '0x' + '22'.repeat(20), cash: '0x' + '33'.repeat(20), receipt: '0x' + '44'.repeat(20), margin: '0x' + '55'.repeat(20), market: '0x' + '66'.repeat(20) };
  const log = { address: contracts.market, topics: encodeEventTopics({ abi: kuruAbi, eventName: 'OrderCreated' }), data: encodeAbiParameters(parseAbiParameters('uint40,address,uint96,uint32,bool'), [3, account as any, 1000000n, 450000, true]), transactionHash: hash, logIndex: '0x1' };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    let loggedIn = true, reads = 0; const errors: string[] = [];
    page.on('pageerror', (error: Error) => errors.push(error.message));
    await page.addInitScript(({ account, hash, block, log }: any) => {
      (window as any).ethereum = { isMetaMask: true, request: async ({ method, params }: any) => {
        const p = JSON.parse(localStorage.getItem('flurbo.kuru.pending.v1') || 'null');
        const tx = p && { hash, from: account, to: p.review.to, input: p.review.data, value: '0x0', nonce: p.nonce, chainId: '0x279f', blockHash: block, blockNumber: '0x64' };
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [account];
        if (method === 'eth_chainId') return '0x279f';
        if (method === 'eth_getBlockByNumber') return { hash: block, number: '0x65' };
        if (method === 'eth_call') return '0x';
        if (method === 'eth_estimateGas') return '0x186a0';
        if (method === 'eth_gasPrice') return '0x3b9aca00';
        if (method === 'eth_getBalance') return '0xde0b6b3a7640000';
        if (method === 'eth_getTransactionCount') return 121;
        if (method === 'eth_sendTransaction') { if (!p || p.hash !== null) throw Error('Tracking must be saved before signing'); sessionStorage.setItem('test.sends', String(Number(sessionStorage.getItem('test.sends') || 0) + 1)); sessionStorage.setItem('test.tx', JSON.stringify(params[0])); return hash; }
        if (method === 'eth_getTransactionByHash') return tx;
        if (method === 'eth_getTransactionReceipt') return { ...tx, transactionHash: hash, status: '0x1', logs: [log] };
        throw Error(method);
      } };
    }, { account, hash, block, log });
    await page.route('**/*', async (route: any) => {
      const path = new URL(route.request().url()).pathname;
      if(path==='/api/account/wallets')return route.fulfill({json:{account:account,wallets:[account]}});
      if(path==='/api/account/access')return route.fulfill({json:{testingTools:true}});
      if (path === '/api/auth/session') return route.fulfill({ json: { session: loggedIn ? { address: account, method: 'passkey', expiresAt: Date.now() + 3600000 } : null } });
      if (path === '/api/kuru') { reads++; return route.fulfill({ json: { environment: 'public_testnet', chain_id: 10143, contracts, trading_available: true,
        snapshot: { block_number: 100, block_hash: block, timestamp: Math.floor(Date.now() / 1000), stale: false },
        wallet: { address: account, ausd_atoms: '10000000', receipt_atoms: '8000000', margin_available_ausd_atoms: '2000000', margin_available_receipt_atoms: '1000000' },
        kuru: { best_bid_wad: '450000000000000000', best_ask_wad: '500000000000000000' }, orders: [{ id: '1', side: 'buy', remaining_atoms: '2000000', price_units: '450000' }], orders_page: { next_before: null, through_id: '2' }, activity: { from_block: 1, to_block: 100, logs: [] },
      } }); }
      if (path.startsWith('/api/')) return route.fulfill({ status: 503, json: { error: 'Offline fixture' } });
      const relative = path.startsWith('/assets/') ? path.slice(1) : 'index.html';
      return route.fulfill({ body: await readFile(new URL('../dist/' + relative, import.meta.url)), contentType: relative.endsWith('.js') ? 'text/javascript' : relative.endsWith('.css') ? 'text/css' : relative.endsWith('.woff2') ? 'font/woff2' : 'text/html' });
    });
    await page.goto('https://flurbo.singu.online/kuru');
    await page.getByLabel('Trading wallet', { exact: true }).selectOption('0');
    await page.getByRole('button', { name: 'Connect MetaMask', exact: true }).click();
    await page.getByText('Wallet connected. Every action is reviewed and confirmed separately.').waitFor();
    assert.equal(await page.locator('#trading-market').count(), 0);
    assert.equal(await page.locator('.core-market').count(), 0);
    await page.getByLabel('Action', { exact: true }).selectOption('limit-buy');
    await page.getByRole('button', { name: 'Review limit buy', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm in wallet', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => sessionStorage.getItem('test.sends')), null);
    if (process.env.FLURBO_TEST_SCREENSHOT) await page.screenshot({ path: process.env.FLURBO_TEST_SCREENSHOT, fullPage: true });
    await page.getByRole('button', { name: 'Confirm in wallet', exact: true }).click();
    await page.getByText('Submitted. Check confirmation before another action.').waitFor();
    assert.equal(await page.evaluate(() => sessionStorage.getItem('test.sends')), '1');
    await page.reload(); await page.getByText('Finish your pending action.').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Review deposit', exact: true }).isDisabled(), true);
    await page.getByLabel('Trading wallet', { exact: true }).selectOption('0');
    await page.getByRole('button', { name: 'Connect MetaMask', exact: true }).click();
    await page.getByText('Wallet connected. Every action is reviewed and confirmed separately.').waitFor();
    await page.getByRole('button', { name: 'Check confirmation', exact: true }).click();
    await page.getByText(/Limit buy confirmed/).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('flurbo.kuru.pending.v1')), null);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('test.sends')), '1');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.FLURBO_TEST_SCREENSHOT) await page.screenshot({ path: process.env.FLURBO_TEST_SCREENSHOT.replace('.png', '-mobile.png'), fullPage: true });
    loggedIn = false; const before = reads;
    await page.goto('https://flurbo.singu.online/kuru'); await page.waitForURL('**/login'); assert.equal(reads, before);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
