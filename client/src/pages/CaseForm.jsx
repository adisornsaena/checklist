import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, fmtDate } from '../api.js';
import { useAuth } from '../App.jsx';
import FormRenderer from '../components/FormRenderer.jsx';
import { installPrintFit } from '../printFit.js';

const STATUS = { open: 'กำลังดำเนินการ', closed: 'ปิดงานแล้ว', cancelled: 'ยกเลิก' };

const emptyData = (schema) => ({
  header: { receiveDate: new Date().toISOString().slice(0, 10) },
  checks: {}, steps: {}, fields: {},
  ...(schema.footer?.note ? { note: '' } : {}),
});

export default function CaseForm() {
  const { code, id } = useParams(); // /cases/new/:code หรือ /cases/:id
  const nav = useNavigate();
  const { user } = useAuth();
  const [template, setTemplate] = useState(null);
  const [meta, setMeta] = useState(null); // ข้อมูลเอกสารที่บันทึกแล้ว
  const [data, setData] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // {type, text}
  const [invalid, setInvalid] = useState([]); // ช่องที่ต้องกรอกก่อนปิดงาน

  const applyCase = (c) => {
    setTemplate(c.template);
    setMeta(c);
    setData(c.data);
    setDirty(false);
  };

  useEffect(() => {
    setMsg(null);
    (id
      ? api(`/cases/${id}`).then(applyCase)
      : api(`/templates/${code}`).then((t) => { setTemplate(t); setMeta(null); setData(emptyData(t.schema)); setDirty(false); })
    ).catch((e) => setMsg({ type: 'err', text: e.message }));
  }, [id, code]);

  // เตือนก่อนปิดหน้าเมื่อยังไม่บันทึก
  useEffect(() => {
    const h = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  // พิมพ์ให้พอดี A4 แผ่นเดียว: ข้อความยาวขึ้นบรรทัดใหม่ + ย่อขนาดอัตโนมัติถ้าเกินหน้า
  useEffect(() => installPrintFit(), []);

  const readOnly = meta ? meta.status !== 'open' : false;
  const progress = useMemo(() => {
    if (!template || !data) return 0;
    let total = 0, done = 0;
    for (const s of template.schema.sections) {
      if (s.type === 'checks') s.items.forEach((it) => { total++; if (data.checks?.[it.id]?.checked) done++; });
      if (s.type === 'steps') s.items.forEach((it) => { total++; if (data.steps?.[it.id]?.value) done++; });
    }
    return total ? Math.round((done / total) * 100) : 0;
  }, [template, data]);

  const save = async () => {
    const empty = (v) => !String(v ?? '').trim();
    const miss = [
      ...template.schema.header.filter((f) => f.required && empty(data.header?.[f.key])),
      ...template.schema.sections.filter((s) => s.type === 'fields')
        .flatMap((s) => s.fields.filter((f) => f.required && empty(data.fields?.[f.key]))),
    ];
    if (miss.length) {
      setInvalid(miss.map((f) => f.key));
      setMsg({ type: 'err', text: `กรุณากรอก ${miss.map((f) => f.label).join(', ')}` });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setBusy(true); setMsg(null);
    try {
      if (meta) {
        applyCase(await api(`/cases/${meta.id}`, { method: 'PUT', body: { data } }));
        setMsg({ type: 'ok', text: 'บันทึกเรียบร้อย' });
      } else {
        const c = await api('/cases', { method: 'POST', body: { templateCode: code, data } });
        setDirty(false);
        nav(`/cases/${c.id}`, { replace: true });
      }
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    } finally { setBusy(false); }
  };

  const act = async (action, confirmText) => {
    if (action === 'close') {
      const f = template.schema.footer || {};
      const miss = [];
      if (f.completedDate && !data.completedDate) miss.push('completedDate');
      if (f.closedBy && !data.closedBy?.trim()) miss.push('closedBy');
      setInvalid(miss);
      if (miss.length) {
        const names = { completedDate: 'วันที่ดำเนินการแล้วเสร็จ', closedBy: 'ผู้ปิดงาน' };
        setMsg({ type: 'err', text: `กรุณากรอก${miss.map((k) => names[k]).join(' และ ')}ให้เรียบร้อยก่อนปิดงาน` });
        document.querySelector('.sign')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true); setMsg(null);
    try {
      if (dirty && action === 'close') await api(`/cases/${meta.id}`, { method: 'PUT', body: { data } });
      applyCase(await api(`/cases/${meta.id}/${action}`, { method: 'POST' }));
    } catch (e) { setMsg({ type: 'err', text: e.message }); } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!window.confirm('ลบเอกสารนี้ถาวร? ไม่สามารถกู้คืนได้')) return;
    try { await api(`/cases/${meta.id}`, { method: 'DELETE' }); nav('/cases'); }
    catch (e) { setMsg({ type: 'err', text: e.message }); }
  };

  if (!template || !data) return msg ? <div className="alert">{msg.text}</div> : <div className="muted">กำลังโหลด...</div>;

  return (
    <>
      <div className="toolbar no-print" style={{ '--c': template.org.color }}>
        <div>
          <b>{meta ? meta.caseNo : 'เอกสารใหม่'}</b>
          {meta && <span className={`badge ${meta.status}`}>{STATUS[meta.status]}</span>}
          {meta && template.version && <span className="small muted"> · ฟอร์ม v{template.version}</span>}
          <div className="bar wide"><i style={{ width: `${progress}%` }} /></div>
          <span className="small muted">ความคืบหน้า {progress}%{dirty ? ' · มีการแก้ไขที่ยังไม่บันทึก' : ''}</span>
        </div>
        <div className="grow" />
        <button className="btn ghost" onClick={() => window.print()}>🖨 พิมพ์ / PDF</button>
        {!readOnly && <button className="btn primary" disabled={busy} onClick={save}>💾 บันทึก</button>}
        {meta?.status === 'open' && (
          <>
            <button className="btn ok" disabled={busy} onClick={() => act('close', 'ยืนยันปิดงาน? หลังปิดจะแก้ไขไม่ได้')}>✔ ปิดงาน</button>
            <button className="btn danger" disabled={busy} onClick={() => act('cancel', 'ยืนยันยกเลิกเอกสารนี้?')}>ยกเลิก</button>
          </>
        )}
        {meta && meta.status !== 'open' && user.role === 'admin' && (
          <button className="btn ghost" disabled={busy} onClick={() => act('reopen')}>เปิดงานใหม่</button>
        )}
        {meta && user.role === 'admin' && <button className="btn danger ghost" onClick={remove}>ลบ</button>}
      </div>

      {msg && <div className={`alert ${msg.type === 'ok' ? 'ok' : ''} no-print`}>{msg.text}</div>}

      <FormRenderer
        template={template}
        data={data}
        readOnly={readOnly}
        invalid={invalid}
        onChange={(d) => { setData(d); setDirty(true); setInvalid([]); }}
      />

      {meta?.logs?.length > 0 && (
        <div className="card logs no-print">
          <b>ประวัติการดำเนินการ</b>
          <ul>
            {meta.logs.map((l, i) => (
              <li key={i}>{fmtDate(l.created_at)} {new Date(l.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} · {l.display_name || '-'} · {l.action}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
