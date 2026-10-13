import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate } from '../api.js';
import { iconOf } from '../icons.js';

export default function Home() {
  const [catalog, setCatalog] = useState(null);
  const [stats, setStats] = useState([]);
  const [open, setOpen] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    Promise.all([api('/catalog'), api('/stats'), api('/cases?status=open&size=10')])
      .then(([c, s, o]) => { setCatalog(c); setStats(s); setOpen(o); })
      .catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="alert">{err}</div>;
  if (!catalog || !open) return <div className="muted">กำลังโหลด...</div>;

  const count = (org, status) => stats.filter((s) => s.org_code === org && s.status === status).reduce((a, s) => a + s.n, 0);
  const tcount = (tpl, status) => stats.find((s) => s.template_code === tpl && s.status === status)?.n || 0;

  return (
    <>
      <h1>เลือกแบบฟอร์ม Checklist</h1>
      {catalog.map((o) => (
        <section key={o.code} className="org" style={{ '--c': o.color }}>
          <div className="org-head">
            <div>
              <h2>{o.short_name}</h2>
              <div className="small">{o.name}</div>
            </div>
            <div className="org-stats">
              <Link to={`/cases?org=${o.code}&status=open`}><b>{count(o.code, 'open')}</b> กำลังดำเนินการ</Link>
              <Link to={`/cases?org=${o.code}&status=closed`}><b>{count(o.code, 'closed')}</b> ปิดงานแล้ว</Link>
            </div>
          </div>
          <div className="grid">
            {o.templates.map((t) => (
              <Link key={t.code} to={`/cases/new/${t.code}`} className="tile">
                <span className="tile-icon">{iconOf(t.icon)}</span>
                <span>
                  <b>{t.title}</b>
                  <small>{t.department}</small>
                </span>
                <span className="tile-counts">
                  <span className="open" title="ยังไม่ปิดงาน">กำลังดำเนินการ <b>{tcount(t.code, 'open')}</b></span>
                  <span className="closed" title="ปิดงานแล้ว">ปิดงานแล้ว <b>{tcount(t.code, 'closed')}</b></span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <section className="card open-cases">
        <div className="page-head">
          <h2>เอกสารที่ยังไม่ปิดงาน <span className="badge open">{open?.total ?? 0}</span></h2>
          {catalog.length === 1 && <span className="muted small">{catalog[0].short_name}</span>}
          <Link to="/cases?status=open" className="small">ดูทั้งหมด →</Link>
        </div>
        {!open?.items.length ? (
          <div className="muted center-text" style={{ padding: 12 }}>ไม่มีเอกสารค้างดำเนินการ 🎉</div>
        ) : (
          <div className="table-wrap">
            <table className="list stack">
              <thead><tr><th>เลขที่เอกสาร</th><th>แบบฟอร์ม</th><th>ผู้ขอรับบริการ</th><th>วันที่รับเรื่อง</th><th>ความคืบหน้า</th></tr></thead>
              <tbody>
                {open.items.map((c) => (
                  <tr key={c.id}>
                    <td data-l="เลขที่เอกสาร"><Link to={`/cases/${c.id}`}>{c.case_no}</Link><div className="small muted">{c.doc_no}</div></td>
                    <td data-l="แบบฟอร์ม"><span className="row-icon">{iconOf(c.template_icon)}</span><span>{c.template_title}{catalog.length > 1 && <div className="small muted">{c.org_name}</div>}</span></td>
                    <td data-l="ผู้ขอรับบริการ">{c.requester || '-'}</td>
                    <td data-l="วันที่รับเรื่อง">{fmtDate(c.receive_date)}</td>
                    <td data-l="ความคืบหน้า"><div className="bar"><i style={{ width: `${c.progress}%` }} /></div><span className="small">{c.progress}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
