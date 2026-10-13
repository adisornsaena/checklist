import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { iconOf } from '../icons.js';

export default function FormAdmin() {
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = () => api('/admin/forms').then(setData).catch((e) => setMsg({ type: 'err', text: e.message }));
  useEffect(() => { load(); }, []);

  const put = async (t, patch, okText) => {
    try {
      await api(`/admin/forms/${t.code}`, { method: 'PUT', body: { title: t.title, department: t.department, icon: t.icon, ...patch } });
      setMsg({ type: 'ok', text: okText }); load();
    } catch (e) { setMsg({ type: 'err', text: e.message }); }
  };

  // สลับลำดับการแสดงผลกับฟอร์มข้าง ๆ ในหน่วยงานเดียวกัน
  const move = async (list, i, dir) => {
    const a = list[i], b = list[i + dir];
    if (!b) return;
    try {
      await api(`/admin/forms/${a.code}`, { method: 'PUT', body: { title: a.title, department: a.department, icon: a.icon, sort: b.sort === a.sort ? b.sort + dir : b.sort } });
      await api(`/admin/forms/${b.code}`, { method: 'PUT', body: { title: b.title, department: b.department, icon: b.icon, sort: a.sort } });
      load();
    } catch (e) { setMsg({ type: 'err', text: e.message }); }
  };

  if (!data) return msg ? <div className="alert">{msg.text}</div> : <div className="muted">กำลังโหลด...</div>;

  return (
    <>
      <div className="page-head"><h1>จัดการแบบฟอร์ม</h1></div>
      <p className="muted small">แก้ไขแบบฟอร์มแล้วระบบจะสร้าง <b>เวอร์ชันใหม่</b> เอกสารที่กรอกไปแล้วยังแสดงตามเวอร์ชันเดิม ส่วนเอกสารใหม่จะใช้เวอร์ชันล่าสุด</p>
      {msg && <div className={`alert ${msg.type === 'ok' ? 'ok' : ''}`}>{msg.text}</div>}

      {data.orgs.map((o) => {
        const list = data.templates.filter((t) => t.org_code === o.code);
        return (
          <section key={o.code} className="user-group" style={{ '--c': o.color }}>
            <div className="page-head">
              <h2 style={{ margin: 0, flex: 1 }}>{o.short_name} <small>{o.name} · เลขที่เอกสาร <code>{o.doc_prefix}-พ.ศ.-ลำดับ</code></small></h2>
              <button className="btn primary" onClick={() => nav(`/admin/forms/new?org=${o.code}`)}>＋ สร้างฟอร์มใหม่</button>
            </div>
            <div className="card table-wrap">
              <table className="list stack">
                <thead><tr><th>แบบฟอร์ม</th><th>เวอร์ชัน</th><th>เอกสาร</th><th>สถานะ</th><th /></tr></thead>
                <tbody>
                  {list.map((t, i) => (
                    <tr key={t.code} className={t.active ? '' : 'inactive'}>
                      <td data-l="แบบฟอร์ม"><span className="row-icon">{iconOf(t.icon)}</span><span>{t.title}<div className="small muted">{t.department}</div></span></td>
                      <td data-l="เวอร์ชัน">v{t.version}</td>
                      <td data-l="เอกสาร">
                        {t.total_cases} ใบ · ค้าง {t.open_cases}
                        {t.old_version_open > 0 && <div className="small muted">({t.old_version_open} ใบยังใช้เวอร์ชันเก่า)</div>}
                      </td>
                      <td data-l="สถานะ">{t.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</td>
                      <td className="row-actions">
                        <Link className="btn ghost" to={`/admin/forms/${t.code}`}>แก้ไข</Link>
                        <button className="btn ghost" disabled={i === 0} onClick={() => move(list, i, -1)} title="เลื่อนขึ้น">↑</button>
                        <button className="btn ghost" disabled={i === list.length - 1} onClick={() => move(list, i, 1)} title="เลื่อนลง">↓</button>
                        <button className={`btn ${t.active ? 'danger' : 'ok'}`}
                          onClick={() => put(t, { active: !t.active }, t.active ? 'ปิดใช้งานแล้ว (ซ่อนจากหน้าแรก เอกสารเดิมยังเปิดดูได้)' : 'เปิดใช้งานแล้ว')}>
                          {t.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!list.length && <tr><td colSpan="5" className="muted center-text">ยังไม่มีแบบฟอร์ม</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </>
  );
}
