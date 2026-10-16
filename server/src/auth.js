import jwt from 'jsonwebtoken';
import { query } from './db.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// production ห้ามใช้ secret ค่าเริ่มต้น (ใครรู้ค่านี้จะปลอม token เข้าระบบได้)
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  console.error('ต้องตั้ง JWT_SECRET (อย่างน้อย 32 ตัวอักษร) ก่อนรันแบบ production');
  process.exit(1);
}

export const signToken = (user) =>
  jwt.sign({ id: user.id, role: user.role, orgId: user.org_id }, SECRET, { expiresIn: '12h' });

// สิทธิ์ (role / หน่วยงาน / active) อ่านจากฐานข้อมูลทุกคำขอ ไม่เชื่อค่าใน token
// ปิดใช้งาน ย้ายหน่วยงาน หรือลดสิทธิ์แล้วจึงมีผลทันทีโดยไม่ต้องรอ token หมดอายุ
export async function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
  let payload;
  try {
    payload = jwt.verify(token, SECRET);
  } catch {
    return res.status(401).json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
  }
  try {
    const u = (await query('SELECT id, role, org_id FROM users WHERE id=$1 AND active', [payload.id])).rows[0];
    if (!u) return res.status(401).json({ error: 'บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ' });
    req.user = { id: u.id, role: u.role, orgId: u.org_id };
    next();
  } catch (e) {
    next(e);
  }
}

export const requireAdmin = (req, res, next) =>
  req.user.role === 'admin' ? next() : res.status(403).json({ error: 'ต้องเป็นผู้ดูแลระบบ' });
