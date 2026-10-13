import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

const blank = { username: '', displayName: '', password: '', role: 'staff', orgId: '' };

export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [form, setForm] = useState(blank);
  const [msg, setMsg] = useState(null);

  const load = () => api('/users').then(setUsers).catch((e) => setMsg({ type: 'err', text: e.message }));
  useEffect(() => { load(); api('/catalog').then(setOrgs); }, []);

  const flash = (type, text) => setMsg({ type, text });

  const create = async (e) => {
    e.preventDefault();
    try {
      await api('/users', { method: 'POST', body: { ...form, orgId: form.orgId ? Number(form.orgId) : null } });
      setForm(blank); flash('ok', 'เพิ่มผู้ใช้เรียบร้อย'); load();
    } catch (e2) { flash('err', e2.message); }
  };

  const update = async (u, patch, okText) => {
    try { await api(`/users/${u.id}`, { method: 'PUT', body: patch }); flash('ok', okText); load(); }
    catch (e) { flash('err', e.message); }
  };

  const edit = (u) => {
    const displayName = window.prompt('ชื่อที่แสดง', u.display_name);
    if (displayName?.trim()) update(u, { displayName }, 'แก้ไขชื่อเรียบร้อย');
  };
  const resetPw = (u) => {
    const password = window.prompt(`ตั้งรหัสผ่านใหม่ให้ ${u.username} (อย่างน้อย 8 ตัวอักษร)`);
    if (password) update(u, { password }, 'เปลี่ยนรหัสผ่านเรียบร้อย');
  };
  const move = (u, orgId) => update(u, { orgId: orgId ? Number(orgId) : null }, 'ย้ายหน่วยงานเรียบร้อย');

  if (!users) return msg ? <div className="alert">{msg.text}</div> : <div className="muted">กำลังโหลด...</div>;

  // จัดกลุ่มตามหน่วยงาน (ผู้ดูแลที่ไม่ผูกหน่วยงานอยู่กลุ่มแรก)
  const groups = [
    { key: 'all', name: 'ผู้ดูแลระบบ (เข้าถึงได้ทุกหน่วยงาน)', color: '#4b3aa8', list: users.filter((u) => !u.org_id) },
    ...orgs.map((o) => ({ key: o.code, name: o.short_name, sub: o.name, color: o.color, list: users.filter((u) => u.org_id === o.id) })),
  ];

  return (
    <>
      <div className="page-head"><h1>ผู้ใช้งาน</h1></div>
      {msg && <div className={`alert ${msg.type === 'ok' ? 'ok' : ''}`}>{msg.text}</div>}

      <form className="card user-form" onSubmit={create}>
        <label>ชื่อผู้ใช้ (username)<input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
        <label>ชื่อที่แสดง<input required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></label>
        <label>รหัสผ่าน (≥ 8 ตัว)<input required type="password" minLength="8" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        <label>สิทธิ์
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="staff">เจ้าหน้าที่</option>
            <option value="admin">ผู้ดูแลระบบ</option>
          </select>
        </label>
        <label>หน่วยงาน
          <select required={form.role === 'staff'} value={form.orgId} onChange={(e) => setForm({ ...form, orgId: e.target.value })}>
            <option value="">{form.role === 'admin' ? 'ทุกหน่วยงาน' : '— เลือกหน่วยงาน —'}</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.short_name}</option>)}
          </select>
        </label>
        <button className="btn primary">＋ เพิ่มผู้ใช้</button>
      </form>

      {groups.map((g) => (g.key === 'all' && !g.list.length ? null : (
        <section key={g.key} className="user-group" style={{ '--c': g.color }}>
          <h2>{g.name} <small>{g.sub ? `${g.sub} · ` : ''}{g.list.length} คน</small></h2>
          <div className="card table-wrap">
            <table className="list stack">
              <thead><tr><th>ชื่อผู้ใช้</th><th>ชื่อที่แสดง</th><th>สิทธิ์</th><th>หน่วยงาน</th><th>สถานะ</th><th /></tr></thead>
              <tbody>
                {g.list.map((u) => (
                  <tr key={u.id} className={u.active ? '' : 'inactive'}>
                    <td data-l="ชื่อผู้ใช้">{u.username}{u.id === me.id && <span className="small muted"> (คุณ)</span>}</td>
                    <td data-l="ชื่อที่แสดง">{u.display_name}</td>
                    <td data-l="สิทธิ์"><span className={`badge ${u.role}`}>{u.role === 'admin' ? 'ผู้ดูแลระบบ' : 'เจ้าหน้าที่'}</span></td>
                    <td data-l="หน่วยงาน">
                      <select value={u.org_id || ''} onChange={(e) => move(u, e.target.value)}>
                        {u.role === 'admin' && <option value="">ทุกหน่วยงาน</option>}
                        {orgs.map((o) => <option key={o.id} value={o.id}>{o.short_name}</option>)}
                      </select>
                    </td>
                    <td data-l="สถานะ">{u.active ? 'ใช้งาน' : 'ปิดใช้งาน'}</td>
                    <td className="row-actions">
                      <button className="btn ghost" onClick={() => edit(u)}>แก้ชื่อ</button>
                      <button className="btn ghost" onClick={() => resetPw(u)}>รีเซ็ตรหัสผ่าน</button>
                      {u.id !== me.id && (
                        <>
                          <button className="btn ghost" onClick={() => update(u, { role: u.role === 'admin' ? 'staff' : 'admin' }, 'เปลี่ยนสิทธิ์เรียบร้อย')}>
                            {u.role === 'admin' ? 'ลดเป็นเจ้าหน้าที่' : 'ตั้งเป็นแอดมิน'}
                          </button>
                          <button className={`btn ${u.active ? 'danger' : 'ok'}`} onClick={() => update(u, { active: !u.active }, u.active ? 'ปิดใช้งานแล้ว' : 'เปิดใช้งานแล้ว')}>
                            {u.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {!g.list.length && <tr><td colSpan="6" className="muted center-text">ยังไม่มีผู้ใช้ในหน่วยงานนี้</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )))}
    </>
  );
}
