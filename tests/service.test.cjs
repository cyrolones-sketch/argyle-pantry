const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const workerPromise = import(pathToFileURL(path.resolve('_worker.js')).href);
const env = { RESEND_API_KEY: 'test-not-a-real-key', ASSETS: { fetch: () => new Response('asset') } };
function nextOpenDate() {
  let date = new Date(Date.now() + 3 * 86400000);
  while (date.getUTCDay() === 6) date = new Date(+date + 86400000);
  return date.toISOString().slice(0, 10);
}
function order() { return { customer: { name: 'Test guest', phone: '0400000000', email: 'test@example.com', pickupDate: nextOpenDate(), pickupTime: '13:00', serviceType: 'Takeaway', cutleryNeeded: true, cutleryCount: 2, notes: 'Test only' }, items: [{ name: 'Karaage Chicken Don', variant: 'Curry', quantity: 2, price: '$0.01' }] }; }
async function send(payload, route = 'orders', headers = {}) {
  return (await workerPromise).default.fetch(new Request(`https://argylepantry.com.au/api/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': '12345678-1234-4321-8234-123456789012', ...headers }, body: JSON.stringify(payload) }), env);
}

test('shared Hobart calendar: Saturdays, past dates, specials and exact notice', async () => {
  await workerPromise;
  const P = globalThis.Pantry;
  assert.equal(P.schedule('2026-09-05').closed, true);
  assert.equal(P.schedule('2026-08-16').closed, true);
  assert.equal(P.schedule('2026-08-14').close, '18:00');
  const now = new Date('2026-09-07T01:00:30Z');
  assert.equal(P.nowParts(now).date, '2026-09-07');
  assert.ok(P.dateTimeError('2026-09-07', '11:15', 'order', now));
  assert.ok(P.dateTimeError('2026-09-07', '11:30', 'order', new Date('2026-09-07T01:15:01Z')));
  assert.equal(P.dateTimeError('2026-09-07', '11:30', 'order', now), '');
  assert.ok(P.dateTimeError('2026-09-06', '13:00', 'reservation', now));
  assert.ok(P.dateTimeError('2026-09-07', '11:30', 'reservation', new Date('2026-09-07T02:00:00Z')));
  assert.equal(P.validDate('2026-02-30'), false);
  assert.ok(P.dateTimeError('2026-09-07', '19:99', 'order', now));
  assert.deepEqual(P.slots('2026-09-05', 'order', now), []);
  assert.deepEqual(P.slots('2026-09-07', 'order', new Date('2026-09-07T10:16:00Z')), []);
  assert.equal(P.nowParts(new Date('2026-12-01T13:00:00Z')).date, '2026-12-02');
});

test('order uses server prices, sends store first, escapes notes and returns reference', async () => {
  const calls = [];
  const original = global.fetch;
  global.fetch = async (url, options) => { calls.push({ url, ...options, parsed: JSON.parse(options.body) }); return Response.json({ id: `email-${calls.length}` }); };
  try {
    const payload = order(); payload.customer.notes = '<img src=x onerror=alert(1)>';
    const response = await send(payload), result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.total, '$33.00');
    assert.equal(result.items[0].price, '$16.50');
    assert.match(result.reference, /^AP-O-[A-F0-9]{16}$/);
    assert.equal(calls[0].parsed.to[0], 'cyrolones@gmail.com');
    assert.equal(calls[1].parsed.to[0], 'test@example.com');
    assert.equal(result.receiptSent, true);
    assert.ok(calls[0].parsed.html.includes('&lt;img'));
    assert.ok(calls[0].parsed.html.includes(result.reference));
    await send(payload);
    assert.equal(calls[0].headers['Idempotency-Key'], calls[2].headers['Idempotency-Key']);
    assert.equal(calls[0].body, calls[2].body);
    assert.notEqual(calls[0].headers['Idempotency-Key'], calls[1].headers['Idempotency-Key']);
  } finally { global.fetch = original; }
});

test('failed store email never sends a customer receipt', async () => {
  const original = global.fetch; let calls = 0;
  global.fetch = async () => { calls++; return new Response('', { status: 503 }); };
  try { assert.equal((await send(order())).status, 503); assert.equal(calls, 1); } finally { global.fetch = original; }
});

test('failed customer receipt preserves successful order', async () => {
  const original = global.fetch; let calls = 0;
  global.fetch = async () => ++calls === 1 ? Response.json({ id: 'owner-accepted' }) : new Response('', { status: 503 });
  try { const response = await send(order()); assert.equal(response.status, 200); assert.equal((await response.json()).receiptSent, false); } finally { global.fetch = original; }
});

test('invalid orders and reservations cannot trigger email', async () => {
  const original = global.fetch;
  global.fetch = () => { throw new Error('Email should not be attempted'); };
  try {
    for (const change of [p => p.items[0].name = 'Not on menu', p => p.items[0].variant = 'Unknown', p => p.items[0].quantity = -1, p => p.items[0].quantity = 51, p => p.customer.pickupDate = '2020-01-01', p => p.customer.pickupTime = '21:00', p => p.customer.cutleryCount = 0]) {
      const payload = order(); change(payload); assert.equal((await send(payload)).status, 400);
    }
    const reservation = { name: 'Test', email: 'test@example.com', phone: '0400000000', date: '2020-01-01', time: '13:00', guests: '2' };
    assert.equal((await send(reservation, 'reservations')).status, 400);
    assert.equal((await send(order(), 'orders', { Origin: 'https://unrelated.example' })).status, 403);
  } finally { global.fetch = original; }
});

test('private project files are not publicly served', async () => {
  const worker = (await workerPromise).default;
  for (const path of ['/.env', '/server.js', '/reports/test.html', '/migrations/0001_submissions.sql', '/package.json', '/assets/../server.js']) {
    assert.equal((await worker.fetch(new Request(`https://argylepantry.com.au${path}`), env)).status, 404);
  }
  assert.equal((await worker.fetch(new Request('https://argylepantry.com.au/menu.html'), env)).status, 200);
});

test('optional D1 journal stores requests and retries only the failed receipt', async () => {
  const { DatabaseSync } = require('node:sqlite');
  const fs = require('node:fs');
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync('migrations/0001_submissions.sql', 'utf8'));
  env.DB = { prepare(sql) { return { bind(...args) { return { run: async () => db.prepare(sql).run(...args), first: async () => db.prepare(sql).get(...args) }; } }; } };
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push(JSON.parse(options.body).to[0]);
    return calls.length === 2 ? new Response('', { status: 503 }) : Response.json({ id: `id-${calls.length}` });
  };
  try {
    const first = await (await send(order())).json();
    assert.equal(first.receiptSent, false);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM submissions').get().n, 1);
    const retry = await (await send(order())).json();
    assert.equal(retry.receiptSent, true);
    assert.equal(first.reference, retry.reference);
    assert.deepEqual(calls, ['cyrolones@gmail.com', 'test@example.com', 'test@example.com']);
    await send(order());
    assert.equal(calls.length, 3);
  } finally { global.fetch = original; delete env.DB; db.close(); }
});
