// ตัวช่วยเรียก API สำหรับเทสต์: ล็อกอิน, สร้างบัญชี staff, เติมข้อมูลเคสตาม schema
import { API, loadUsers } from './env.js';

export const users = loadUsers();
const tokens = {};

export async function request(method, url, { token, body, raw } = {}) {
  const res = await fetch(API + url, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* ไม่ใช่ JSON */ }
  return { status: res.status, body: json, text };
}

export async function login(username, password) {
  return request('POST', '/api/auth/login', { body: { username, password } });
}

// สร้าง/รีเซ็ตบัญชี staff ของแต่ละหน่วยงานให้ตรงกับ fixtures (เรียกซ้ำได้)
let ready;
async function ensureUsers(adminToken) {
  const { body: forms } = await request('GET', '/api/admin/forms', { token: adminToken });
  const { body: existing } = await request('GET', '/api/users', { token: adminToken });
  for (const [org, u] of Object.entries(users.staff)) {
    const orgId = forms.orgs.find((o) => o.code === org).id;
    const found = existing.find((x) => x.username === u.username);
    const payload = { displayName: `ผู้ทดสอบ ${org}`, role: 'staff', orgId, password: u.password, active: true };
    const r = found
      ? await request('PUT', `/api/users/${found.id}`, { token: adminToken, body: payload })
      : await request('POST', '/api/users', { token: adminToken, body: { ...payload, username: u.username } });
    if (r.status >= 300) throw new Error(`สร้างบัญชี ${u.username} ไม่สำเร็จ: ${r.text}`);
  }
}

// token ของ 'admin' หรือรหัสหน่วยงาน 'okmd' | 'ndmi' | 'tkpark' (staff)
export async function as(who) {
  if (tokens[who]) return tokens[who];
  if (who === 'admin') {
    const r = await login(users.admin.username, users.admin.password);
    if (r.status !== 200) throw new Error('ล็อกอิน test-admin ไม่ได้ — เริ่มเซิร์ฟเวอร์ด้วย npm run test:server หรือยัง?');
    return (tokens.admin = r.body.token);
  }
  ready ??= ensureUsers(await as('admin'));
  await ready;
  const u = users.staff[who];
  const r = await login(u.username, u.password);
  if (r.status !== 200) throw new Error(`ล็อกอิน ${u.username} ไม่ได้: ${r.text}`);
  return (tokens[who] = r.body.token);
}

// ข้อมูลเคสที่กรอกช่องบังคับครบ; ใส่ { complete: true } เพื่อติ๊ก/เลือกทุกข้อและกรอก footer
export function fillCase(schema, { complete = false } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const val = (f) => (f.type === 'date' ? today : f.type === 'email' ? 'test@example.com' : f.type === 'tel' ? '020000000' : `ทดสอบ ${f.key}`);
  const data = { header: {}, checks: {}, steps: {}, fields: {} };
  for (const f of schema.header) data.header[f.key] = val(f);
  for (const s of schema.sections) {
    if (s.type === 'fields') for (const f of s.fields) data.fields[f.key] = val(f);
    if (complete && s.type === 'checks') for (const it of s.items) data.checks[it.id] = { checked: true };
    if (complete && s.type === 'steps') for (const it of s.items) data.steps[it.id] = { value: it.options[0].value, date: today };
  }
  if (complete) Object.assign(data, { closedBy: 'ผู้ทดสอบ', completedDate: today });
  return data;
}

export async function createCase(who, templateCode, opts) {
  const token = await as(who);
  const { body: tpl } = await request('GET', `/api/templates/${templateCode}`, { token });
  return request('POST', '/api/cases', { token, body: { templateCode, data: fillCase(tpl.schema, opts) } });
}
