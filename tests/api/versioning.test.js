// หัวข้อ 8: Versioning ของแบบฟอร์ม — แก้เฉพาะฟอร์มที่เทสต์สร้างเอง (ไม่แตะฟอร์มตั้งต้น 15 ฟอร์ม)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request, as } from '../lib/api.js';
import { createForm, retireForm, testSchema, minimalData } from '../lib/fixtures.js';

let code;
before(async () => { code = await createForm('ndmi', testSchema(), 'ฟอร์มทดสอบเวอร์ชัน'); });
after(async () => { await retireForm(code); });

const admin = () => as('admin');
const getForm = async () => (await request('GET', `/api/admin/forms/${code}`, { token: await admin() })).body;
const putForm = async (body) => request('PUT', `/api/admin/forms/${code}`, { token: await admin(), body: { title: 'ฟอร์มทดสอบเวอร์ชัน', ...body } });
const newCase = async (data = minimalData()) => request('POST', '/api/cases', { token: await as('ndmi'), body: { templateCode: code, data } });

// เรียงคีย์ใหม่ทั้งหมด (เนื้อหาเท่าเดิม)
const reorder = (v) => (Array.isArray(v) ? v.map(reorder) : v && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reorder(x)])) : v);

test('ฟอร์มใหม่เริ่มที่ version 1 และ code ขึ้นต้นด้วยรหัสหน่วยงาน', async () => {
  const f = await getForm();
  assert.equal(f.version, 1);
  assert.match(code, /^ndmi-/);
  assert.equal(f.org.code, 'ndmi');
});

test('PUT เฉพาะชื่อ/ไม่ส่ง schema / schema เดิมแต่เรียงคีย์ต่างกัน → version ไม่เพิ่ม', async () => {
  const v0 = (await getForm()).version;
  assert.equal((await putForm({ department: 'แผนกทดสอบ' })).body.version, v0);
  const cur = await getForm();
  const r = await putForm({ schema: reorder(cur.schema) });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.version, v0);
});

test('เปลี่ยน schema → version +1, เคสเดิมยังได้ schema/version เดิม, เคสใหม่ได้เวอร์ชันใหม่', async () => {
  const before = await getForm();
  const { body: old } = await newCase();
  assert.equal(old.template.version, before.version);

  const r = await putForm({ schema: testSchema([{ id: 'c3', label: 'ข้อใหม่ในเวอร์ชันถัดไป' }]) });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.version, before.version + 1);

  const g = await request('GET', `/api/cases/${old.id}`, { token: await as('ndmi') });
  assert.equal(g.body.template.version, before.version);
  assert.deepEqual(g.body.template.schema.sections[0].items.map((i) => i.id), ['c1', 'c2']);

  const { body: fresh } = await newCase();
  assert.equal(fresh.template.version, before.version + 1);
  assert.deepEqual(fresh.template.schema.sections[0].items.map((i) => i.id), ['c1', 'c2', 'c3']);

  // แก้เคสเดิม: sanitize/progress ใช้ schema เวอร์ชันเดิม (c3 ถูกตัด, ตัวหาร = 4)
  const u = await request('PUT', `/api/cases/${old.id}`, {
    token: await as('ndmi'),
    body: { data: minimalData({ checks: { c1: { checked: true }, c3: { checked: true } } }) },
  });
  assert.equal(u.status, 200, u.text);
  assert.ok(!('c3' in u.body.data.checks));
  assert.equal(u.body.progress, 25);
  assert.equal(u.body.template.version, before.version);

  // หน้าจัดการฟอร์มนับเคสเปิดที่ยังใช้เวอร์ชันเก่า
  const list = await request('GET', '/api/admin/forms', { token: await admin() });
  const row = list.body.templates.find((t) => t.code === code);
  assert.ok(row.old_version_open >= 1);
});

test('เปลี่ยน schema อีกครั้ง → version +1 ต่อเนื่อง และเพิ่มช่องบังคับไม่กระทบการแก้เคสเก่า', async () => {
  const v = (await getForm()).version;
  const { body: old } = await newCase();
  const s = testSchema([{ id: 'c3', label: 'ข้อใหม่ในเวอร์ชันถัดไป' }]);
  s.header.push({ key: 'extraReq', label: 'ช่องบังคับใหม่', type: 'text', required: true });
  const r = await putForm({ schema: s });
  assert.equal(r.body.version, v + 1);
  // เคสเก่าแก้ได้โดยไม่ต้องกรอกช่องบังคับใหม่
  const u = await request('PUT', `/api/cases/${old.id}`, { token: await as('ndmi'), body: { data: minimalData() } });
  assert.equal(u.status, 200, u.text);
  // เคสใหม่ต้องกรอก
  const n = await newCase();
  assert.equal(n.status, 400);
  assert.match(n.body.error, /ช่องบังคับใหม่/);
});

test('schema ไม่ถูกต้อง → 400 และ version ไม่เปลี่ยน', async () => {
  const v = (await getForm()).version;
  for (const schema of [{ header: [], sections: [] }, { header: 'x', sections: [{}] }, { header: [], sections: [{ id: 'a', title: 't', type: 'weird' }] }]) {
    const r = await putForm({ schema });
    assert.equal(r.status, 400, `${JSON.stringify(schema)} → ${r.status}`);
  }
  assert.equal((await getForm()).version, v);
});

test('ปิดใช้งานฟอร์ม: สร้างเคสใหม่ → 404 แต่เคสเดิมยังเปิดดูได้', async () => {
  const { body: c } = await newCase(minimalData({ header: { requesterOrg: 'x', extraReq: 'y' } }));
  assert.ok(c.id);
  assert.equal((await putForm({ active: false })).status, 200);
  assert.equal((await newCase(minimalData({ header: { requesterOrg: 'x', extraReq: 'y' } }))).status, 404);
  assert.equal((await request('GET', `/api/cases/${c.id}`, { token: await as('ndmi') })).status, 200);
  await putForm({ active: true });
});

test('admin PUT ฟอร์มที่ไม่มี → 404 / ไม่มี title → 400', async () => {
  const token = await admin();
  assert.equal((await request('PUT', '/api/admin/forms/no-such-form', { token, body: { title: 'x' } })).status, 404);
  assert.equal((await request('PUT', `/api/admin/forms/${code}`, { token, body: { title: '' } })).status, 400);
});
