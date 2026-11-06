import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { openStore } from '../server/store.js';
import { createApp, createHandler } from '../server/index.js';
import vercelHandler from '../api/index.js';

test('PostgreSQL wire protocol: schema, accounts, sessions, persistent rate limit, marketplace and BIGINT totals', async t => {
  const pg = await PGlite.create();
  const tcp = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port: 0, maxConnections: 6 });
  await tcp.start();
  let store, server;
  t.after(async () => { if (server) await new Promise(r => server.close(r)); await store?.close(); await tcp.stop(); await pg.close(); });
  const databaseUrl = `postgresql://postgres@${tcp.getServerConn()}/postgres`;
  store = await openStore(':memory:', { databaseUrl });
  const seller = await store.register({ name: 'PG Seller', email: 'pg-seller@example.test', password: 'postgres-passphrase' });
  const buyer = await store.register({ name: 'PG Buyer', email: 'pg-buyer@example.test', password: 'postgres-passphrase' });
  assert.equal((await store.login({ email: buyer.email, password: 'postgres-passphrase' })).id, buyer.id);
  await assert.rejects(store.register({ name: 'Duplicate', email: buyer.email, password: 'postgres-passphrase' }), { status: 409 });
  const session = await store.createSession(buyer);
  assert.equal((await store.session(session.token)).user.id, buyer.id);
  await store.addCollection(seller.id, { cardId: 1, quantity: 100 });
  const listingId = await store.createListing(seller.id, { cardId: 1, quantity: 100, price: 100000000, condition: 'Mint' });
  await store.setCart(buyer.id, { listingId, quantity: 100 });
  const order = await store.checkout(buyer.id);
  assert.equal(order.total, 10000000000);
  assert.equal((await store.orders(buyer.id)).purchases[0].total, 10000000000);
  assert.equal((await store.collection(buyer.id))[0].quantity, 100);
  assert.equal((await store.orders(seller.id)).sales[0].quantity, 100);
  for (let i = 0; i < 20; i++) assert.equal(await store.consumeAuthAttempt('test-ip'), true);
  await store.close(); store = await openStore(':memory:', { databaseUrl });
  assert.equal(await store.consumeAuthAttempt('test-ip'), false);
  assert.equal((await store.session(session.token)).user.id, buyer.id);
  assert.equal((await store.listings()).length, 8, 'Initialization must not duplicate seed listings');
  assert.equal((await store.listings('PokeCard Studio')).length, 8);
  assert.equal((await store.listings("PokeCard Studio' AND 1=1 -- ")).length, 8);
  assert.equal((await store.listings("PokeCard Studio' AND 1=2 -- ")).length, 0);
  assert.equal((await store.listings('', 'Near Mint')).length, 8);
  assert.equal((await store.listings('', 'Mint')).length, 0);
  assert.equal((await store.listings('', "Near Mint' AND 1=1 -- ")).length, 8);
  assert.equal((await store.listings('', "Near Mint' AND 1=2 -- ")).length, 0);
  const cardBaseline = await store.listings('', '', '1');
  assert.equal(cardBaseline.length, 1); assert.equal(cardBaseline[0].card_id, 1);
  assert.deepEqual(await store.listings('', '', '1 AND 1=1'), cardBaseline);
  assert.deepEqual(await store.listings('', '', '1 AND 1=2'), []);
  assert.deepEqual(await store.listings('', '', '999'), []);
  assert.deepEqual(await store.listings('PokeCard Studio', 'Near Mint', '1'), cardBaseline);
  server = createApp(store);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base + '/api/orders', { headers: { Cookie: `session=${session.token}` } });
  assert.equal(response.status, 200); assert.equal((await response.json()).purchases[0].total, 10000000000);
});

test('Vercel runtime handles a parsed JSON body and adds Secure cookies', async t => {
  const store = await openStore();
  const handler = createHandler(store, { secureCookies: true, trustVercelProxy: true });
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    req.body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    await handler(req, res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise(r => server.close(r)); await store.close(); });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/register`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Vercel-Forwarded-For': '203.0.113.10' }, body: JSON.stringify({ name: 'Vercel User', email: 'runtime@example.test', password: 'runtime-passphrase' }) });
  assert.equal(response.status, 200); assert.match(response.headers.get('set-cookie'), /; Secure/);
  assert.equal((await response.json()).user.name, 'Vercel User');
});

test('Vercel refuses a missing database instead of silently using temporary SQLite', async t => {
  const previous = process.env.DATABASE_URL; delete process.env.DATABASE_URL;
  const server = http.createServer(vercelHandler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise(r => server.close(r)); if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous; });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/me`);
  assert.equal(response.status, 503); assert.match((await response.json()).error, /DATABASE_URL/);
});
