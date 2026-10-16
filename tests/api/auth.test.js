import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request, login, as } from '../lib/api.js';

test('ล็อกอินรหัสผ่านผิด → 401', async () => {
  const r = await login('test-admin', 'wrong-password');
  assert.equal(r.status, 401);
});

test('ไม่มี token → 401', async () => {
  assert.equal((await request('GET', '/api/cases')).status, 401);
});

test('token ปลอม → 401', async () => {
  assert.equal((await request('GET', '/api/cases', { token: 'abc.def.ghi' })).status, 401);
});

test('staff เรียก endpoint ของ admin ไม่ได้ → 403', async () => {
  const token = await as('ndmi');
  for (const url of ['/api/users', '/api/admin/forms']) {
    assert.equal((await request('GET', url, { token })).status, 403, url);
  }
});

test('staff เห็นเฉพาะหน่วยงานตนใน catalog', async () => {
  const { body } = await request('GET', '/api/catalog', { token: await as('tkpark') });
  assert.deepEqual(body.map((o) => o.code), ['tkpark']);
});
