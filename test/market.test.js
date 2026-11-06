import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { createApp } from '../server/index.js';
import { openStore } from '../server/store.js';

async function setup(t) {
  const store = await openStore();
  const server = createApp(store);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await store.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  function client() {
    let cookie = '', csrf = '';
    return async (path, body, extra = {}) => {
      const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      const data = await response.json();
      if (data.csrf) csrf = data.csrf;
      return { status: response.status, data, headers: response.headers };
    };
  }
  return { client, base };
}
async function register(client, label) {
  const result = await client('/api/register', { name: label, email: `${label}@example.test`, password: 'local-test-passphrase' });
  assert.equal(result.status, 200);
  return result.data.user;
}

test('registration, authentication, session flags, CSRF, logout and unknown user', async t => {
  const { client } = await setup(t); const alice = client();
  assert.equal((await alice('/api/collection')).status, 401);
  const result = await alice('/api/register', { name: 'Alice', email: 'alice@example.test', password: 'local-test-passphrase' });
  assert.equal(result.status, 200);
  assert.match(result.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.equal((await alice('/api/me')).data.user.name, 'Alice');
  assert.equal((await alice('/api/collection', { cardId: 1, quantity: 2 }, { 'X-CSRF-Token': 'wrong' })).status, 403);
  assert.equal((await alice('/api/collection', { cardId: 1, quantity: 2 }, { Origin: 'https://other.example' })).status, 403);
  assert.equal((await alice('/api/logout', {})).status, 200);
  assert.equal((await alice('/api/me')).data.user, null);
  assert.equal((await alice('/api/login', { email: 'alice@example.test', password: 'wrong-password' })).status, 401);
  assert.equal((await alice('/api/login', { email: 'nobody@example.test', password: 'wrong-password' })).status, 401);
  assert.equal((await alice('/api/login', { email: 'alice@example.test', password: 'local-test-passphrase' })).status, 200);
});

test('seller reserves owned cards, buyer checks out, totals and both histories agree', async t => {
  const { client } = await setup(t); const seller = client(), buyer = client();
  await register(seller, 'seller'); await register(buyer, 'buyer');
  assert.equal((await seller('/api/collection', { cardId: 2, quantity: 3 })).status, 200);
  const listed = await seller('/api/listings', { cardId: 2, quantity: 2, price: 125000, condition: 'Near Mint', description: 'Personal collection' });
  assert.equal(listed.status, 201);
  assert.equal((await seller('/api/collection')).data[0].quantity, 1);
  assert.equal((await seller('/api/cart', { listingId: listed.data.id, quantity: 1 })).status, 400);
  assert.equal((await buyer('/api/cart', { listingId: listed.data.id, quantity: 2 })).status, 200);
  const checkout = await buyer('/api/checkout', { total: 1, price: 1 });
  assert.equal(checkout.status, 201); assert.equal(checkout.data.total, 250000);
  assert.equal((await buyer('/api/cart')).data.length, 0);
  assert.equal((await buyer('/api/collection')).data[0].quantity, 2);
  const bought = (await buyer('/api/orders')).data;
  assert.equal(bought.purchases[0].items[0].price, 125000);
  assert.equal(bought.purchases[0].total, 250000);
  assert.equal(bought.sales.length, 0);
  const sold = (await seller('/api/orders')).data;
  assert.equal(sold.purchases.length, 0); assert.equal(sold.sales[0].quantity, 2);
});

test('a different user cannot cancel a listing or read another user collection', async t => {
  const { client } = await setup(t); const owner = client(), other = client();
  const user = await register(owner, 'owner'); await register(other, 'other');
  await owner('/api/collection', { cardId: 1, quantity: 2 });
  const listed = await owner('/api/listings', { cardId: 1, quantity: 2, price: 100000, condition: 'Mint' });
  assert.equal((await other('/api/listings/cancel', { id: listed.data.id })).status, 404);
  assert.deepEqual((await other(`/api/collection?userId=${user.id}`)).data, []);
  assert.equal((await owner('/api/listings/cancel', { id: listed.data.id })).status, 200);
  assert.equal((await owner('/api/collection')).data[0].quantity, 2);
  assert.equal((await owner('/api/listings/cancel', { id: listed.data.id })).status, 404);
});

test('two buyers cannot purchase the last card; failed checkout keeps cart and creates no order', async t => {
  const { client } = await setup(t); const seller = client(), first = client(), second = client();
  await register(seller, 'stockowner'); await register(first, 'first'); await register(second, 'second');
  await seller('/api/collection', { cardId: 3, quantity: 1 });
  const listed = await seller('/api/listings', { cardId: 3, quantity: 1, price: 500000, condition: 'Mint' });
  await first('/api/cart', { listingId: listed.data.id, quantity: 1 });
  await second('/api/cart', { listingId: listed.data.id, quantity: 1 });
  const results = await Promise.all([first('/api/checkout', {}), second('/api/checkout', {})]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  const failed = results[0].status === 409 ? first : second;
  assert.equal((await failed('/api/orders')).data.purchases.length, 0);
  assert.equal((await failed('/api/collection')).data.length, 0);
  assert.equal((await failed('/api/cart')).data[0].cart_quantity, 1);
});

test('checkout is atomic when one item is out of stock', async t => {
  const { client } = await setup(t); const seller = client(), buyer = client();
  await register(seller, 'atomicowner'); await register(buyer, 'atomicbuyer');
  await seller('/api/collection', { cardId: 1, quantity: 1 });
  const last = await seller('/api/listings', { cardId: 1, quantity: 1, price: 500000, condition: 'Mint' });
  await buyer('/api/cart', { listingId: 1, quantity: 1 });
  await buyer('/api/cart', { listingId: last.data.id, quantity: 1 });
  const third = client(); await register(third, 'third');
  await third('/api/cart', { listingId: last.data.id, quantity: 1 }); await third('/api/checkout', {});
  assert.equal((await buyer('/api/checkout', {})).status, 409);
  assert.equal((await buyer('/api/collection')).data.length, 0);
  assert.equal((await buyer('/api/orders')).data.purchases.length, 0);
  assert.equal((await buyer('/api/listings')).data.find(i => i.id === 1).quantity, 4);
});

test('validation rejects SQL-like IDs, excess stock, negative prices and malformed payloads', async t => {
  const { client, base } = await setup(t); const user = client(); await register(user, 'validation');
  for (const body of [{ cardId: '1 OR 1=1', quantity: 1 }, { cardId: 1, quantity: -1 }, { cardId: 1, quantity: 1.5 }, { cardId: 999, quantity: 1 }]) assert.equal((await user('/api/collection', body)).status, 400);
  await user('/api/collection', { cardId: 1, quantity: 1 });
  assert.equal((await user('/api/listings', { cardId: 1, quantity: 2, price: 1000, condition: 'Mint' })).status, 400);
  assert.equal((await user('/api/listings', { cardId: 1, quantity: 1, price: -1, condition: 'Mint' })).status, 400);
  assert.equal((await user('/api/checkout', {})).status, 400);
  const bad = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(bad.status, 400);
  assert.equal((await user('/api/register', null)).status, 400);
});

test('static routes enforce CSP and never expose database or server source', async t => {
  const { base } = await setup(t);
  const page = await fetch(base + '/'); assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(await page.text(), /lang="vi"/);
  for (const route of ['/server/store.js', '/data/pokecard.sqlite', '/.env', '/%2e%2e/server/store.js']) assert.equal((await fetch(base + route)).status, 404);
});

test('SQLite preserves accounts, collection and cart after reopening', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pokecard-test-'));
  const file = join(directory, 'store.sqlite');
  let store;
  try {
    store = await openStore(file);
    const user = await store.register({ name: 'Persistent', email: 'persist@example.test', password: 'local-test-passphrase' });
    await store.addCollection(user.id, { cardId: 1, quantity: 2 });
    await store.setCart(user.id, { listingId: 2, quantity: 1 });
    await store.close(); store = await openStore(file);
    assert.equal((await store.login({ email: 'persist@example.test', password: 'local-test-passphrase' })).id, user.id);
    assert.equal((await store.collection(user.id))[0].quantity, 2);
    assert.equal((await store.cart(user.id))[0].cart_quantity, 1);
  } finally { await store?.close(); await rm(directory, { recursive: true, force: true }); }
});

test('password whitespace is preserved rather than silently normalized', async t => {
  const { client } = await setup(t); const user = client();
  assert.equal((await user('/api/register', { name: 'Whitespace', email: 'spaces@example.test', password: '  exact-passphrase  ' })).status, 200);
  await user('/api/logout', {});
  assert.equal((await user('/api/login', { email: 'spaces@example.test', password: 'exact-passphrase' })).status, 401);
  assert.equal((await user('/api/login', { email: 'spaces@example.test', password: '  exact-passphrase  ' })).status, 200);
});

test('Vietnamese characters survive HTTP chunks split inside a UTF-8 code point', async t => {
  const { base } = await setup(t);
  const bytes = Buffer.from(JSON.stringify({ name: 'Nguyễn', email: 'unicode@example.test', password: 'unicode-passphrase' }));
  const split = bytes.indexOf(Buffer.from('ễ')) + 1;
  const response = await new Promise((resolve, reject) => {
    const request = http.request(base + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' } }, result => {
      const chunks = []; result.on('data', chunk => chunks.push(chunk)); result.on('end', () => resolve({ status: result.statusCode, data: JSON.parse(Buffer.concat(chunks)) }));
    });
    request.on('error', reject); request.write(bytes.subarray(0, split));
    setTimeout(() => request.end(bytes.subarray(split)), 15);
  });
  assert.equal(response.status, 200); assert.equal(response.data.user.name, 'Nguyễn');
});

test('intentional CWE-639: authenticated userId override exposes another buyer orders', async t => {
  const { client } = await setup(t);
  const owner = client(), other = client(), anonymous = client();
  const user = await register(owner, 'idor-owner');
  await register(other, 'idor-observer');
  await owner('/api/cart', { listingId: 1, quantity: 1 });
  const checkout = await owner('/api/checkout', {});
  assert.equal(checkout.status, 201);
  assert.equal((await other('/api/orders')).data.purchases.length, 0);
  const exposed = await other(`/api/orders?userId=${user.id}`);
  assert.equal(exposed.status, 200);
  assert.equal(exposed.data.purchases[0].id, checkout.data.id);
  assert.equal(exposed.data.purchases[0].total, 2450000);
  assert.equal(exposed.data.purchases[0].items[0].card.name, 'Charizard ex');
  assert.equal((await anonymous(`/api/orders?userId=${user.id}`)).status, 401);
  assert.equal((await other('/api/orders?userId=-1')).status, 400);
});
