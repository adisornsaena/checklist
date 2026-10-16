// หัวข้อ 2: RBAC — staff เห็นเฉพาะหน่วยงานตน, endpoint ของ admin → 403
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request, as, createCase } from '../lib/api.js';

const ORGS = ['okmd', 'ndmi', 'tkpark'];
const FORM = { okmd: 'okmd-capability', ndmi: 'ndmi-consult', tkpark: 'tkpark-borrow' };

test('catalog: staff แต่ละหน่วยงานเห็นเฉพาะของตน / admin เห็นครบ 3', async () => {
  for (const org of ORGS) {
    const { body } = await request('GET', '/api/catalog', { token: await as(org) });
    assert.deepEqual(body.map((o) => o.code), [org]);
    assert.ok(body[0].templates.every((t) => t.org_code === org));
  }
  const { body } = await request('GET', '/api/catalog', { token: await as('admin') });
  assert.deepEqual(body.map((o) => o.code).sort(), [...ORGS].sort());
});

test('/api/cases: staff เห็นเฉพาะหน่วยงานตน แม้ใส่ ?org= หน่วยงานอื่น', async () => {
  for (const org of ORGS) assert.equal((await createCase(org, FORM[org])).status, 201);
  for (const org of ORGS) {
    const token = await as(org);
    const r = await request('GET', '/api/cases?size=100', { token });
    assert.equal(r.status, 200);
    assert.ok(r.body.items.length > 0);
    assert.ok(r.body.items.every((c) => c.org_code === org), `${org} เห็นเคสหน่วยงานอื่น`);
    const other = ORGS.find((o) => o !== org);
    const r2 = await request('GET', `/api/cases?org=${other}`, { token });
    assert.equal(r2.body.total, 0, `${org} ใช้ ?org=${other} เห็นเคส`);
    const r3 = await request('GET', `/api/cases?template=${FORM[other]}`, { token });
    assert.equal(r3.body.total, 0);
  }
  const all = await request('GET', '/api/cases?size=100', { token: await as('admin') });
  assert.deepEqual([...new Set(all.body.items.map((c) => c.org_code))].sort(), [...ORGS].sort());
});

test('/api/stats: staff เห็นเฉพาะหน่วยงานตน', async () => {
  for (const org of ORGS) {
    const { body } = await request('GET', '/api/stats', { token: await as(org) });
    assert.ok(body.length > 0);
    assert.ok(body.every((r) => r.org_code === org), `${org}: ${[...new Set(body.map((r) => r.org_code))]}`);
  }
  const { body } = await request('GET', '/api/stats', { token: await as('admin') });
  assert.equal(new Set(body.map((r) => r.org_code)).size, 3);
});

test('/api/templates/:code: ของตน → 200 / ของหน่วยงานอื่น → 404 / ไม่มีจริง → 404', async () => {
  const token = await as('ndmi');
  assert.equal((await request('GET', '/api/templates/ndmi-consult', { token })).status, 200);
  assert.equal((await request('GET', '/api/templates/okmd-capability', { token })).status, 404);
  assert.equal((await request('GET', '/api/templates/tkpark-borrow', { token })).status, 404);
  assert.equal((await request('GET', '/api/templates/no-such-form', { token })).status, 404);
});

test('staff GET/PUT/close/cancel เคสหน่วยงานอื่น → 404 และเคสไม่ถูกเปลี่ยน', async () => {
  const { body: c } = await createCase('okmd', 'okmd-capability', { complete: true });
  const token = await as('tkpark');
  assert.equal((await request('GET', `/api/cases/${c.id}`, { token })).status, 404);
  assert.equal((await request('PUT', `/api/cases/${c.id}`, { token, body: { data: c.data } })).status, 404);
  assert.equal((await request('POST', `/api/cases/${c.id}/close`, { token })).status, 404);
  assert.equal((await request('POST', `/api/cases/${c.id}/cancel`, { token })).status, 404);
  const after = await request('GET', `/api/cases/${c.id}`, { token: await as('okmd') });
  assert.equal(after.body.status, 'open');
  assert.deepEqual(after.body.logs.map((l) => l.action), ['สร้างเอกสาร']);
});

test('staff สร้างเคสด้วยฟอร์มหน่วยงานอื่น → 404', async () => {
  const token = await as('okmd');
  const { body: tpl } = await request('GET', '/api/templates/ndmi-consult', { token: await as('ndmi') });
  const { fillCase } = await import('../lib/api.js');
  const r = await request('POST', '/api/cases', { token, body: { templateCode: 'ndmi-consult', data: fillCase(tpl.schema) } });
  assert.equal(r.status, 404);
});

test('staff เรียก /api/users, /api/admin/*, DELETE เคส, reopen → 403', async () => {
  const token = await as('okmd');
  const { body: c } = await createCase('okmd', 'okmd-capability');
  const calls = [
    ['GET', '/api/users'],
    ['POST', '/api/users', { username: 'x-hack', password: 'abcdefgh1', displayName: 'x', role: 'admin' }],
    ['PUT', '/api/users/1', { role: 'admin' }],
    ['GET', '/api/admin/forms'],
    ['GET', '/api/admin/forms/okmd-capability'],
    ['POST', '/api/admin/forms', { orgCode: 'okmd', title: 'x', schema: {} }],
    ['PUT', '/api/admin/forms/okmd-capability', { title: 'แฮก' }],
    ['DELETE', `/api/cases/${c.id}`],
    ['POST', `/api/cases/${c.id}/reopen`],
  ];
  for (const [m, url, body] of calls) {
    const r = await request(m, url, { token, body });
    assert.equal(r.status, 403, `${m} ${url} ได้ ${r.status}`);
  }
  assert.equal((await request('GET', `/api/cases/${c.id}`, { token })).status, 200, 'เคสต้องยังอยู่หลัง DELETE ที่ถูกปฏิเสธ');
});

test('admin ลบเคสได้ → 200 แล้ว GET → 404', async () => {
  const { body: c } = await createCase('ndmi', 'ndmi-consult');
  const admin = await as('admin');
  assert.equal((await request('DELETE', `/api/cases/${c.id}`, { token: admin })).status, 200);
  assert.equal((await request('GET', `/api/cases/${c.id}`, { token: admin })).status, 404);
});
