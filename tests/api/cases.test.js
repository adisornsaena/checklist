import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request, as, createCase } from '../lib/api.js';

const year = new Date().getFullYear() + 543;

test('เลขที่เอกสารตามรูปแบบ <PREFIX>-<พ.ศ.>-<5 หลัก>', async () => {
  for (const [who, code, prefix] of [['okmd', 'okmd-capability', 'OK'], ['ndmi', 'ndmi-refund', 'ND'], ['tkpark', 'tkpark-borrow', 'TK']]) {
    const r = await createCase(who, code);
    assert.equal(r.status, 201, r.text);
    assert.match(r.body.caseNo, new RegExp(`^${prefix}-${year}-\\d{5}$`));
  }
});

test('สร้างเคสพร้อมกัน 20 รายการ เลขที่เอกสารไม่ซ้ำ', async () => {
  const rs = await Promise.all(Array.from({ length: 20 }, () => createCase('ndmi', 'ndmi-consult')));
  rs.forEach((r) => assert.equal(r.status, 201, r.text));
  assert.equal(new Set(rs.map((r) => r.body.caseNo)).size, 20);
});

test('staff ดูเคสของหน่วยงานอื่นไม่ได้ → 404', async () => {
  const { body: c } = await createCase('okmd', 'okmd-capability');
  const r = await request('GET', `/api/cases/${c.id}`, { token: await as('ndmi') });
  assert.equal(r.status, 404);
});

test('ปิดงานต้องกรอกผู้ปิดงานและวันที่แล้วเสร็จ / ปิดแล้วแก้ไม่ได้ / staff เปิดใหม่ไม่ได้', async () => {
  const token = await as('tkpark');
  const { body: incomplete } = await createCase('tkpark', 'tkpark-borrow');
  assert.equal((await request('POST', `/api/cases/${incomplete.id}/close`, { token })).status, 400);

  const { body: c } = await createCase('tkpark', 'tkpark-borrow', { complete: true });
  assert.equal(c.progress, 100);
  const closed = await request('POST', `/api/cases/${c.id}/close`, { token });
  assert.equal(closed.status, 200, closed.text);
  assert.equal(closed.body.status, 'closed');
  assert.equal((await request('PUT', `/api/cases/${c.id}`, { token, body: { data: c.data } })).status, 409);
  assert.equal((await request('POST', `/api/cases/${c.id}/reopen`, { token })).status, 403);

  const reopened = await request('POST', `/api/cases/${c.id}/reopen`, { token: await as('admin') });
  assert.equal(reopened.body.status, 'open');
  assert.deepEqual(reopened.body.logs.map((l) => l.action), ['เปิดงานใหม่', 'ปิดงาน', 'สร้างเอกสาร']);
});

test('ช่องบังคับว่าง → 400', async () => {
  const r = await request('POST', '/api/cases', { token: await as('okmd'), body: { templateCode: 'okmd-capability', data: {} } });
  assert.equal(r.status, 400);
});
