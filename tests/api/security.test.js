// การป้องกันเพิ่มเติม: เพิกถอน token หลังเปลี่ยนรหัสผ่าน, จำกัดการล็อกอินผิด, security headers, CORS,
// ตรวจหน่วยงานของผู้ใช้, ค้นหาแบบตัวอักษรจริง, ค่าติ๊ก/วันที่ที่ผิดรูปแบบ
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { API } from '../lib/env.js';
import { request, login, as, createCase } from '../lib/api.js';
import { tmpUser, retireUser, tmpPassword } from '../lib/fixtures.js';

const temps = [];
after(async () => { for (const u of temps) await retireUser(u); });
const mk = async (o) => { const u = await tmpUser(o); temps.push(u); return u; };

test('เปลี่ยนรหัสผ่านตัวเอง: token เดิมใช้ไม่ได้ / token ใหม่ที่ได้กลับมาใช้ได้', async () => {
  const u = await mk();
  const r = await request('POST', '/api/auth/password', { token: u.token, body: { current: u.password, next: tmpPassword() } });
  assert.equal(r.status, 200, r.text);
  assert.ok(r.body.token);
  assert.equal((await request('GET', '/api/cases', { token: u.token })).status, 401);
  assert.equal((await request('GET', '/api/cases', { token: r.body.token })).status, 200);
});

test('ผู้ดูแลตั้งรหัสผ่านใหม่ให้: token เดิมของผู้ใช้ใช้ไม่ได้ / แก้ข้อมูลอื่นไม่กระทบ token', async () => {
  const u = await mk();
  const admin = await as('admin');
  await request('PUT', `/api/users/${u.id}`, { token: admin, body: { displayName: 'เปลี่ยนชื่อ' } });
  assert.equal((await request('GET', '/api/cases', { token: u.token })).status, 200);
  await request('PUT', `/api/users/${u.id}`, { token: admin, body: { password: tmpPassword() } });
  assert.equal((await request('GET', '/api/cases', { token: u.token })).status, 401);
});

test('ล็อกอินผิด 10 ครั้ง → ครั้งที่ 11 ได้ 429 แม้รหัสผ่านถูก', async () => {
  const u = await mk();
  for (let i = 0; i < 10; i++) assert.equal((await login(u.username, 'wrong-password')).status, 401);
  const r = await login(u.username, u.password);
  assert.equal(r.status, 429, r.text);
  // บัญชีอื่นไม่ถูกกระทบ
  assert.equal((await login('no-such-user-' + crypto.randomBytes(3).toString('hex'), 'x')).status, 401);
});

test('ล็อกอินผิดไม่ถึงเกณฑ์แล้วล็อกอินถูก → ตัวนับถูกล้าง', async () => {
  const u = await mk();
  for (let i = 0; i < 9; i++) await login(u.username, 'wrong-password');
  assert.equal((await login(u.username, u.password)).status, 200);
  for (let i = 0; i < 9; i++) await login(u.username, 'wrong-password');
  assert.equal((await login(u.username, u.password)).status, 200);
});

test('security headers ทั้งหน้าเว็บและ API / API ห้ามแคช / ไม่เปิดเผย X-Powered-By', async () => {
  for (const url of ['/', '/api/catalog']) {
    const res = await fetch(API + url);
    const h = res.headers;
    assert.match(h.get('content-security-policy') || '', /default-src 'self'/, url);
    assert.match(h.get('content-security-policy') || '', /frame-ancestors 'self'/, url);
    assert.equal(h.get('x-content-type-options'), 'nosniff', url);
    assert.equal(h.get('x-frame-options'), 'SAMEORIGIN', url);
    assert.equal(h.get('x-powered-by'), null, url);
  }
  const api = await fetch(API + '/api/catalog');
  assert.equal(api.headers.get('cache-control'), 'no-store');
});

test('CORS: เว็บไซต์อื่นเรียก API ข้ามโดเมนไม่ได้ (ไม่มี Access-Control-Allow-Origin)', async () => {
  const res = await fetch(API + '/api/auth/login', {
    method: 'OPTIONS',
    headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
  });
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  const get = await fetch(API + '/api/catalog', { headers: { Origin: 'https://evil.example' } });
  assert.equal(get.headers.get('access-control-allow-origin'), null);
});

test('สร้าง/แก้ผู้ใช้ด้วยหน่วยงานที่ไม่มีจริง → 400 ไม่ใช่ 500', async () => {
  const admin = await as('admin');
  for (const orgId of [999999, 'abc', -1, 1.5]) {
    const r = await request('POST', '/api/users', {
      token: admin, body: { username: `tmp-bad-${crypto.randomBytes(3).toString('hex')}`, password: tmpPassword(), displayName: 'x', role: 'staff', orgId },
    });
    assert.equal(r.status, 400, `orgId=${orgId} ได้ ${r.status}`);
  }
  const u = await mk();
  assert.equal((await request('PUT', `/api/users/${u.id}`, { token: admin, body: { orgId: 999999 } })).status, 400);
});

test('สร้างผู้ดูแลโดยไม่ระบุหน่วยงาน (orgId ว่าง) ได้', async () => {
  const r = await request('POST', '/api/users', {
    token: await as('admin'), body: { username: `tmp-admin-${crypto.randomBytes(3).toString('hex')}`, password: tmpPassword(), displayName: 'x', role: 'admin', orgId: '' },
  });
  assert.equal(r.status, 201, r.text);
  temps.push({ id: r.body.id });
});

test('ค้นหา q="%" / "_" หาตามตัวอักษรจริง ไม่ใช่ wildcard', async () => {
  const token = await as('okmd');
  const all = (await request('GET', '/api/cases?size=1', { token })).body.total;
  assert.ok(all > 0);
  for (const q of ['%', '_']) {
    const r = await request('GET', `/api/cases?size=1&q=${encodeURIComponent(q)}`, { token });
    assert.equal(r.status, 200);
    assert.ok(r.body.total < all, `q=${q} ได้ทั้งหมด ${r.body.total}/${all}`);
  }
});

test('checked เป็นสตริง "true"/"false" ไม่นับเป็นติ๊ก', async () => {
  const token = await as('okmd');
  const { body: tpl } = await request('GET', '/api/templates/okmd-capability', { token });
  const { body: c } = await createCase('okmd', 'okmd-capability');
  const checks = Object.fromEntries(tpl.schema.sections.filter((s) => s.type === 'checks').flatMap((s) => s.items.map((it) => [it.id, { checked: 'false' }])));
  const r = await request('PUT', `/api/cases/${c.id}`, { token, body: { data: { ...c.data, checks } } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.progress, 0);
  assert.ok(Object.values(r.body.data.checks).every((x) => x.checked === false));
});

test('วันที่แล้วเสร็จผิดรูปแบบ ("abc") ถูกล้าง → ปิดงานไม่ได้', async () => {
  const token = await as('okmd');
  const { body: c } = await createCase('okmd', 'okmd-capability', { complete: true });
  const r = await request('PUT', `/api/cases/${c.id}`, { token, body: { data: { ...c.data, completedDate: 'abc' } } });
  assert.equal(r.body.data.completedDate, '');
  const cl = await request('POST', `/api/cases/${c.id}/close`, { token });
  assert.equal(cl.status, 400);
  assert.match(cl.body.error, /วันที่ดำเนินการแล้วเสร็จ/);
});
