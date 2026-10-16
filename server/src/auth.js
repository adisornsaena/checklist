import jwt from 'jsonwebtoken';
import { query } from './db.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// production ห้ามใช้ secret ค่าเริ่มต้น (ใครรู้ค่านี้จะปลอม token เข้าระบบได้)
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  console.error('ต้องตั้ง JWT_SECRET (อย่างน้อย 32 ตัวอักษร) ก่อนรันแบบ production');
  process.exit(1);
}

export const signToken = (user) =>
  jwt.sign({ id: user.id, role: user.role, orgId: user.org_id, iatMs: Date.now() }, SECRET, { algorithm: 'HS256', expiresIn: '12h' });

// สิทธิ์ (role / หน่วยงาน / active) อ่านจากฐานข้อมูลทุกคำขอ ไม่เชื่อค่าใน token
// ปิดใช้งาน ย้ายหน่วยงาน หรือลดสิทธิ์แล้วจึงมีผลทันทีโดยไม่ต้องรอ token หมดอายุ
export async function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
  let payload;
  try {
    payload = jwt.verify(token, SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
  }
  try {
    const u = (await query('SELECT id, role, org_id, pwd_changed_at FROM users WHERE id=$1 AND active', [payload.id])).rows[0];
    if (!u) return res.status(401).json({ error: 'บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ' });
    // เปลี่ยนรหัสผ่านแล้ว token ที่ออกก่อนหน้า (เช่น ที่เครื่องอื่น) ใช้ไม่ได้
    // (เวลาออก token และ pwd_changed_at มาจากนาฬิกาของแอปเดียวกัน ละเอียดระดับมิลลิวินาที)
    if (u.pwd_changed_at && (payload.iatMs ?? payload.iat * 1000) < u.pwd_changed_at.getTime()) {
      return res.status(401).json({ error: 'รหัสผ่านถูกเปลี่ยนแล้ว กรุณาเข้าสู่ระบบใหม่' });
    }
    req.user = { id: u.id, role: u.role, orgId: u.org_id };
    next();
  } catch (e) {
    next(e);
  }
}

export const requireAdmin = (req, res, next) =>
  req.user.role === 'admin' ? next() : res.status(403).json({ error: 'ต้องเป็นผู้ดูแลระบบ' });

// จำกัดการล็อกอินผิดต่อ (IP + username): ผิดเกิน LIMIT ครั้งใน WINDOW ถูกพักไว้จนครบ WINDOW
// ใช้ IP ร่วมด้วยเพื่อไม่ให้คนอื่นสั่งล็อกบัญชีของผู้ใช้จริงได้
const LIMIT = 10;
const WINDOW = 15 * 60 * 1000;
const fails = new Map();

const keyOf = (req, username) => `${req.ip}|${String(username).toLowerCase()}`;

export function loginBlocked(req, username) {
  const f = fails.get(keyOf(req, username));
  if (!f) return 0;
  if (Date.now() - f.first > WINDOW) {
    fails.delete(keyOf(req, username));
    return 0;
  }
  return f.count >= LIMIT ? Math.ceil((f.first + WINDOW - Date.now()) / 60000) : 0;
}

export function loginFailed(req, username) {
  const k = keyOf(req, username);
  const f = fails.get(k);
  if (f && Date.now() - f.first <= WINDOW) f.count++;
  else fails.set(k, { first: Date.now(), count: 1 });
  if (fails.size > 10000) {
    for (const [key, v] of fails) if (Date.now() - v.first > WINDOW) fails.delete(key);
  }
}

export const loginSucceeded = (req, username) => fails.delete(keyOf(req, username));
