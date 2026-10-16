// เริ่มเซิร์ฟเวอร์สำหรับทดสอบ: พอร์ต 4100 + ฐานข้อมูลแยก checklist_test (ไม่แตะข้อมูลจริง)
// สร้างฐานข้อมูลและบัญชีทดสอบ (tests/fixtures/users.json) ให้อัตโนมัติถ้ายังไม่มี
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadUsers, TEST_PORT, TEST_DB_URL } from './lib/env.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pg = createRequire(path.join(root, 'server/package.json'))('pg');

const dbName = new URL(TEST_DB_URL).pathname.slice(1);
const admin = new URL(TEST_DB_URL);
admin.pathname = '/postgres';
const client = new pg.Client({ connectionString: admin.toString() });
await client.connect();
if (!(await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [dbName])).rowCount) {
  await client.query(`CREATE DATABASE "${dbName}"`);
  console.log(`สร้างฐานข้อมูลทดสอบ ${dbName}`);
}
await client.end();

const users = loadUsers();
const server = spawn(process.execPath, ['src/index.js'], {
  cwd: path.join(root, 'server'),
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: String(TEST_PORT),
    DATABASE_URL: TEST_DB_URL,
    ADMIN_USERNAME: users.admin.username,
    ADMIN_PASSWORD: users.admin.password,
  },
});
server.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.kill(sig));
