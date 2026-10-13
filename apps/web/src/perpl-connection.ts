import { apiKeySignIn } from './perpl.ts';

export function tradingSocketUrl(page: { origin: string; protocol: string; host: string }) {
  return page.origin === 'https://flurbo.singu.online'
    ? 'wss://testnet.perpl.xyz/ws/v1/trading'
    : `${page.protocol === 'https:' ? 'wss:' : 'ws:'}//${page.host}/api/perpl/trade`;
}

// Opening a transport is not authentication. Only Perpl's wallet snapshot makes it ready.
export function wireTradingSocket(socket: WebSocket, key: { secret: Uint8Array; token: string }, callbacks: {
  ready(): void; frame(value: unknown): void; error(message: string): void;
}, sign = apiKeySignIn, timeoutMs = 15_000) {
  let ready = false;
  let stopped = false;
  let ping: ReturnType<typeof setInterval> | undefined;
  const stop = () => { stopped = true; clearTimeout(timeout); clearInterval(ping); };
  const fail = (message: string) => {
    if (stopped) return;
    callbacks.error(message);
    stop();
    socket.close(1000);
  };
  const timeout = setTimeout(() => fail('Perpl did not confirm API-key authentication within 15 seconds. No order was sent. Check the connection and reconnect.'), timeoutMs);
  socket.onopen = () => {
    void sign(key.secret, key.token).then(frame => {
      if (!stopped && socket.readyState === 1) socket.send(JSON.stringify(frame));
    }).catch(() => fail('The API-key sign-in could not be signed. No order was sent.'));
  };
  socket.onmessage = event => {
    if (stopped) return;
    try {
      if (typeof event.data !== 'string') throw new Error('Non-text response');
      const frame = JSON.parse(event.data);
      if (!ready && frame.mt === 3 && Number(frame.status?.code) !== 0) {
        fail(`Perpl rejected API-key authentication (${frame.status?.code ?? 'unknown'}): ${String(frame.status?.error || 'Reconnect with a valid testnet key.').slice(0, 160)}`);
        return;
      }
      callbacks.frame(frame);
      if (frame.mt === 19 && !ready) {
        ready = true;
        clearTimeout(timeout);
        callbacks.ready();
        ping = setInterval(() => {
          if (!stopped && socket.readyState === 1) socket.send(JSON.stringify({ mt: 1, t: Date.now() }));
        }, 30_000);
      }
    } catch { fail('Perpl sent account data Flurbo could not read. No new order was sent.'); }
  };
  socket.onerror = () => fail('Could not reach Perpl trading. Check your network; no order was sent.');
  return stop;
}
