// Optional real-browser check, using Chrome/Edge's DevTools protocol without dependencies.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, mkdir, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import assert from 'node:assert/strict';
import { createApp } from '../server/index.js';
import { openStore } from '../server/store.js';

const delay = ms => new Promise(r => setTimeout(r, ms));
const candidates = [process.env.BROWSER_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);
let executable;
for (const path of candidates) { try { await access(path); executable = path; break; } catch {} }
if (!executable) throw new Error('Set BROWSER_PATH to a Chrome/Chromium/Edge executable.');
const profile = await mkdtemp(join(tmpdir(), 'pokecard-browser-'));
const store = await openStore();
const server = createApp(store);
await new Promise(r => server.listen(0, '127.0.0.1', r));
const address = `http://127.0.0.1:${server.address().port}`;
const browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let ws, sequence = 0;
const pending = new Map(), errors = [];
browser.on('error', e => errors.push(e.message));
function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const response = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text + ': ' + response.exceptionDetails.exception?.description);
  return response.result?.value;
}
async function waitFor(expression) {
  for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(100); }
  throw new Error(`Browser condition timed out: ${expression}`);
}
async function click(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); }
async function fill(selector, value) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).value=${JSON.stringify(value)}`); }
async function screenshot(name) {
  const result = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(resolve('test-results', name), Buffer.from(result.data, 'base64'));
}
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await delay(100); }
  }
  if (!port) throw new Error('Browser did not start: ' + errors.join(', '));
  const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(address)}`, { method: 'PUT' }).then(r => r.json());
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, reject) => { ws.onopen = r; ws.onerror = reject; });
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) { const item = pending.get(message.id); clearTimeout(item.timer); pending.delete(message.id); message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry.text);
  };
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Log.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await waitFor(`document.querySelectorAll('.product').length === 8`);
  await mkdir('test-results', { recursive: true }); await screenshot('desktop.png');
  const probe = '<strong id="acvis-xss-probe">ACVIS_XSS_PROBE</strong>';
  await cdp('Page.navigate', { url: `${address}/?q=${encodeURIComponent(probe)}` });
  await waitFor(`document.querySelector('#results-count #acvis-xss-probe')?.textContent === 'ACVIS_XSS_PROBE'`);
  console.log('Intentional CWE-79 reproduced: q is inserted as HTML into the results label; script execution remains constrained by CSP.');
  await cdp('Page.navigate', { url: address });
  await waitFor(`document.querySelectorAll('.product').length === 8`);
  await fill('#search', 'Pikachu'); await evaluate(`document.querySelector('#search').dispatchEvent(new Event('input',{bubbles:true}))`);
  assert.equal(await evaluate(`document.querySelectorAll('.product').length`), 1);
  await fill('#search', ''); await evaluate(`document.querySelector('#search').dispatchEvent(new Event('input',{bubbles:true}))`);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'Mobile page must not overflow');
  await screenshot('mobile.png');
  await click('#account-button'); await click('#switch-auth');
  await fill('[name=name]', 'Browser Collector'); await fill('[name=email]', 'browser@example.test'); await fill('[name=password]', 'browser-test-passphrase');
  await click('#auth-form [type=submit]'); await waitFor(`!document.querySelector('#modal').open`);
  await evaluate(`location.hash='collection'`); await waitFor(`document.querySelector('[data-action=collect]')`);
  await click('[data-action=collect]'); await click('#collect-form [type=submit]'); await waitFor(`!document.querySelector('#modal').open`);
  await waitFor(`document.querySelectorAll('.product').length === 1`);
  await click('.product [data-action=sell]'); await click('#sell-form [type=submit]'); await waitFor(`!document.querySelector('#modal').open`);
  await evaluate(`location.hash='selling'`); await waitFor(`document.querySelector('[data-action=cancel]')`);
  await click('[data-action=cancel]'); await waitFor(`!document.querySelector('[data-action=cancel]')`);
  await evaluate(`location.hash='market'`); await waitFor(`document.querySelectorAll('.product').length === 8`);
  await click('.product .add-button'); await waitFor(`document.querySelector('#cart-count').textContent === '1'`);
  await click('#cart-button'); await click('#checkout'); await waitFor(`location.hash === '#orders' && !document.querySelector('#modal').open`);
  assert.match(await evaluate(`document.querySelector('#workspace').textContent`), /2450000|2\.450\.000/);
  await screenshot('mobile-orders.png');
  await evaluate(`location.hash='cards'`); await waitFor(`document.querySelector('#cards')`);
  await evaluate(`location.hash='collection'`); await waitFor(`document.querySelector('.page-heading h1')?.textContent === 'Bộ sưu tập'`);
  await evaluate('history.back()'); await waitFor(`location.hash === '#cards' && document.querySelector('#cards')`);
  // Invalidate the server session while the frontend still believes it is signed in.
  await evaluate(`(async () => { const session = await fetch('/api/me').then(r=>r.json()); await fetch('/api/logout', { method:'POST', headers: { 'Content-Type':'application/json', 'X-CSRF-Token':session.csrf }, body:'{}' }); })()`);
  await click('.product .add-button'); await waitFor(`document.querySelector('#account-button').textContent.includes('Đăng nhập')`);
  await click('#account-button'); await waitFor(`document.querySelector('#auth-form')`);
  await fill('[name=email]', 'browser@example.test'); await fill('[name=password]', 'browser-test-passphrase');
  await click('#auth-form [type=submit]'); await waitFor(`!document.querySelector('#modal').open`);
  assert.match(await evaluate(`document.querySelector('#account-button').textContent`), /Browser Collector/);
  // The deliberately expired session returns one expected HTTP 401 during this check.
  const unexpected = errors.filter(message => !message.includes('401 (Unauthorized)'));
  assert.deepEqual(unexpected, [], 'No unexpected browser exceptions or error-level console messages');
  console.log('Browser smoke passed: search, mobile layout, registration, collection, listing, cancellation, cart, checkout, Back navigation and expired-session recovery. Screenshots: test-results/.');
} finally {
  ws?.close(); browser.kill();
  await new Promise(r => server.close(r)); await store.close();
  // Delete only the unique profile created by this script, after verifying its location.
  if (resolve(profile).startsWith(resolve(tmpdir()) + sep) && profile.includes('pokecard-browser-')) {
    for (let i = 0; i < 10; i++) { try { await rm(profile, { recursive: true, force: true }); break; } catch { await delay(300); } }
  }
}
