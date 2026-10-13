import { WebSocket, WebSocketServer } from 'ws';
import { cookieValue } from './session.mjs';

export const PERPL_CONTEXT_URL = 'https://testnet.perpl.xyz/api/v1/pub/context';
export const PERPL_TRADE_SOCKET = 'wss://testnet.perpl.xyz/ws/v1/trading';

// A browser on flurbo.singu.online is rejected by Perpl's edge (HTTP 403) before
// the trading socket opens. A server client that does not send an Origin is
// accepted, then authenticated by the user's already-enrolled key. Frames are
// signed in the browser; this process only relays them and must not log them.
export async function loadPublicPerplContext(fetcher = fetch) {
  const response = await fetcher(PERPL_CONTEXT_URL, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error('Perpl context unavailable');
  const text = await response.text();
  if (text.length > 256_000) throw new Error('Perpl context unavailable');
  const value = JSON.parse(text);
  if (value?.chain?.chain_id !== 10143) throw new Error('Perpl context unavailable');
  return value;
}

function rejectUpgrade(socket, status, reason) {
  if (socket.destroyed) return;
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

function clientFrame(data) {
  const text = Buffer.isBuffer(data) ? data.toString('utf8') : typeof data === 'string' ? data : '';
  if (!text || text.length > 8192) return null;
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value) || !Number.isInteger(value.mt) || value.mt < 1 || value.mt > 199) return null;
    return text;
  } catch { return null; }
}

export function attachPerplRelay(httpServer, { store, resolveOrigin, connect = () => new WebSocket(PERPL_TRADE_SOCKET), leaveForeignUpgrades = false, limit = 32 } = {}) {
  const sockets = new WebSocketServer({ noServer: true });
  let active = 0;
  httpServer.on('upgrade', (req, socket, head) => {
    const path = (req.url || '').split('?')[0];
    if (path !== '/api/perpl/trade') {
      if (!leaveForeignUpgrades) socket.destroy();
      return;
    }
    void accept(req, socket, head);
  });

  async function accept(req, socket, head) {
    try {
      if (active >= limit) return rejectUpgrade(socket, 503, 'Busy');
      const origin = resolveOrigin(req);
      const login = origin ? await store.read(cookieValue(req.headers.cookie, 'flurbo_session'), origin) : null;
      if (!login || login.method !== 'passkey') return rejectUpgrade(socket, 401, 'Unauthorized');
      if (socket.destroyed) return;
      sockets.handleUpgrade(req, socket, head, client => open(client));
    } catch { rejectUpgrade(socket, 401, 'Unauthorized'); }
  }

  function open(client) {
    active += 1;
    let released = false;
    const release = () => { if (!released) { released = true; active -= 1; } };
    try {
      const upstream = connect();
      const pending = [];
      let opened = false;
      const timer = setTimeout(() => { upstream.terminate(); client.close(1011, 'Perpl unavailable'); }, 10_000);
      const finish = () => { clearTimeout(timer); release(); };
      client.on('message', data => {
        const text = clientFrame(data);
        if (!text) { client.close(1003); upstream.close(); return; }
        if (!opened) { if (pending.length >= 4) { client.close(1008); upstream.close(); return; } pending.push(text); return; }
        upstream.send(text);
      });
      client.on('close', () => { finish(); upstream.close(); });
      client.on('error', () => { finish(); upstream.terminate(); });
      upstream.on('open', () => { opened = true; clearTimeout(timer); while (pending.length) upstream.send(pending.shift()); });
      upstream.on('message', data => {
        const text = Buffer.isBuffer(data) ? data.toString('utf8') : typeof data === 'string' ? data : '';
        if (!text || text.length > 262_144 || client.readyState !== WebSocket.OPEN) { client.close(1009); upstream.close(); return; }
        client.send(text);
      });
      upstream.on('close', code => { finish(); const relay = Number.isInteger(code) && code >= 1000 && code <= 4999 && ![1004, 1005, 1006, 1015].includes(code) ? code : 1011; client.close(relay); });
      upstream.on('error', () => { finish(); client.close(1011); });
    } catch { release(); client.close(1011); }
  }
}
