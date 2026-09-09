const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const source = fs.readFileSync('app/static/js/admin-payments.js', 'utf8');
const requestSource = source.slice(source.indexOf('  function apiRequest('), source.indexOf('  function escapeHtml('));
function setup(fetch) {
  const context = { fetch, setTimeout: (callback) => callback() };
  vm.createContext(context);
  vm.runInContext(requestSource, context);
  return context.apiRequest;
}
test('GET retries a transient network failure', async () => {
  let calls = 0;
  const request = setup(async () => {
    if (++calls === 1) throw new TypeError('Failed to fetch');
    return { ok: true, json: async () => ({ items: [] }) };
  });
  assert.equal((await request('/queue')).items.length, 0);
  assert.equal(calls, 2);
});
test('GET stops after one retry and explains the connection failure', async () => {
  let calls = 0;
  const request = setup(async () => { calls++; throw new TypeError('Failed to fetch'); });
  await assert.rejects(request('/queue'), /Unable to reach the server/);
  assert.equal(calls, 2);
});
test('wallet actions never retry automatically', async () => {
  for (const method of ['POST', 'DELETE']) {
    let calls = 0;
    const request = setup(async () => { calls++; throw new TypeError('Failed to fetch'); });
    await assert.rejects(request('/queue/action', { method }), /check whether the action completed/);
    assert.equal(calls, 1);
  }
});
test('HTTP errors retain the server message without retrying', async () => {
  let calls = 0;
  const request = setup(async () => { calls++; return { ok: false, json: async () => ({ message: 'Please sign in' }) }; });
  await assert.rejects(request('/queue'), /Please sign in/);
  assert.equal(calls, 1);
});
test('HTML or invalid JSON has a useful error', async () => {
  const request = setup(async () => ({ status: 502, json: async () => { throw new SyntaxError(); } }));
  await assert.rejects(request('/queue'), /unexpected response \(HTTP 502\)/);
});
