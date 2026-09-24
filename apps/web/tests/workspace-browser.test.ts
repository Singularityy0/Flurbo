import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Optional production-bundle regression. All browser requests are intercepted;
// this fixture neither authenticates to the public site nor connects a wallet.
test('activity panels remain unique across repeated navigation and session restoration', {
  skip: !process.env.FLURBO_TEST_PLAYWRIGHT,
}, async () => {
  const { chromium } = await import(pathToFileURL(process.env.FLURBO_TEST_PLAYWRIGHT!).href);
  const browser = await chromium.launch({ headless: true, executablePath: process.env.FLURBO_TEST_BROWSER });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error: Error) => errors.push(error.message));
    await page.route('**/*', async (route: any) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/auth/session') return route.fulfill({ json: { session: {
        address: '0x2ff9ca4cb64fa82915144e8d9cf6a6ceddaa35e3', method: 'passkey', expiresAt: Date.now() + 3600000,
      } } });
      if (path.startsWith('/api/') || path === '/healthz') return route.fulfill({ status: 503, json: { error: 'Offline test fixture' } });
      const relative = path.startsWith('/assets/') ? path.slice(1) : 'index.html';
      const mime = relative.endsWith('.js') ? 'text/javascript' : relative.endsWith('.css') ? 'text/css' : relative.endsWith('.woff2') ? 'font/woff2' : 'text/html';
      return route.fulfill({ body: await readFile(new URL('../dist/' + relative, import.meta.url)), contentType: mime });
    });
    await page.goto('https://flurbo.singu.online/account');
    for (let i = 0; i < 6; i++) {
      await page.getByRole('button', { name: 'Activity & network', exact: true }).click();
      assert.equal(await page.locator('summary').filter({ hasText: 'Learning comparison' }).count(), 1);
      assert.equal(await page.locator('summary').filter({ hasText: 'Learning pool' }).count(), 1);
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.getByRole('button', { name: 'Your positions', exact: true }).click();
      assert.equal(await page.locator('summary').filter({ hasText: 'Learning comparison' }).count(), 0);
      assert.equal(await page.locator('summary').filter({ hasText: 'Learning pool' }).count(), 0);
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
