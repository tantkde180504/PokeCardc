import { createHandler } from '../server/index.js';
import { openStore } from '../server/store.js';

let initialization;
export default async function handler(req, res) {
  if (!process.env.DATABASE_URL) {
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'Chưa cấu hình DATABASE_URL cho PostgreSQL trên Vercel.' }));
    return;
  }
  try {
    // Cache only a connection pool/handler, never user data. No writable local database on Vercel.
    initialization ||= openStore(':memory:', { databaseUrl: process.env.DATABASE_URL })
      .then(store => createHandler(store, { secureCookies: true, trustVercelProxy: process.env.VERCEL === '1' }))
      .catch(error => { initialization = undefined; throw error; });
    const app = await initialization;
    const url = new URL(req.url, 'https://localhost');
    const route = url.searchParams.get('__route');
    if (route) {
      url.searchParams.delete('__route');
      req.url = `/api/${route}${url.search}`;
    }
    await app(req, res);
  } catch (error) {
    console.error('Database initialization failed:', error.code || error.name);
    if (!res.headersSent) {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'Chưa kết nối được PostgreSQL. Vui lòng thử lại sau.' }));
    } else res.end();
  }
}
