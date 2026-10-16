// ค่าตั้งของสภาพแวดล้อมทดสอบ และบัญชีทดสอบ (สุ่มรหัสผ่านครั้งแรก เก็บใน tests/fixtures/users.json ซึ่งไม่ขึ้น git)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const TEST_PORT = Number(process.env.TEST_PORT) || 4100;
export const API = process.env.TEST_API_URL || `http://localhost:${TEST_PORT}`;
export const TEST_DB_URL = process.env.TEST_DATABASE_URL || 'postgres://checklist:checklist@localhost:5433/checklist_test';

// กันยิงเทสต์ไปเครื่องอื่นหรือฐานข้อมูลจริงโดยไม่ตั้งใจ
if (!/^http:\/\/(localhost|127\.0\.0\.1|host\.docker\.internal)(:\d+)?$/.test(API)) {
  throw new Error(`TEST_API_URL ต้องเป็นเครื่องนี้เท่านั้น: ${API}`);
}
if (new URL(TEST_DB_URL).pathname === '/checklist') {
  throw new Error('TEST_DATABASE_URL ห้ามชี้ไปฐานข้อมูลจริง (checklist)');
}

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/users.json');
const pw = () => crypto.randomBytes(12).toString('base64url');

export function loadUsers() {
  if (!fs.existsSync(file)) {
    const users = {
      admin: { username: 'test-admin', password: pw() },
      staff: Object.fromEntries(['okmd', 'ndmi', 'tkpark'].map((org) => [org, { username: `test-staff-${org}`, password: pw() }])),
    };
    fs.writeFileSync(file, JSON.stringify(users, null, 2));
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
