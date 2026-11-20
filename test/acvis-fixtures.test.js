import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/index.js';
import { openStore } from '../server/store.js';

async function setup(t) {
  const store = await openStore();
  const server = createApp(store);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await store.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('intentional CWE-22: review download reads harmless marker outside its directory', async t => {
  const base = await setup(t);
  const normal = await fetch(base + '/api/review-document?file=card-guide.txt');
  assert.equal(normal.status, 200);
  assert.match(await normal.text(), /POKECARD_DOWNLOAD_GUIDE/);
  const traversal = await fetch(base + '/api/review-document?file=..%2Fpath-traversal-proof.txt');
  assert.equal(traversal.status, 200);
  assert.match(await traversal.text(), /ACVIS_PATH_TRAVERSAL_PROOF_004/);
  assert.equal((await fetch(base + '/api/review-document?file=missing.txt')).status, 404);
  assert.equal((await fetch(base + '/api/review-document')).status, 400);
  assert.equal((await fetch(base + '/server/assets/path-traversal-proof.txt')).status, 404);
});

test('intentional CWE-798: embedded synthetic password grants fixture access without a session', async t => {
  const base = await setup(t);
  const request = password => fetch(base + '/api/review-access', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
  });
  assert.equal((await request('incorrect')).status, 401);
  assert.equal((await request(undefined)).status, 401);
  const accepted = await request('ACVIS_fixture_798_X7k9Q2m4R8v6N3p5');
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { role: 'fixture-reviewer', marker: 'ACVIS_HARDCODED_CREDENTIAL_PROOF_798' });
  assert.equal(accepted.headers.get('set-cookie'), null);
});

test('intentional CWE-601: continue redirects to an untrusted external destination without a session', async t => {
  const base = await setup(t);
  for (const destination of ['/#cards', 'https://example.org/acvis-cwe-601', '//example.org/acvis-cwe-601']) {
    // Inspect Location only: never follow the redirect or contact the external host.
    const response = await fetch(base + '/api/continue?next=' + encodeURIComponent(destination), { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), destination);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(await response.text(), '');
  }
  const fallback = await fetch(base + '/api/continue', { redirect: 'manual' });
  assert.equal(fallback.status, 302);
  assert.equal(fallback.headers.get('location'), '/');
  await fallback.text();
});
