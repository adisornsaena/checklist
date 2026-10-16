import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, pool, query, nextCaseNo } from './db.js';
import { validateSchema } from './formSchema.js';
import { signToken, requireAuth, requireAdmin } from './auth.js';
import { calcProgress, sanitizeData, missingRequired } from './progress.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
// 'YYYY-MM-DD' ที่เป็นวันที่มีอยู่จริงเท่านั้น (2026-02-30 → null)
const dateOrNull = (v) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
};
const badReceiveDate = (h) => h.receiveDate && !dateOrNull(h.receiveDate);

// :id ต้องเป็นจำนวนเต็มบวกในช่วง integer ของ Postgres ไม่งั้นถือว่าไม่พบ (กัน error 500 จากฐานข้อมูล)
app.param('id', (req, res, next, id) => {
  if (/^\d{1,10}$/.test(id) && Number(id) <= 2147483647) return next();
  res.status(404).json({ error: 'ไม่พบข้อมูล' });
});

// ---------- Auth ----------
app.post('/api/auth/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  const fail = () => res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  if (typeof username !== 'string' || typeof password !== 'string') return fail();
  const { rows } = await query('SELECT * FROM users WHERE username=$1 AND active', [username]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password, u.password_hash))) {
    return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }
  res.json({ token: signToken(u), user: publicUser(u) });
}));

const publicUser = (u) => ({ id: u.id, username: u.username, displayName: u.display_name, role: u.role, orgId: u.org_id });

app.get('/api/auth/me', requireAuth, wrap(async (req, res) => {
  const { rows } = await query('SELECT * FROM users WHERE id=$1 AND active', [req.user.id]);
  if (!rows[0]) return res.status(401).json({ error: 'ไม่พบผู้ใช้' });
  res.json(publicUser(rows[0]));
}));

app.post('/api/auth/password', requireAuth, wrap(async (req, res) => {
  const { current, next } = req.body || {};
  if (typeof next !== 'string' || next.length < 8) return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร' });
  const { rows } = await query('SELECT * FROM users WHERE id=$1', [req.user.id]);
  if (typeof current !== 'string' || !(await bcrypt.compare(current, rows[0].password_hash))) {
    return res.status(400).json({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
  }
  await query('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(next, 10), req.user.id]);
  res.json({ ok: true });
}));

// ---------- Users (admin) ----------
app.get('/api/users', requireAuth, requireAdmin, wrap(async (_req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.username, u.display_name, u.role, u.org_id, u.active, o.short_name AS org_name
     FROM users u LEFT JOIN orgs o ON o.id=u.org_id ORDER BY u.id`
  );
  res.json(rows);
}));

app.post('/api/users', requireAuth, requireAdmin, wrap(async (req, res) => {
  const { username, password, displayName, role = 'staff', orgId = null } = req.body || {};
  if (typeof username !== 'string' || !username || typeof password !== 'string' || password.length < 8 || typeof displayName !== 'string' || !displayName) {
    return res.status(400).json({ error: 'กรอก username, ชื่อ และรหัสผ่านอย่างน้อย 8 ตัวอักษร' });
  }
  if (!['admin', 'staff'].includes(role)) return res.status(400).json({ error: 'role ไม่ถูกต้อง' });
  if (role === 'staff' && !orgId) return res.status(400).json({ error: 'เจ้าหน้าที่ต้องระบุหน่วยงาน' });
  try {
    const { rows } = await query(
      `INSERT INTO users (username, password_hash, display_name, role, org_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, username, display_name, role, org_id, active`,
      [username, await bcrypt.hash(password, 10), displayName, role, orgId]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'username นี้ถูกใช้แล้ว' });
    throw e;
  }
}));

app.put('/api/users/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
  const id = Number(req.params.id);
  const cur = (await query('SELECT * FROM users WHERE id=$1', [id])).rows[0];
  if (!cur) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  const b = req.body || {};
  const displayName = b.displayName?.trim() || cur.display_name;
  const role = b.role ?? cur.role;
  const orgId = 'orgId' in b ? b.orgId || null : cur.org_id;
  const active = 'active' in b ? !!b.active : cur.active;
  if (!['admin', 'staff'].includes(role)) return res.status(400).json({ error: 'role ไม่ถูกต้อง' });
  if (id === req.user.id && (!active || role !== 'admin')) {
    return res.status(400).json({ error: 'ไม่สามารถปิดการใช้งานหรือลดสิทธิ์บัญชีของตนเองได้' });
  }
  if (role === 'staff' && !orgId) return res.status(400).json({ error: 'เจ้าหน้าที่ต้องระบุหน่วยงาน' });
  if (b.password && (typeof b.password !== 'string' || b.password.length < 8)) return res.status(400).json({ error: 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร' });
  const hash = b.password ? await bcrypt.hash(b.password, 10) : cur.password_hash;
  const { rows } = await query(
    `UPDATE users SET display_name=$1, role=$2, org_id=$3, active=$4, password_hash=$5 WHERE id=$6
     RETURNING id, username, display_name, role, org_id, active`,
    [displayName, role, orgId, active, hash, id]
  );
  res.json(rows[0]);
}));

// ---------- หน่วยงาน / แบบฟอร์ม ----------
// staff ที่ผูกกับหน่วยงานจะเห็นเฉพาะหน่วยงานของตน
const orgScope = (user, col = 'o.id') => (user.orgId ? { sql: ` AND ${col} = ${Number(user.orgId)}` } : { sql: '' });

app.get('/api/catalog', requireAuth, wrap(async (req, res) => {
  const orgs = (await query(`SELECT * FROM orgs o WHERE true ${orgScope(req.user).sql} ORDER BY sort`)).rows;
  const tpls = (await query(
    `SELECT t.id, t.code, t.title, t.department, t.icon, o.code AS org_code
     FROM form_templates t JOIN orgs o ON o.id=t.org_id
     WHERE t.active ${orgScope(req.user).sql} ORDER BY o.sort, t.sort`
  )).rows;
  res.json(orgs.map((o) => ({ ...o, templates: tpls.filter((t) => t.org_code === o.code) })));
}));

app.get('/api/templates/:code', requireAuth, wrap(async (req, res) => {
  const { rows } = await query(
    `SELECT t.*, o.code AS org_code, o.name AS org_name, o.short_name, o.address, o.phone, o.color, o.logo, o.id AS oid
     FROM form_templates t JOIN orgs o ON o.id=t.org_id WHERE t.code=$1 AND t.active`,
    [req.params.code]
  );
  const t = rows[0];
  if (!t || (req.user.orgId && req.user.orgId !== t.oid)) return res.status(404).json({ error: 'ไม่พบแบบฟอร์ม' });
  res.json(shapeTemplate(t));
}));

const shapeTemplate = (t) => ({
  id: t.id, code: t.code, title: t.title, department: t.department, icon: t.icon, schema: t.schema, version: t.version,
  org: { code: t.org_code, name: t.org_name, shortName: t.short_name, address: t.address, phone: t.phone, color: t.color, logo: t.logo },
});

// ---------- Cases ----------
const CASE_SELECT = `
  SELECT c.id, c.case_no, c.receive_date, c.doc_no, c.requester, c.progress, c.status,
         c.created_at, c.updated_at, c.closed_at,
         t.code AS template_code, t.title AS template_title, t.icon AS template_icon, o.code AS org_code, o.short_name AS org_name,
         u.display_name AS created_by_name
  FROM cases c
  JOIN form_templates t ON t.id=c.template_id
  JOIN orgs o ON o.id=t.org_id
  LEFT JOIN users u ON u.id=c.created_by`;

app.get('/api/cases', requireAuth, wrap(async (req, res) => {
  const { org, template, status, q, from, to } = req.query;
  // จำกัดเป็นจำนวนเต็มในช่วงที่ปลอดภัย (ค่าติดลบ / 1e20 / Infinity ไม่ทำให้ SQL พัง)
  const intIn = (v, min, max, def) => Math.min(max, Math.max(min, Math.floor(Number(v)) || def));
  const page = intIn(req.query.page, 1, 100000, 1);
  const size = intIn(req.query.size, 1, 100, 20);
  const where = ['true'];
  const p = [];
  const add = (sql, v) => { p.push(v); where.push(sql.replace('?', `$${p.length}`)); };
  if (req.user.orgId) add('o.id = ?', req.user.orgId);
  if (org) add('o.code = ?', org);
  if (template) add('t.code = ?', template);
  if (status) add('c.status = ?', status);
  if (dateOrNull(from)) add('c.receive_date >= ?', from);
  if (dateOrNull(to)) add('c.receive_date <= ?', to);
  if (q) {
    p.push(`%${q}%`);
    const n = `$${p.length}`;
    where.push(`(c.case_no ILIKE ${n} OR c.doc_no ILIKE ${n} OR c.requester ILIKE ${n})`);
  }
  const w = where.join(' AND ');
  const total = (await query(`SELECT count(*)::int n FROM cases c JOIN form_templates t ON t.id=c.template_id JOIN orgs o ON o.id=t.org_id WHERE ${w}`, p)).rows[0].n;
  const { rows } = await query(
    `${CASE_SELECT} WHERE ${w} ORDER BY c.updated_at DESC LIMIT ${size} OFFSET ${(page - 1) * size}`, p
  );
  res.json({ total, page, size, items: rows });
}));

app.get('/api/stats', requireAuth, wrap(async (req, res) => {
  const scope = req.user.orgId ? `AND o.id=${Number(req.user.orgId)}` : '';
  const { rows } = await query(
    `SELECT o.code AS org_code, t.code AS template_code, c.status, count(*)::int AS n
     FROM cases c JOIN form_templates t ON t.id=c.template_id JOIN orgs o ON o.id=t.org_id
     WHERE true ${scope} GROUP BY o.code, t.code, c.status`
  );
  res.json(rows);
}));

async function loadCase(req, res) {
  const { rows } = await query(
    `SELECT c.*, t.code AS template_code, o.id AS oid FROM cases c
     JOIN form_templates t ON t.id=c.template_id JOIN orgs o ON o.id=t.org_id WHERE c.id=$1`,
    [req.params.id]
  );
  const c = rows[0];
  if (!c || (req.user.orgId && req.user.orgId !== c.oid)) {
    res.status(404).json({ error: 'ไม่พบเอกสาร' });
    return null;
  }
  return c;
}

// schema ของแบบฟอร์มตามเวอร์ชันที่เอกสารนี้ใช้กรอก
const schemaOf = async (templateId, version) => {
  const v = (await query('SELECT schema FROM form_template_versions WHERE template_id=$1 AND version=$2', [templateId, version])).rows[0];
  if (v) return v.schema;
  return (await query('SELECT schema FROM form_templates WHERE id=$1', [templateId])).rows[0].schema;
};

const fullCase = async (id) => {
  const { rows } = await query(
    `SELECT c.*, t.code AS template_code FROM cases c JOIN form_templates t ON t.id=c.template_id WHERE c.id=$1`, [id]
  );
  const c = rows[0];
  const tp = (await query(
    `SELECT t.*, o.code AS org_code, o.name AS org_name, o.short_name, o.address, o.phone, o.color, o.logo
     FROM form_templates t JOIN orgs o ON o.id=t.org_id WHERE t.id=$1`, [c.template_id]
  )).rows[0];
  const logs = (await query(
    `SELECT l.action, l.created_at, u.display_name FROM case_logs l LEFT JOIN users u ON u.id=l.user_id
     WHERE l.case_id=$1 ORDER BY l.id DESC LIMIT 30`, [id]
  )).rows;
  return {
    id: c.id, caseNo: c.case_no, status: c.status, progress: c.progress, data: c.data,
    createdAt: c.created_at, updatedAt: c.updated_at, closedAt: c.closed_at,
    template: shapeTemplate({ ...tp, schema: await schemaOf(c.template_id, c.template_version), version: c.template_version }), logs,
  };
};

app.post('/api/cases', requireAuth, wrap(async (req, res) => {
  const { templateCode, data } = req.body || {};
  const t = (await query(
    `SELECT t.*, o.id AS oid, o.doc_prefix FROM form_templates t JOIN orgs o ON o.id=t.org_id WHERE t.code=$1 AND t.active`, [templateCode]
  )).rows[0];
  if (!t || (req.user.orgId && req.user.orgId !== t.oid)) return res.status(404).json({ error: 'ไม่พบแบบฟอร์ม' });
  const clean = sanitizeData(t.schema, data);
  const miss = missingRequired(t.schema, clean);
  if (miss.length) return res.status(400).json({ error: `กรุณากรอก ${miss.join(', ')}` });
  const h = clean.header;
  if (badReceiveDate(h)) return res.status(400).json({ error: 'วันที่รับเรื่องไม่ถูกต้อง' });
  // ออกเลขที่เอกสารกับบันทึกเคสใน transaction เดียว บันทึกไม่สำเร็จเลขจะไม่ถูกใช้ไป
  const db = await pool.connect();
  let id;
  try {
    await db.query('BEGIN');
    const caseNo = await nextCaseNo(t.oid, t.doc_prefix || 'CL', undefined, db);
    id = (await db.query(
      `INSERT INTO cases (case_no, template_id, template_version, receive_date, doc_no, requester, data, progress, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING id`,
      [caseNo, t.id, t.version, dateOrNull(h.receiveDate), h.docNo, h.requesterOrg || h.memberNo, clean, calcProgress(t.schema, clean), req.user.id]
    )).rows[0].id;
    await db.query(`INSERT INTO case_logs (case_id, user_id, action) VALUES ($1,$2,'สร้างเอกสาร')`, [id, req.user.id]);
    await db.query('COMMIT');
  } catch (e) {
    await db.query('ROLLBACK');
    throw e;
  } finally {
    db.release();
  }
  res.status(201).json(await fullCase(id));
}));

app.get('/api/cases/:id', requireAuth, wrap(async (req, res) => {
  const c = await loadCase(req, res);
  if (c) res.json(await fullCase(c.id));
}));

app.put('/api/cases/:id', requireAuth, wrap(async (req, res) => {
  const c = await loadCase(req, res);
  if (!c) return;
  if (c.status !== 'open') return res.status(409).json({ error: 'เอกสารนี้ปิดงานแล้ว ต้องเปิดใหม่ก่อนแก้ไข' });
  const t = { schema: await schemaOf(c.template_id, c.template_version) };
  const clean = sanitizeData(t.schema, req.body?.data);
  const miss = missingRequired(t.schema, clean);
  if (miss.length) return res.status(400).json({ error: `กรุณากรอก ${miss.join(', ')}` });
  const h = clean.header;
  if (badReceiveDate(h)) return res.status(400).json({ error: 'วันที่รับเรื่องไม่ถูกต้อง' });
  await query(
    `UPDATE cases SET receive_date=$1, doc_no=$2, requester=$3, data=$4, progress=$5, updated_by=$6, updated_at=now() WHERE id=$7`,
    [dateOrNull(h.receiveDate), h.docNo, h.requesterOrg || h.memberNo, clean, calcProgress(t.schema, clean), req.user.id, c.id]
  );
  await query(`INSERT INTO case_logs (case_id, user_id, action) VALUES ($1,$2,'บันทึกการแก้ไข')`, [c.id, req.user.id]);
  res.json(await fullCase(c.id));
}));

// เปลี่ยนสถานะ: close | reopen | cancel
app.post('/api/cases/:id/:action(close|reopen|cancel)', requireAuth, wrap(async (req, res) => {
  const c = await loadCase(req, res);
  if (!c) return;
  const { action } = req.params;
  if (action === 'reopen' && req.user.role !== 'admin') return res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบที่เปิดงานใหม่ได้' });
  // close / cancel ได้เฉพาะเอกสารที่เปิดอยู่, reopen ได้เฉพาะเอกสารที่ปิดหรือยกเลิกแล้ว
  if (action === 'reopen' ? c.status === 'open' : c.status !== 'open') {
    return res.status(409).json({ error: action === 'reopen' ? 'เอกสารนี้เปิดอยู่แล้ว' : 'เอกสารนี้ไม่ได้อยู่ระหว่างดำเนินการ' });
  }
  if (action === 'close') {
    const t = { schema: await schemaOf(c.template_id, c.template_version) };
    const missing = [];
    if (t.schema.footer?.closedBy && !c.data.closedBy?.trim()) missing.push('ผู้ปิดงาน');
    if (t.schema.footer?.completedDate && !c.data.completedDate) missing.push('วันที่ดำเนินการแล้วเสร็จ');
    if (missing.length) {
      return res.status(400).json({ error: `กรุณากรอก${missing.join(' และ ')}ให้เรียบร้อยก่อนปิดงาน` });
    }
  }
  const next = { close: 'closed', reopen: 'open', cancel: 'cancelled' }[action];
  await query(
    `UPDATE cases SET status=$1, closed_at = CASE WHEN $1='closed' THEN now() ELSE NULL END, updated_by=$2, updated_at=now() WHERE id=$3`,
    [next, req.user.id, c.id]
  );
  const label = { close: 'ปิดงาน', reopen: 'เปิดงานใหม่', cancel: 'ยกเลิก' }[action];
  await query(`INSERT INTO case_logs (case_id, user_id, action) VALUES ($1,$2,$3)`, [c.id, req.user.id, label]);
  res.json(await fullCase(c.id));
}));

app.delete('/api/cases/:id', requireAuth, requireAdmin, wrap(async (req, res) => {
  const { rowCount } = await query('DELETE FROM cases WHERE id=$1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'ไม่พบเอกสาร' });
  res.json({ ok: true });
}));

// ---------- จัดการแบบฟอร์ม (admin) ----------
const FORM_SELECT = `SELECT t.*, o.code AS org_code, o.name AS org_name, o.short_name, o.address, o.phone, o.color, o.logo, o.doc_prefix
                     FROM form_templates t JOIN orgs o ON o.id=t.org_id`;

app.get('/api/admin/forms', requireAuth, requireAdmin, wrap(async (_req, res) => {
  const orgs = (await query('SELECT id, code, name, short_name, address, phone, color, logo, doc_prefix FROM orgs ORDER BY sort')).rows;
  const templates = (await query(
    `SELECT t.code, t.title, t.department, t.icon, t.sort, t.active, t.version, o.code AS org_code,
            count(c.id)::int AS total_cases,
            count(c.id) FILTER (WHERE c.status='open')::int AS open_cases,
            count(c.id) FILTER (WHERE c.status='open' AND c.template_version < t.version)::int AS old_version_open
     FROM form_templates t JOIN orgs o ON o.id=t.org_id LEFT JOIN cases c ON c.template_id=t.id
     GROUP BY t.id, o.id ORDER BY o.sort, t.sort, t.id`
  )).rows;
  res.json({ orgs, templates });
}));

app.get('/api/admin/forms/:code', requireAuth, requireAdmin, wrap(async (req, res) => {
  const t = (await query(`${FORM_SELECT} WHERE t.code=$1`, [req.params.code])).rows[0];
  if (!t) return res.status(404).json({ error: 'ไม่พบแบบฟอร์ม' });
  res.json({ ...shapeTemplate(t), sort: t.sort, active: t.active });
}));

// เทียบ schema โดยไม่สนลำดับคีย์ (JSONB ในฐานข้อมูลเรียงคีย์ใหม่)
const canon = (v) => JSON.stringify(v, (_k, x) =>
  x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([m], [n]) => (m < n ? -1 : 1))) : x);

const metaOf = (b) => {
  const title = String(b.title || '').trim();
  if (!title || title.length > 300) { const e = new Error('กรุณากรอกชื่อแบบฟอร์ม (ไม่เกิน 300 ตัวอักษร)'); e.status = 400; throw e; }
  return { title, department: String(b.department || '').trim().slice(0, 300), icon: String(b.icon || '').slice(0, 40) };
};

app.post('/api/admin/forms', requireAuth, requireAdmin, wrap(async (req, res) => {
  const org = (await query('SELECT id, code FROM orgs WHERE code=$1', [req.body?.orgCode])).rows[0];
  if (!org) return res.status(400).json({ error: 'ไม่พบหน่วยงาน' });
  const m = metaOf(req.body);
  const schema = validateSchema(req.body.schema);
  const code = `${org.code}-${Date.now().toString(36)}`;
  const sort = (await query('SELECT coalesce(max(sort),0)+1 AS n FROM form_templates WHERE org_id=$1', [org.id])).rows[0].n;
  const t = (await query(
    `INSERT INTO form_templates (org_id, code, title, department, icon, sort, schema) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [org.id, code, m.title, m.department, m.icon, sort, JSON.stringify(schema)]
  )).rows[0];
  await query('INSERT INTO form_template_versions (template_id, version, schema, created_by) VALUES ($1,1,$2,$3)', [t.id, JSON.stringify(schema), req.user.id]);
  res.status(201).json({ code });
}));

app.put('/api/admin/forms/:code', requireAuth, requireAdmin, wrap(async (req, res) => {
  const cur = (await query('SELECT * FROM form_templates WHERE code=$1', [req.params.code])).rows[0];
  if (!cur) return res.status(404).json({ error: 'ไม่พบแบบฟอร์ม' });
  const m = metaOf(req.body);
  const active = 'active' in req.body ? !!req.body.active : cur.active;
  const sort = Number.isInteger(req.body.sort) ? req.body.sort : cur.sort;
  let version = cur.version;
  let schema = cur.schema;
  if (req.body.schema) {
    const next = validateSchema(req.body.schema);
    // schema เปลี่ยนจริงเท่านั้นจึงเพิ่มเวอร์ชัน (เอกสารเดิมยังใช้เวอร์ชันเดิม)
    if (canon(next) !== canon(cur.schema)) {
      version = cur.version + 1;
      schema = next;
      await query('INSERT INTO form_template_versions (template_id, version, schema, created_by) VALUES ($1,$2,$3,$4)', [cur.id, version, JSON.stringify(schema), req.user.id]);
    }
  }
  await query(
    `UPDATE form_templates SET title=$1, department=$2, icon=$3, sort=$4, active=$5, schema=$6, version=$7, updated_at=now() WHERE id=$8`,
    [m.title, m.department, m.icon, sort, active, JSON.stringify(schema), version, cur.id]
  );
  const t = (await query(`${FORM_SELECT} WHERE t.id=$1`, [cur.id])).rows[0];
  res.json({ ...shapeTemplate(t), sort: t.sort, active: t.active });
}));

// ---------- Serve client build (production) ----------
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
});

const port = process.env.PORT || 4000;
initDb()
  .then(() => app.listen(port, () => console.log(`API พร้อมใช้งานที่ http://localhost:${port}`)))
  .catch((e) => { console.error('เริ่มระบบไม่สำเร็จ:', e.message); process.exit(1); });
