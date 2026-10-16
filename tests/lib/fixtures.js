// ตัวช่วยสร้างข้อมูลชั่วคราวสำหรับเทสต์: บัญชีผู้ใช้ชั่วคราว และแบบฟอร์มทดสอบ (ไม่แตะบัญชีใน fixtures / ฟอร์มตั้งต้น 15 ฟอร์ม)
import crypto from 'node:crypto';
import { request, login, as } from './api.js';

const rnd = () => crypto.randomBytes(4).toString('hex');
export const tmpPassword = () => crypto.randomBytes(12).toString('base64url');

let orgIds;
export async function orgId(code) {
  orgIds ??= (await request('GET', '/api/admin/forms', { token: await as('admin') })).body.orgs;
  return orgIds.find((o) => o.code === code).id;
}

// สร้างบัญชีชั่วคราว คืน { id, username, password, token }
export async function tmpUser({ role = 'staff', org = 'okmd' } = {}) {
  const admin = await as('admin');
  const username = `tmp-${role}-${rnd()}`;
  const password = tmpPassword();
  const r = await request('POST', '/api/users', {
    token: admin,
    body: { username, password, displayName: `ชั่วคราว ${username}`, role, orgId: role === 'staff' ? await orgId(org) : null },
  });
  if (r.status !== 201) throw new Error(`สร้างบัญชีชั่วคราวไม่ได้: ${r.text}`);
  const l = await login(username, password);
  return { id: r.body.id, username, password, token: l.body.token };
}

// ปิดใช้งานบัญชีชั่วคราวเมื่อจบเทสต์ (ไม่มี API ลบผู้ใช้)
export async function retireUser(u) {
  await request('PUT', `/api/users/${u.id}`, { token: await as('admin'), body: { active: false } });
}

// schema ทดสอบ: header 2 ช่อง (requesterOrg บังคับ), checks 2 ข้อ + dateField บังคับ, steps 2 ข้อ, fields 2 ช่อง (f1 บังคับ)
export const testSchema = (extraItems = []) => ({
  header: [
    { key: 'receiveDate', label: 'วันที่รับเรื่อง', type: 'date' },
    { key: 'requesterOrg', label: 'ผู้ขอรับบริการทดสอบ', type: 'text', required: true },
  ],
  sections: [
    {
      id: 'c', title: 'ตรวจเอกสาร', type: 'checks',
      items: [{ id: 'c1', label: 'ข้อ 1' }, { id: 'c2', label: 'ข้อ 2' }, ...extraItems],
      dateField: { key: 'dd', label: 'วันที่ส่งมอบทดสอบ', required: true },
    },
    {
      id: 's', title: 'ขั้นตอน', type: 'steps',
      items: [
        { id: 's1', label: 'ขั้น 1', options: [{ value: 'ok', label: 'ผ่าน' }, { value: 'no', label: 'ไม่ผ่าน', tone: 'bad' }], amount: 'จำนวนเงิน' },
        { id: 's2', label: 'ขั้น 2', options: [{ value: 'ok', label: 'ผ่าน' }] },
      ],
    },
    {
      id: 'f', title: 'ข้อมูลเพิ่มเติม', type: 'fields',
      fields: [{ key: 'f1', label: 'ช่องบังคับทดสอบ', type: 'text', required: true }, { key: 'f2', label: 'ช่องไม่บังคับ', type: 'text' }],
    },
  ],
  footer: { note: true, completedDate: true, closedBy: true },
});

// สร้างแบบฟอร์มใหม่ผ่าน POST /api/admin/forms คืน code
export async function createForm(orgCode = 'okmd', schema = testSchema(), title = 'ฟอร์มทดสอบอัตโนมัติ') {
  const r = await request('POST', '/api/admin/forms', { token: await as('admin'), body: { orgCode, title, schema } });
  if (r.status !== 201) throw new Error(`สร้างฟอร์มทดสอบไม่ได้: ${r.text}`);
  return r.body.code;
}

// ปิดใช้งานฟอร์มทดสอบเมื่อจบ (ไม่ให้รก catalog)
export async function retireForm(code) {
  const admin = await as('admin');
  const cur = (await request('GET', `/api/admin/forms/${code}`, { token: admin })).body;
  await request('PUT', `/api/admin/forms/${code}`, { token: admin, body: { title: cur.title, department: cur.department, icon: cur.icon, active: false } });
}

// ข้อมูลขั้นต่ำที่ผ่านช่องบังคับของ testSchema
export const minimalData = (over = {}) => ({
  header: { receiveDate: '2026-10-16', requesterOrg: 'หน่วยงานทดสอบ' },
  fields: { f1: 'ค่า f1', dd: '2026-10-16' },
  checks: {}, steps: {},
  ...over,
});
