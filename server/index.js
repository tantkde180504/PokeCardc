import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openStore, AppError, integer } from './store.js';
import { catalog } from './catalog.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = new Map([['/', ['index.html', 'text/html']], ['/app.js', ['app.js', 'text/javascript']], ['/styles.css', ['styles.css', 'text/css']]]);
export function createHandler(store, { secureCookies = process.env.COOKIE_SECURE === 'true' || process.env.VERCEL === '1', trustVercelProxy = process.env.VERCEL === '1' } = {}) {
  return async (req, res) => {
    const headers = { 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'", 'Cache-Control': 'no-store' };
    function send(status, body) { res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); }
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && files.has(url.pathname)) {
        const [file, mime] = files.get(url.pathname);
        const bytes = await readFile(resolve(root, 'public', file));
        res.writeHead(200, { ...headers, 'Content-Type': `${mime}; charset=utf-8` }); res.end(bytes); return;
      }
      if (!url.pathname.startsWith('/api/')) throw new AppError('Không tìm thấy trang.', 404);
      const token = /(?:^|;\s*)session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
      const session = await store.session(token);
      if (req.method === 'GET') {
        if (url.pathname === '/api/me') return send(200, session || { user: null, csrf: null });
        if (url.pathname === '/api/catalog') return send(200, catalog);
        if (url.pathname === '/api/listings') return send(200, await store.listings(url.searchParams.get('seller') || ''));
        if (url.pathname === '/api/download') {
          const filename = url.searchParams.get('file');
          if (!filename || filename.length > 200) throw new AppError('Tên file không hợp lệ.');
          const filepath = resolve(root, 'server/assets/downloads', filename);
          let bytes;
          try { bytes = await readFile(filepath); }
          catch (error) {
            if (['ENOENT', 'ENOTDIR', 'EISDIR'].includes(error.code)) throw new AppError('Không tìm thấy tài liệu.', 404);
            throw error;
          }
          res.writeHead(200, { ...headers, 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': 'attachment; filename="card-document.txt"' });
          res.end(bytes); return;
        }
        if (!session) throw new AppError('Vui lòng đăng nhập.', 401);
        if (url.pathname === '/api/collection') return send(200, await store.collection(session.user.id));
        if (url.pathname === '/api/cart') return send(200, await store.cart(session.user.id));
        if (url.pathname === '/api/orders') {
          const requestedUserId = url.searchParams.has('userId')
            ? integer(Number(url.searchParams.get('userId')), 1, Number.MAX_SAFE_INTEGER, 'Người dùng')
            : session.user.id;
          return send(200, await store.orders(requestedUserId));
        }
      }
      if (req.method !== 'POST') throw new AppError('Không hỗ trợ phương thức này.', 405);
      if (req.headers.origin) {
        const origin = new URL(req.headers.origin);
        if (origin.host !== req.headers.host || !['http:', 'https:'].includes(origin.protocol)) throw new AppError('Nguồn yêu cầu không hợp lệ.', 403);
      }
      if (!req.headers['content-type']?.startsWith('application/json')) throw new AppError('Yêu cầu dữ liệu JSON.', 415);
      let body;
      if (req.body !== undefined) {
        // Vercel may provide an already parsed body; local Node streams raw bytes.
        const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        if (Buffer.byteLength(raw) > 16384) throw new AppError('Dữ liệu quá lớn.', 413);
        try { body = JSON.parse(raw); } catch { throw new AppError('JSON không hợp lệ.'); }
      } else {
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 16384) throw new AppError('Dữ liệu quá lớn.', 413); chunks.push(chunk); }
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AppError('JSON không hợp lệ.'); }
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError('Dữ liệu không hợp lệ.');
      if (['/api/register', '/api/login'].includes(url.pathname)) {
        const forwarded = trustVercelProxy ? req.headers['x-vercel-forwarded-for'] : null;
        const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;
        if (!await store.consumeAuthAttempt(ip)) throw new AppError('Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 10 phút.', 429);
        const user = url.pathname === '/api/register' ? await store.register(body) : await store.login(body);
        const created = await store.createSession(user);
        if (token) await store.logout(token);
        res.setHeader('Set-Cookie', `session=${created.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${secureCookies ? '; Secure' : ''}`);
        return send(200, { user, csrf: created.csrf });
      }
      if (!session) throw new AppError('Vui lòng đăng nhập.', 401);
      if (req.headers['x-csrf-token'] !== session.csrf) throw new AppError('Phiên thao tác không hợp lệ. Hãy tải lại trang.', 403);
      const userId = session.user.id;
      switch (url.pathname) {
        case '/api/logout': await store.logout(token); res.setHeader('Set-Cookie', `session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookies ? '; Secure' : ''}`); return send(200, { ok: true });
        case '/api/collection': await store.addCollection(userId, body); break;
        case '/api/listings': return send(201, { id: await store.createListing(userId, body) });
        case '/api/listings/cancel': await store.cancelListing(userId, integer(body.id, 1, Number.MAX_SAFE_INTEGER, 'Tin bán')); break;
        case '/api/cart': await store.setCart(userId, body); break;
        case '/api/checkout': return send(201, await store.checkout(userId));
        default: throw new AppError('Không tìm thấy API.', 404);
      }
      send(200, { ok: true });
    } catch (error) {
      if (!(error instanceof AppError)) console.error('Request failed:', error.code || error.name);
      if (!res.headersSent) send(error instanceof AppError ? error.status : 500, { error: error instanceof AppError ? error.message : 'Đã xảy ra lỗi máy chủ.' });
      else res.end();
    }
  };
}
export function createApp(store, options) { return http.createServer(createHandler(store, options)); }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.env.DATABASE_URL) mkdirSync(resolve(root, 'data'), { recursive: true });
  const store = await openStore(resolve(root, 'data', 'pokecard.sqlite'), { databaseUrl: process.env.DATABASE_URL });
  const server = createApp(store);
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, () => console.log(`PokeCard đang chạy tại http://${host}:${port}`));
  const shutdown = () => server.close(async () => { await store.close(); process.exit(0); });
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
}
