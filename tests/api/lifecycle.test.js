// หัวข้อ 3 (Lifecycle) และ 9 (case_logs)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request, as, createCase } from '../lib/api.js';
import { createForm, retireForm, testSchema, minimalData } from '../lib/fixtures.js';

let noFooter; // ฟอร์มที่ footer ไม่บังคับผู้ปิดงาน/วันที่แล้วเสร็จ
before(async () => { noFooter = await createForm('okmd', { ...testSchema(), footer: { note: false, closedBy: false, completedDate: false } }, 'ฟอร์มทดสอบไม่มี footer'); });
after(async () => { await retireForm(noFooter); });

const actions = (c) => c.logs.map((l) => l.action);
const post = async (id, action, who) => request('POST', `/api/cases/${id}/${action}`, { token: await as(who) });

test('ปิดงาน: ขาดผู้ปิดงาน → 400 ระบุ "ผู้ปิดงาน" / ขาดวันที่แล้วเสร็จ → 400 ระบุช่องนั้น', async () => {
  const { body: c } = await createCase('ndmi', 'ndmi-consult', { complete: true });
  const token = await as('ndmi');
  const put1 = await request('PUT', `/api/cases/${c.id}`, { token, body: { data: { ...c.data, closedBy: '  ' } } });
  assert.equal(put1.status, 200);
  const r1 = await post(c.id, 'close', 'ndmi');
  assert.equal(r1.status, 400);
  assert.match(r1.body.error, /ผู้ปิดงาน/);
  assert.doesNotMatch(r1.body.error, /วันที่ดำเนินการแล้วเสร็จ/);

  await request('PUT', `/api/cases/${c.id}`, { token, body: { data: { ...c.data, completedDate: '' } } });
  const r2 = await post(c.id, 'close', 'ndmi');
  assert.equal(r2.status, 400);
  assert.match(r2.body.error, /วันที่ดำเนินการแล้วเสร็จ/);
  const now = (await request('GET', `/api/cases/${c.id}`, { token })).body;
  assert.equal(now.status, 'open');
  assert.ok(!actions(now).includes('ปิดงาน'), 'ปิดไม่สำเร็จต้องไม่มี log ปิดงาน');
});

test('ฟอร์มที่ footer ไม่มี closedBy/completedDate ปิดงานได้โดยไม่ต้องกรอก', async () => {
  const r = await request('POST', '/api/cases', { token: await as('okmd'), body: { templateCode: noFooter, data: minimalData() } });
  assert.equal(r.status, 201, r.text);
  const cl = await post(r.body.id, 'close', 'okmd');
  assert.equal(cl.status, 200, cl.text);
  assert.equal(cl.body.status, 'closed');
  assert.ok(cl.body.closedAt);
});

test('ปิดแล้ว: PUT → 409, close ซ้ำ → 409, staff reopen → 403', async () => {
  const { body: c } = await createCase('okmd', 'okmd-capability', { complete: true });
  assert.equal((await post(c.id, 'close', 'okmd')).status, 200);
  assert.equal((await request('PUT', `/api/cases/${c.id}`, { token: await as('okmd'), body: { data: c.data } })).status, 409);
  assert.equal((await post(c.id, 'close', 'okmd')).status, 409);
  assert.equal((await post(c.id, 'reopen', 'okmd')).status, 403);
});

test('วงจรเต็ม: สร้าง → แก้ → ปิด → admin เปิดใหม่ → ยกเลิก และ case_logs ครบตามลำดับ', async () => {
  const { body: c } = await createCase('tkpark', 'tkpark-borrow', { complete: true });
  assert.equal(c.status, 'open');
  assert.deepEqual(actions(c), ['สร้างเอกสาร']);
  const ed = await request('PUT', `/api/cases/${c.id}`, { token: await as('tkpark'), body: { data: c.data } });
  assert.equal(ed.status, 200);
  const cl = await post(c.id, 'close', 'tkpark');
  assert.equal(cl.body.status, 'closed');
  assert.ok(cl.body.closedAt);
  const ro = await post(c.id, 'reopen', 'admin');
  assert.equal(ro.status, 200);
  assert.equal(ro.body.status, 'open');
  assert.equal(ro.body.closedAt, null);
  const ca = await post(c.id, 'cancel', 'admin');
  assert.equal(ca.status, 200);
  assert.equal(ca.body.status, 'cancelled');
  assert.deepEqual(actions(ca.body), ['ยกเลิก', 'เปิดงานใหม่', 'ปิดงาน', 'บันทึกการแก้ไข', 'สร้างเอกสาร']);
  // log ต้องระบุผู้ทำ และเวลาเรียงจากใหม่ไปเก่า
  assert.ok(ca.body.logs.every((l) => l.display_name && l.created_at));
  const times = ca.body.logs.map((l) => Date.parse(l.created_at));
  assert.deepEqual(times, [...times].sort((a, b) => b - a));
  assert.equal(ca.body.logs[0].display_name, 'ผู้ดูแลระบบ');
});

test('ยกเลิกแล้ว: PUT → 409, close → 409', async () => {
  const { body: c } = await createCase('ndmi', 'ndmi-consult', { complete: true });
  assert.equal((await post(c.id, 'cancel', 'ndmi')).status, 200);
  assert.equal((await request('PUT', `/api/cases/${c.id}`, { token: await as('ndmi'), body: { data: c.data } })).status, 409);
  assert.equal((await post(c.id, 'close', 'ndmi')).status, 409);
});

test('ยกเลิกเคสที่ปิดงานแล้ว → 409 (ต้องเปิดใหม่ก่อน)', async () => {
  const { body: c } = await createCase('okmd', 'okmd-capability', { complete: true });
  await post(c.id, 'close', 'okmd');
  const r = await post(c.id, 'cancel', 'okmd');
  assert.equal(r.status, 409, `ได้ ${r.status} สถานะ ${r.body?.status}`);
});

test('ยกเลิกซ้ำ → 409 และไม่เพิ่ม log ซ้ำ', async () => {
  const { body: c } = await createCase('okmd', 'okmd-capability');
  await post(c.id, 'cancel', 'okmd');
  const r = await post(c.id, 'cancel', 'okmd');
  assert.equal(r.status, 409, `ได้ ${r.status}`);
  const now = (await request('GET', `/api/cases/${c.id}`, { token: await as('okmd') })).body;
  assert.deepEqual(actions(now), ['ยกเลิก', 'สร้างเอกสาร']);
});

test('reopen เคสที่ยังเปิดอยู่ → 409 และไม่เพิ่ม log', async () => {
  const { body: c } = await createCase('okmd', 'okmd-capability');
  const r = await post(c.id, 'reopen', 'admin');
  assert.equal(r.status, 409, `ได้ ${r.status}`);
  const now = (await request('GET', `/api/cases/${c.id}`, { token: await as('okmd') })).body;
  assert.deepEqual(actions(now), ['สร้างเอกสาร']);
});

test('action อื่นนอกจาก close|reopen|cancel → 404', async () => {
  const { body: c } = await createCase('okmd', 'okmd-capability');
  assert.equal((await post(c.id, 'delete', 'admin')).status, 404);
});
