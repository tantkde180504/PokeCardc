// Creates two test accounts and one simulated order on the specified deployment.
// Credentials stay in memory and are never printed or saved.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const base = process.argv[2];
if (!base || new URL(base).protocol !== 'https:') throw new Error('Pass the HTTPS URL of your own PokeCard deployment.');
const label = randomBytes(6).toString('hex');
const password = randomBytes(24).toString('base64url');
function client() {
  let cookie = '', csrf = '';
  return async (path, body) => {
    const response = await fetch(new URL(`/api/${path}`, base), { method: body === undefined ? 'GET' : 'POST', headers: { Cookie: cookie, Origin: new URL(base).origin, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: body === undefined ? undefined : JSON.stringify(body) });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) throw new Error(`${path}: expected JSON, received HTTP ${response.status} ${contentType}. Check deployment protection.`);
    const data = await response.json();
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}: ${data.error}`);
    if (response.headers.get('set-cookie')) {
      const value = response.headers.get('set-cookie');
      assert.match(value, /HttpOnly/); assert.match(value, /SameSite=Strict/); assert.match(value, /Secure/);
      cookie = value.split(';')[0];
    }
    if (data.csrf) csrf = data.csrf;
    return data;
  };
}
const seller = client(), buyer = client();
assert.equal((await buyer('me')).user, null);
assert.ok((await buyer('listings')).length >= 8);
await seller('register', { name: 'Vercel Test Seller', email: `seller-${label}@example.test`, password });
await buyer('register', { name: 'Vercel Test Buyer', email: `buyer-${label}@example.test`, password });
await seller('collection', { cardId: 2, quantity: 2 });
const listing = await seller('listings', { cardId: 2, quantity: 2, price: 125000, condition: 'Mint', description: 'Giao dịch kiểm tra deployment Vercel; không phải tin bán thực tế.' });
await buyer('cart', { listingId: listing.id, quantity: 1 });
const order = await buyer('checkout', {});
assert.equal(order.total, 125000);
assert.ok((await buyer('collection')).some(i => i.card_id === 2 && i.quantity === 1));
assert.ok((await seller('orders')).sales.some(i => i.order_id === order.id));
await seller('listings/cancel', { id: listing.id });
assert.equal((await seller('collection'))[0].quantity, 1);
await buyer('logout', {});
assert.equal((await buyer('me')).user, null);
await buyer('login', { email: `buyer-${label}@example.test`, password });
assert.ok((await buyer('orders')).purchases.some(i => i.id === order.id && i.total === 125000));
await buyer('logout', {}); await seller('logout', {});
console.log(`Cloud smoke passed on ${base}: accounts, Secure cookies, collection, listings, cart, checkout, seller history, cancellation and login persistence. Created simulated order #${order.id}; test credentials were not saved.`);
