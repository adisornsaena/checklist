import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, fmtDate } from '../api.js';
import { iconOf } from '../icons.js';

const STATUS = { open: 'กำลังดำเนินการ', closed: 'ปิดงานแล้ว', cancelled: 'ยกเลิก' };

export default function CaseList() {
  const [sp, setSp] = useSearchParams();
  const [catalog, setCatalog] = useState([]);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState(sp.get('q') || '');

  const org = sp.get('org') || '';
  const template = sp.get('template') || '';
  const status = sp.get('status') || '';
  const page = Number(sp.get('page') || 1);
  const qs = sp.get('q') || '';

  useEffect(() => { api('/catalog').then(setCatalog).catch(() => {}); }, []);
  useEffect(() => {
    setData(null);
    const p = new URLSearchParams({ page });
    if (org) p.set('org', org);
    if (template) p.set('template', template);
    if (status) p.set('status', status);
    if (qs) p.set('q', qs);
    api(`/cases?${p}`).then(setData).catch((e) => setErr(e.message));
  }, [org, template, status, qs, page]);

  const set = (k, v) => {
    const n = new URLSearchParams(sp);
    v ? n.set(k, v) : n.delete(k);
    if (k !== 'page') n.delete('page');
    if (k === 'org') n.delete('template');
    setSp(n);
  };
  const templates = catalog.filter((o) => !org || o.code === org).flatMap((o) => o.templates);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;

  return (
    <>
      <h1>รายการเอกสาร Checklist</h1>
      <form className="filters card" onSubmit={(e) => { e.preventDefault(); set('q', q); }}>
        <input placeholder="ค้นหา เลขที่เอกสาร / เลขที่คำขอ / ผู้ขอรับบริการ" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={org} onChange={(e) => set('org', e.target.value)}>
          <option value="">ทุกหน่วยงาน</option>
          {catalog.map((o) => <option key={o.code} value={o.code}>{o.short_name}</option>)}
        </select>
        <select value={template} onChange={(e) => set('template', e.target.value)}>
          <option value="">ทุกแบบฟอร์ม</option>
          {templates.map((t) => <option key={t.code} value={t.code}>{t.title}</option>)}
        </select>
        <select value={status} onChange={(e) => set('status', e.target.value)}>
          <option value="">ทุกสถานะ</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn primary">ค้นหา</button>
      </form>

      {err && <div className="alert">{err}</div>}
      {!data ? <div className="muted">กำลังโหลด...</div> : (
        <div className="card table-wrap">
          <table className="list stack">
            <thead>
              <tr><th>เลขที่เอกสาร</th><th>แบบฟอร์ม</th><th>ผู้ขอรับบริการ</th><th>วันที่รับเรื่อง</th><th>ความคืบหน้า</th><th>สถานะ</th></tr>
            </thead>
            <tbody>
              {data.items.map((c) => (
                <tr key={c.id}>
                  <td data-l="เลขที่เอกสาร"><Link to={`/cases/${c.id}`}>{c.case_no}</Link><div className="small muted">{c.doc_no}</div></td>
                  <td data-l="แบบฟอร์ม"><span className="row-icon">{iconOf(c.template_icon)}</span><span>{c.template_title}<div className="small muted">{c.org_name}</div></span></td>
                  <td data-l="ผู้ขอรับบริการ">{c.requester || '-'}</td>
                  <td data-l="วันที่รับเรื่อง">{fmtDate(c.receive_date)}</td>
                  <td data-l="ความคืบหน้า"><div className="bar"><i style={{ width: `${c.progress}%` }} /></div><span className="small">{c.progress}%</span></td>
                  <td data-l="สถานะ"><span className={`badge ${c.status}`}>{STATUS[c.status]}</span></td>
                </tr>
              ))}
              {!data.items.length && <tr><td colSpan="6" className="muted center-text">ไม่พบเอกสาร</td></tr>}
            </tbody>
          </table>
          <div className="pager">
            <span className="muted small">ทั้งหมด {data.total} รายการ</span>
            <button className="btn ghost" disabled={page <= 1} onClick={() => set('page', page - 1)}>ก่อนหน้า</button>
            <span>{page} / {pages}</span>
            <button className="btn ghost" disabled={page >= pages} onClick={() => set('page', page + 1)}>ถัดไป</button>
          </div>
        </div>
      )}
    </>
  );
}
