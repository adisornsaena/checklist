import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { ORGS, TEMPLATES } from './templates.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// ให้ DATE คืนเป็นสตริง 'YYYY-MM-DD' (ไม่แปลงเป็น Date จนเขตเวลาเลื่อน)
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://checklist:checklist@localhost:5433/checklist',
});

export const query = (text, params) => pool.query(text, params);

// สร้างตาราง + อัปเดตแบบฟอร์มจาก templates.js + สร้างผู้ดูแลระบบเริ่มต้น
export async function initDb() {
  await query(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));

  const orgIds = {};
  for (const o of ORGS) {
    const { rows } = await query(
      `INSERT INTO orgs (code, name, short_name, address, phone, color, sort, logo, doc_prefix)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (code) DO UPDATE SET name=$2, short_name=$3, address=$4, phone=$5, color=$6, sort=$7, logo=$8, doc_prefix=$9
       RETURNING id`,
      [o.code, o.name, o.short_name, o.address, o.phone, o.color, o.sort, o.logo, o.doc_prefix]
    );
    orgIds[o.code] = rows[0].id;
  }

  // แบบฟอร์มตั้งต้นจาก templates.js: เพิ่มเฉพาะที่ยังไม่มี (ไม่เขียนทับ เพราะแก้ผ่านหน้า "จัดการแบบฟอร์ม" แล้ว)
  for (const t of TEMPLATES) {
    await query(
      `INSERT INTO form_templates (org_id, code, title, department, icon, sort, schema)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (code) DO NOTHING`,
      [orgIds[t.org], t.code, t.title, t.department, t.icon, t.sort, JSON.stringify(t.schema)]
    );
  }
  // ให้ทุกฟอร์มมีแถวเวอร์ชันของเวอร์ชันปัจจุบัน
  await query(
    `INSERT INTO form_template_versions (template_id, version, schema)
     SELECT t.id, t.version, t.schema FROM form_templates t
     WHERE NOT EXISTS (SELECT 1 FROM form_template_versions v WHERE v.template_id=t.id AND v.version=t.version)`
  );

  await renumberLegacyCases();
  await markDefaultRequiredFields();

  const { rows } = await query('SELECT count(*)::int AS n FROM users');
  if (rows[0].n === 0) {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'admin1234';
    await query(
      `INSERT INTO users (username, password_hash, display_name, role) VALUES ($1,$2,'ผู้ดูแลระบบ','admin')`,
      [username, await bcrypt.hash(password, 10)]
    );
    console.log(`สร้างผู้ใช้เริ่มต้น: ${username} (โปรดเปลี่ยนรหัสผ่าน)`);
  }
}

// รันเลขที่เอกสาร: <PREFIX>-<พ.ศ.>-<ลำดับ 5 หลัก> แยกลำดับตามหน่วยงานและปี
export async function nextCaseNo(orgId, prefix, year = new Date().getFullYear() + 543, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO case_counters (org_id, year, last) VALUES ($1,$2,1)
     ON CONFLICT (org_id, year) DO UPDATE SET last = case_counters.last + 1 RETURNING last`,
    [orgId, year]
  );
  return `${prefix}-${year}-${String(rows[0].last).padStart(5, '0')}`;
}

// เอกสารเดิมที่ใช้เลข CL-... ให้เปลี่ยนเป็นเลขตามหน่วยงาน (เรียงตามวันที่สร้าง)
async function renumberLegacyCases() {
  const { rows } = await query(
    `SELECT c.id, o.id AS org_id, o.doc_prefix, extract(year from c.created_at)::int + 543 AS year
     FROM cases c JOIN form_templates t ON t.id=c.template_id JOIN orgs o ON o.id=t.org_id
     WHERE c.case_no LIKE 'CL-%' ORDER BY c.created_at, c.id`
  );
  for (const r of rows) {
    const no = await nextCaseNo(r.org_id, r.doc_prefix, r.year);
    await query('UPDATE cases SET case_no=$1 WHERE id=$2', [no, r.id]);
  }
  if (rows.length) console.log(`เปลี่ยนเลขที่เอกสารเดิม ${rows.length} รายการเป็นเลขตามหน่วยงาน`);
}

// ตั้งค่าเริ่มต้นของช่องบังคับกรอก (ทำครั้งเดียวต่อรุ่น กับทุกเวอร์ชันของทุกฟอร์ม)
// รุ่นใหม่ให้เพิ่มรายการท้าย REQUIRED_DEFAULTS — ผู้ดูแลปลดบังคับในตัวแก้ไขแล้ว restart จะไม่ถูกบังคับกลับ
const REQUIRED_DEFAULTS = [
  ['required_defaults_v1', ['requesterOrg', 'coordinator']],   // ผู้ขอรับบริการ, ผู้ประสานงาน
  ['required_defaults_v2', ['memberNo']],                       // เลขที่สมาชิก
];

async function markDefaultRequiredFields() {
  for (const [marker, keys] of REQUIRED_DEFAULTS) {
    if ((await query('SELECT 1 FROM app_meta WHERE key=$1', [marker])).rowCount) continue;
    const mark = (schema) => {
      for (const f of schema.header || []) if (keys.includes(f.key)) f.required = true;
      return schema;
    };
    for (const table of ['form_templates', 'form_template_versions']) {
      const { rows } = await query(`SELECT * FROM ${table}`);
      for (const r of rows) {
        const json = JSON.stringify(mark(r.schema));
        if (table === 'form_templates') await query('UPDATE form_templates SET schema=$1 WHERE id=$2', [json, r.id]);
        else await query('UPDATE form_template_versions SET schema=$1 WHERE template_id=$2 AND version=$3', [json, r.template_id, r.version]);
      }
    }
    await query(`INSERT INTO app_meta (key, value) VALUES ($1, 'done')`, [marker]);
  }
}
