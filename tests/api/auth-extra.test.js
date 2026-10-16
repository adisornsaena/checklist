// หัวข้อ 1 (Auth) เพิ่มเติม: body ว่าง, เปลี่ยนรหัสผ่าน, token หลังปิดใช้งาน/ย้ายหน่วยงาน/ลดสิทธิ์
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { request, login, as } from '../lib/api.js';
import { tmpUser, retireUser, tmpPassword, orgId } from '../lib/fixtures.js';

const temps = [];
after(async () => { for (const u of temps) await retireUser(u); });
const mk = async (o) => { const u = await tmpUser(o); temps.push(u); return u; };

test('ล็อกอินไม่มี body → 401', async () => {
  const r = await request('POST', '/api/auth/login');
  assert.equal(r.status, 401, r.text);
});

test('ล็อกอิน body ว่าง {} / ไม่มีผู้ใช้นี้ → 401', async () => {
  assert.equal((await request('POST', '/api/auth/login', { body: {} })).status, 401);
  assert.equal((await login('no-such-user-xyz', 'whatever123')).status, 401);
});

test('ล็อกอินด้วย password ที่ไม่ใช่สตริง ต้องไม่ได้ 500', async () => {
  const r = await request('POST', '/api/auth/login', { body: { username: 'test-admin', password: 12345678 } });
  assert.equal(r.status, 401, `ได้ ${r.status}: ${r.text}`);
});

test('Bearer ว่าง / ไม่มีคำว่า Bearer → 401', async () => {
  const res = await fetch((await import('../lib/env.js')).API + '/api/cases', { headers: { Authorization: await as('admin') } });
  assert.equal(res.status, 401);
  assert.equal((await request('GET', '/api/cases', { token: ' ' })).status, 401);
});

test('เปลี่ยนรหัสผ่าน: ใหม่ < 8 ตัว / ไม่ส่ง next → 400', async () => {
  const token = await as('admin');
  assert.equal((await request('POST', '/api/auth/password', { token, body: { current: 'x', next: 'short' } })).status, 400);
  assert.equal((await request('POST', '/api/auth/password', { token, body: {} })).status, 400);
  assert.equal((await request('POST', '/api/auth/password', { token })).status, 400);
});

test('เปลี่ยนรหัสผ่าน: รหัสปัจจุบันผิด → 400 / ถูก → 200 แล้วรหัสเก่าใช้ไม่ได้ (บัญชีชั่วคราว)', async () => {
  const u = await mk();
  const next = tmpPassword();
  assert.equal((await request('POST', '/api/auth/password', { token: u.token, body: { current: 'wrong-pass', next } })).status, 400);
  const ok = await request('POST', '/api/auth/password', { token: u.token, body: { current: u.password, next } });
  assert.equal(ok.status, 200, ok.text);
  assert.equal((await login(u.username, u.password)).status, 401);
  assert.equal((await login(u.username, next)).status, 200);
});

test('เปลี่ยนรหัสผ่านด้วย next ที่ไม่ใช่สตริง ต้องไม่ได้ 500', async () => {
  const u = await mk();
  const r = await request('POST', '/api/auth/password', { token: u.token, body: { current: u.password, next: [1, 2, 3, 4, 5, 6, 7, 8] } });
  assert.equal(r.status, 400, `ได้ ${r.status}: ${r.text}`);
});

test('ผู้ใช้ถูกปิดใช้งาน: ล็อกอินใหม่ไม่ได้ และ /api/auth/me → 401', async () => {
  const u = await mk();
  await request('PUT', `/api/users/${u.id}`, { token: await as('admin'), body: { active: false } });
  assert.equal((await login(u.username, u.password)).status, 401);
  assert.equal((await request('GET', '/api/auth/me', { token: u.token })).status, 401);
});

test('ผู้ใช้ถูกปิดใช้งาน: token เดิมต้องเรียก API อื่นไม่ได้', async () => {
  const u = await mk();
  await request('PUT', `/api/users/${u.id}`, { token: await as('admin'), body: { active: false } });
  const r = await request('GET', '/api/cases', { token: u.token });
  assert.equal(r.status, 401, `token ของบัญชีที่ถูกปิดยังได้ ${r.status}`);
  const c = await request('POST', '/api/cases', { token: u.token, body: { templateCode: 'okmd-capability', data: {} } });
  assert.equal(c.status, 401, `ยังเรียก POST /api/cases ได้ (${c.status})`);
});

test('ผู้ใช้ถูกย้ายหน่วยงาน: token เดิมต้องไม่เห็นหน่วยงานเก่าอีก', async () => {
  const u = await mk({ org: 'okmd' });
  await request('PUT', `/api/users/${u.id}`, { token: await as('admin'), body: { orgId: await orgId('ndmi') } });
  const { body } = await request('GET', '/api/catalog', { token: u.token });
  assert.deepEqual(body.map((o) => o.code), ['ndmi'], `token เดิมยังเห็น ${body.map((o) => o.code)}`);
});

test('ผู้ใช้ถูกลดสิทธิ์ admin → staff: token เดิมต้องเรียก /api/users ไม่ได้', async () => {
  const u = await mk({ role: 'admin' });
  const d = await request('PUT', `/api/users/${u.id}`, { token: await as('admin'), body: { role: 'staff', orgId: await orgId('okmd') } });
  assert.equal(d.status, 200, d.text);
  const r = await request('GET', '/api/users', { token: u.token });
  assert.equal(r.status, 403, `ยังเรียกได้ ${r.status}`);
});
