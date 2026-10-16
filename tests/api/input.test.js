// หัวข้อ 10: Input ผิดรูปแบบ → ต้องไม่ได้ 500
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request, as, createCase } from '../lib/api.js';

const not500 = (r, what) => assert.ok(r.status < 500, `${what} ได้ ${r.status}: ${r.text.slice(0, 200)}`);

test('id ไม่ใช่ตัวเลข: GET/PUT/close/DELETE /api/cases/abc → 400 หรือ 404', async () => {
  const admin = await as('admin');
  const bad = [];
  for (const [m, url] of [['GET', '/api/cases/abc'], ['PUT', '/api/cases/abc'], ['POST', '/api/cases/abc/close'], ['POST', '/api/cases/abc/reopen'], ['DELETE', '/api/cases/abc'], ['GET', '/api/cases/1.5']]) {
    const r = await request(m, url, { token: admin, body: m === 'PUT' ? { data: {} } : undefined });
    if (![400, 404].includes(r.status)) bad.push(`${m} ${url} → ${r.status}`);
  }
  assert.deepEqual(bad, []);
});

test('id เกินช่วง integer (/api/cases/99999999999) → 404', async () => {
  const r = await request('GET', '/api/cases/99999999999', { token: await as('admin') });
  assert.equal(r.status, 404, `ได้ ${r.status}`);
});

test('id ไม่ใช่ตัวเลขฝั่ง staff (/api/cases/abc)', async () => {
  not500(await request('GET', '/api/cases/abc', { token: await as('okmd') }), 'staff GET /api/cases/abc');
});

test('id ที่ไม่มีอยู่: GET/PUT/close → 404', async () => {
  const token = await as('admin');
  assert.equal((await request('GET', '/api/cases/2147483000', { token })).status, 404);
  assert.equal((await request('PUT', '/api/cases/2147483000', { token, body: { data: {} } })).status, 404);
  assert.equal((await request('POST', '/api/cases/2147483000/cancel', { token })).status, 404);
});

test('DELETE id ที่ไม่มีอยู่ → 404', async () => {
  const r = await request('DELETE', '/api/cases/2147483000', { token: await as('admin') });
  assert.equal(r.status, 404, `ได้ ${r.status} ${r.text}`);
});

test('PUT /api/users/abc (admin) → 400/404', async () => {
  const r = await request('PUT', '/api/users/abc', { token: await as('admin'), body: { displayName: 'x' } });
  assert.ok([400, 404].includes(r.status), `ได้ ${r.status}`);
});

test('PUT /api/users/:id ที่ไม่มี → 404', async () => {
  assert.equal((await request('PUT', '/api/users/2147483000', { token: await as('admin'), body: {} })).status, 404);
});

test('JSON เสีย → 400 (login / cases / forms)', async () => {
  const token = await as('admin');
  for (const [m, url] of [['POST', '/api/auth/login'], ['POST', '/api/cases'], ['POST', '/api/admin/forms'], ['PUT', '/api/admin/forms/okmd-capability']]) {
    const r = await request(m, url, { token, raw: '{"bad json', body: {} });
    assert.equal(r.status, 400, `${m} ${url} ได้ ${r.status}`);
  }
});

test('body ว่าง / ไม่มี Content-Type → ไม่ได้ 500', async () => {
  const token = await as('admin');
  const calls = [
    ['POST', '/api/cases', 404],
    ['POST', '/api/auth/password', 400],
    ['POST', '/api/users', 400],
    ['POST', '/api/admin/forms', 400],
    ['PUT', '/api/admin/forms/okmd-capability', 400],
  ];
  for (const [m, url, want] of calls) {
    const r = await request(m, url, { token });
    assert.equal(r.status, want, `${m} ${url} ได้ ${r.status}: ${r.text.slice(0, 120)}`);
  }
  const { body: c } = await createCase('okmd', 'okmd-capability');
  const r = await request('PUT', `/api/cases/${c.id}`, { token });
  assert.equal(r.status, 400, `PUT เคสไม่มี body ได้ ${r.status}`);
});

test('body เป็น array / JSON null → ไม่ได้ 500', async () => {
  const token = await as('admin');
  not500(await request('POST', '/api/cases', { token, body: [] }), 'POST /api/cases []');
  not500(await request('POST', '/api/auth/login', { raw: 'null', body: {} }), 'login null');
  not500(await request('POST', '/api/admin/forms', { token, body: [] }), 'POST forms []');
});

test('body ใหญ่เกิน 1mb → 413', async () => {
  const r = await request('POST', '/api/cases', { token: await as('admin'), body: { templateCode: 'okmd-capability', data: { note: 'x'.repeat(1_100_000) } } });
  assert.equal(r.status, 413);
});

test('page=-1&size=99999 → 200 page=1 size=100', async () => {
  const r = await request('GET', '/api/cases?page=-1&size=99999', { token: await as('admin') });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.page, 1);
  assert.equal(r.body.size, 100);
  assert.ok(r.body.items.length <= 100);
});

test('page/size ไม่ใช่ตัวเลข / 0 / ทศนิยม → 200', async () => {
  const token = await as('admin');
  for (const qs of ['page=abc&size=xyz', 'page=0&size=0', 'page=1.5&size=2.5', 'page=&size=']) {
    not500(await request('GET', `/api/cases?${qs}`, { token }), qs);
  }
});

test('size ติดลบ (size=-5) → ไม่ได้ 500', async () => {
  not500(await request('GET', '/api/cases?size=-5', { token: await as('okmd') }), 'size=-5');
});

test('page ใหญ่มาก (page=1e20 / Infinity) → ไม่ได้ 500', async () => {
  const token = await as('okmd');
  const bad = [];
  for (const qs of ['page=1e20', 'page=Infinity']) {
    const r = await request('GET', `/api/cases?${qs}`, { token });
    if (r.status >= 500) bad.push(`${qs} → ${r.status}`);
  }
  assert.deepEqual(bad, []);
});

test('from/to รูปแบบถูกแต่วันที่ไม่มีจริง (2026-99-99) → ไม่ได้ 500', async () => {
  const token = await as('okmd');
  const bad = [];
  for (const qs of ['from=2026-99-99', 'to=2026-02-30']) {
    const r = await request('GET', `/api/cases?${qs}`, { token });
    if (r.status >= 500) bad.push(`${qs} → ${r.status}`);
  }
  assert.deepEqual(bad, []);
});

test('from/to ผิดรูปแบบ (ไม่ใช่ YYYY-MM-DD) ถูกข้าม → 200', async () => {
  const token = await as('okmd');
  for (const qs of ['from=abc', "to=2026-01-01'--", 'from=']) {
    const r = await request('GET', `/api/cases?${qs}`, { token });
    assert.equal(r.status, 200, `${qs} ได้ ${r.status}`);
  }
});

test('query ซ้ำเป็น array (?org=a&org=b, ?status[]=x) → ไม่ได้ 500', async () => {
  const token = await as('admin');
  for (const qs of ['org=okmd&org=ndmi', 'status[]=open', 'q=a&q=b', 'from[]=2026-01-01']) not500(await request('GET', `/api/cases?${qs}`, { token }), qs);
});

test('q มีอักขระพิเศษ SQL → 200 (ไม่เกิด injection)', async () => {
  const r = await request('GET', `/api/cases?q=${encodeURIComponent("%'; DROP TABLE cases;--")}`, { token: await as('okmd') });
  assert.equal(r.status, 200);
});

test('วันที่รับเรื่องรูปแบบถูกแต่ไม่มีจริง (2026-02-30) → 400 และไม่กินเลขที่เอกสาร', async () => {
  const token = await as('ndmi');
  const { body: tpl } = await request('GET', '/api/templates/ndmi-consult', { token });
  const { fillCase } = await import('../lib/api.js');
  const a = await createCase('ndmi', 'ndmi-consult');
  const data = fillCase(tpl.schema);
  data.header.receiveDate = '2026-02-30';
  const bad = await request('POST', '/api/cases', { token, body: { templateCode: 'ndmi-consult', data } });
  const b = await createCase('ndmi', 'ndmi-consult');
  assert.equal(Number(b.body.caseNo.slice(-5)), Number(a.body.caseNo.slice(-5)) + 1, `เลขข้าม: ${a.body.caseNo} → ${b.body.caseNo}`);
  assert.equal(bad.status, 400, `ได้ ${bad.status}`);
});

test('templateCode ไม่ใช่สตริง / ไม่มี → 404', async () => {
  const token = await as('okmd');
  for (const templateCode of [undefined, null, 123, { $ne: 1 }, ['okmd-capability']]) {
    const r = await request('POST', '/api/cases', { token, body: { templateCode, data: {} } });
    assert.equal(r.status, 404, `templateCode=${JSON.stringify(templateCode)} ได้ ${r.status}`);
  }
});

test('ล็อกอินด้วย username เป็น object → 401', async () => {
  const r = await request('POST', '/api/auth/login', { body: { username: { $ne: null }, password: { $ne: null } } });
  assert.ok(r.status === 401 || r.status === 400, `ได้ ${r.status}`);
});
