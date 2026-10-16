import { useState } from 'react';
import { api, setToken } from '../api.js';

export default function ChangePassword() {
  const blank = { current: '', next: '', confirm: '' };
  const [form, setForm] = useState(blank);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (form.next !== form.confirm) return setMsg({ bad: true, text: 'รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน' });
    setBusy(true);
    setMsg(null);
    try {
      const r = await api('/auth/password', { method: 'POST', body: { current: form.current, next: form.next } });
      // token เดิมถูกยกเลิกแล้ว ใช้ token ใหม่ต่อ (เครื่องอื่นต้องล็อกอินใหม่)
      setToken(r.token);
      setForm(blank);
      setMsg({ text: 'เปลี่ยนรหัสผ่านเรียบร้อย อุปกรณ์อื่นที่เคยเข้าสู่ระบบไว้ต้องเข้าสู่ระบบใหม่' });
    } catch (e2) {
      setMsg({ bad: true, text: e2.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center">
      <form className="card login" onSubmit={submit}>
        <h1>เปลี่ยนรหัสผ่าน</h1>
        <label>รหัสผ่านปัจจุบัน
          <input type="password" required autoComplete="current-password" value={form.current} onChange={set('current')} />
        </label>
        <label>รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)
          <input type="password" required minLength="8" autoComplete="new-password" value={form.next} onChange={set('next')} />
        </label>
        <label>ยืนยันรหัสผ่านใหม่
          <input type="password" required minLength="8" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
        </label>
        {msg && <div className={msg.bad ? 'alert' : 'alert ok'}>{msg.text}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'กำลังบันทึก...' : 'บันทึก'}</button>
      </form>
    </div>
  );
}
