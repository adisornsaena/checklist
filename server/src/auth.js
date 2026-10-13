import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// production ห้ามใช้ secret ค่าเริ่มต้น (ใครรู้ค่านี้จะปลอม token เข้าระบบได้)
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  console.error('ต้องตั้ง JWT_SECRET (อย่างน้อย 32 ตัวอักษร) ก่อนรันแบบ production');
  process.exit(1);
}

export const signToken = (user) =>
  jwt.sign({ id: user.id, role: user.role, orgId: user.org_id }, SECRET, { expiresIn: '12h' });

export function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
  }
}

export const requireAdmin = (req, res, next) =>
  req.user.role === 'admin' ? next() : res.status(403).json({ error: 'ต้องเป็นผู้ดูแลระบบ' });
