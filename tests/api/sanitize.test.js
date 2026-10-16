// หัวข้อ 5 (ช่องบังคับ), 6 (sanitize), 7 (progress) — ใช้ฟอร์มทดสอบที่สร้างเอง
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request, as } from '../lib/api.js';
import { createForm, retireForm, minimalData } from '../lib/fixtures.js';

let code;
before(async () => { code = await createForm('okmd'); });
after(async () => { await retireForm(code); });

const create = async (data) => request('POST', '/api/cases', { token: await as('okmd'), body: { templateCode: code, data } });
const update = async (id, data) => request('PUT', `/api/cases/${id}`, { token: await as('okmd'), body: { data } });

// ---------- 5. ช่องบังคับ ----------
test('header บังคับว่าง → 400 พร้อมชื่อช่อง', async () => {
  const r = await create(minimalData({ header: { requesterOrg: '' } }));
  assert.equal(r.status, 400);
  assert.match(r.body.error, /ผู้ขอรับบริการทดสอบ/);
});

test('header บังคับเป็นช่องว่างล้วน → 400', async () => {
  const r = await create(minimalData({ header: { requesterOrg: '   ' } }));
  assert.equal(r.status, 400);
});

test('fields บังคับว่าง → 400 พร้อมชื่อช่อง / ขาดทั้งสองช่องระบุครบ', async () => {
  const r = await create(minimalData({ fields: { f1: '', dd: '2026-10-16' } }));
  assert.equal(r.status, 400);
  assert.match(r.body.error, /ช่องบังคับทดสอบ/);
  const r2 = await create({ header: {}, fields: { dd: '2026-10-16' } });
  assert.equal(r2.status, 400);
  assert.match(r2.body.error, /ผู้ขอรับบริการทดสอบ/);
  assert.match(r2.body.error, /ช่องบังคับทดสอบ/);
});

test('PUT ล้างช่องบังคับ → 400 และข้อมูลเดิมไม่ถูกเขียนทับ', async () => {
  const { body: c } = await create(minimalData());
  const r = await update(c.id, minimalData({ header: { requesterOrg: '' } }));
  assert.equal(r.status, 400);
  const g = await request('GET', `/api/cases/${c.id}`, { token: await as('okmd') });
  assert.equal(g.body.data.header.requesterOrg, 'หน่วยงานทดสอบ');
  assert.deepEqual(g.body.logs.map((l) => l.action), ['สร้างเอกสาร']);
});

test('dateField ของส่วน checks ที่ตั้ง required ว่าง → 400', async () => {
  const r = await create(minimalData({ fields: { f1: 'มีค่า', dd: '' } }));
  assert.equal(r.status, 400, `ได้ ${r.status}`);
});

// ---------- 6. sanitize ----------
test('key แปลกปลอมถูกตัดทิ้งทุกระดับ', async () => {
  const data = minimalData({
    evil: 'x', __proto__x: 1, status: 'closed',
    header: { requesterOrg: 'ก', hacked: 'x' },
    fields: { f1: 'ข', dd: '2026-10-16', zzz: 'x' },
    checks: { c1: { checked: true, extra: 1 }, nope: { checked: true } },
    steps: { s1: { value: 'ok', inject: '<script>' }, s9: { value: 'ok' } },
  });
  const r = await create(data);
  assert.equal(r.status, 201, r.text);
  const d = r.body.data;
  assert.deepEqual(Object.keys(d).sort(), ['checks', 'closedBy', 'completedDate', 'fields', 'header', 'note', 'steps']);
  assert.deepEqual(Object.keys(d.header).sort(), ['receiveDate', 'requesterOrg']);
  assert.deepEqual(Object.keys(d.fields).sort(), ['dd', 'f1', 'f2']);
  assert.deepEqual(Object.keys(d.checks).sort(), ['c1', 'c2']);
  assert.deepEqual(Object.keys(d.checks.c1).sort(), ['checked', 'remark']);
  assert.deepEqual(Object.keys(d.steps).sort(), ['s1', 's2']);
  assert.deepEqual(Object.keys(d.steps.s1).sort(), ['amount', 'date', 'operator', 'remark', 'value']);
  assert.ok(!('amount' in d.steps.s2), 'ข้อที่ไม่มี amount ต้องไม่มีช่อง amount');
  assert.equal(r.body.status, 'open');
});

test('ข้อความยาวเกินถูกตัดตามขนาด (header 300 / fields 500 / remark 500 / note 5000 / closedBy 200)', async () => {
  const L = (n) => 'ก'.repeat(n);
  const r = await create(minimalData({
    header: { requesterOrg: L(1000) },
    fields: { f1: L(1000), dd: '2026-10-16' },
    checks: { c1: { checked: true, remark: L(1000) } },
    steps: { s1: { value: 'ok', operator: L(1000), amount: '9'.repeat(100), date: L(100) } },
    note: L(9000), closedBy: L(1000), completedDate: L(100),
  }));
  assert.equal(r.status, 201, r.text);
  const d = r.body.data;
  assert.equal(d.header.requesterOrg.length, 300);
  assert.equal(d.fields.f1.length, 500);
  assert.equal(d.checks.c1.remark.length, 500);
  assert.equal(d.steps.s1.operator.length, 200);
  assert.equal(d.steps.s1.amount.length, 30);
  assert.equal(d.steps.s1.date.length, 20);
  assert.equal(d.note.length, 5000);
  assert.equal(d.closedBy.length, 200);
  assert.equal(d.completedDate.length, 20);
});

test('ค่า step ที่ไม่อยู่ใน options → "" / ค่าที่อยู่ใน options คงไว้', async () => {
  const r = await create(minimalData({ steps: { s1: { value: 'hacked' }, s2: { value: 'ok' } } }));
  assert.equal(r.status, 201);
  assert.equal(r.body.data.steps.s1.value, '');
  assert.equal(r.body.data.steps.s2.value, 'ok');
  const r2 = await create(minimalData({ steps: { s1: { value: 'no' }, s2: { value: 'no' } } })); // 'no' มีเฉพาะใน s1
  assert.equal(r2.body.data.steps.s1.value, 'no');
  assert.equal(r2.body.data.steps.s2.value, '');
});

test('ค่าที่ไม่ใช่สตริงถูกแปลงเป็นสตริง / null → ""', async () => {
  const r = await create(minimalData({ header: { requesterOrg: 12345, receiveDate: null } }));
  assert.equal(r.status, 201, r.text);
  assert.equal(r.body.data.header.requesterOrg, '12345');
  assert.equal(r.body.data.header.receiveDate, '');
});

test('data ไม่ใช่ object (string / array / number) → 400 ช่องบังคับ', async () => {
  for (const data of ['abc', [1, 2], 42]) {
    const r = await create(data);
    assert.equal(r.status, 400, `data=${JSON.stringify(data)} ได้ ${r.status}`);
  }
});

test('data = null (POST และ PUT) → 400 ไม่ใช่ 500', async () => {
  const bad = [];
  const p = await create(null);
  if (p.status !== 400) bad.push(`POST → ${p.status}`);
  const { body: c } = await create(minimalData());
  const u = await update(c.id, null);
  if (u.status !== 400) bad.push(`PUT → ${u.status}`);
  assert.deepEqual(bad, []);
});

// ---------- 7. progress ----------
test('progress = (checks ที่ติ๊ก + steps ที่มีค่า) / ทั้งหมด (2 checks + 2 steps)', async () => {
  const cases = [
    [{}, {}, 0],
    [{ c1: { checked: true } }, {}, 25],
    [{ c1: { checked: true } }, { s1: { value: 'ok' } }, 50],
    [{ c1: { checked: true }, c2: { checked: true } }, { s1: { value: 'no' } }, 75],
    [{ c1: { checked: true }, c2: { checked: true } }, { s1: { value: 'ok' }, s2: { value: 'ok' } }, 100],
    [{ c1: { checked: false } }, { s1: { value: 'bogus' } }, 0], // ค่าไม่อยู่ใน options ไม่นับ
  ];
  for (const [checks, steps, want] of cases) {
    const r = await create(minimalData({ checks, steps }));
    assert.equal(r.status, 201, r.text);
    assert.equal(r.body.progress, want, JSON.stringify({ checks, steps }));
  }
});

test('progress คำนวณใหม่เมื่อ PUT และแสดงใน /api/cases', async () => {
  const { body: c } = await create(minimalData());
  assert.equal(c.progress, 0);
  const u = await update(c.id, minimalData({ checks: { c1: { checked: true }, c2: { checked: true } }, steps: { s2: { value: 'ok' } } }));
  assert.equal(u.status, 200);
  assert.equal(u.body.progress, 75);
  const list = await request('GET', `/api/cases?template=${code}&size=100`, { token: await as('okmd') });
  assert.equal(list.body.items.find((x) => x.id === c.id).progress, 75);
});

test('dateField ไม่นับใน progress / remark อย่างเดียวไม่นับ', async () => {
  const r = await create(minimalData({ checks: { c1: { checked: false, remark: 'มีหมายเหตุ' } }, steps: { s1: { remark: 'x', date: '2026-10-16' } } }));
  assert.equal(r.body.progress, 0);
});
