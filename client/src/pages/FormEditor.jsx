import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { ICONS } from '../icons.js';
import FormRenderer from '../components/FormRenderer.jsx';

const rid = (p) => p + Math.random().toString(36).slice(2, 7);

// ชุดตัวเลือกผลการดำเนินงานสำเร็จรูป (ตรงกับที่ใช้ในฟอร์มต้นฉบับ)
const o = (value, label, tone) => ({ value, label, ...(tone ? { tone } : {}) });
const PRESETS = [
  ['ดำเนินการแล้วเสร็จ', () => [o('done', 'ดำเนินการแล้วเสร็จ')]],
  ['ครบถ้วน / ไม่ครบถ้วน', () => [o('complete', 'ครบถ้วน'), o('incomplete', 'ไม่ครบถ้วน', 'bad')]],
  ['อนุมัติ / ไม่อนุมัติ', () => [o('approved', 'อนุมัติ'), o('rejected', 'ไม่อนุมัติ', 'bad')]],
  ['ได้รับ / ยังไม่ได้รับ', () => [o('received', 'ได้รับ'), o('pending', 'ยังไม่ได้รับ', 'bad')]],
  ['ดำเนินการแล้วเสร็จ / ไม่เกี่ยวข้อง', () => [o('done', 'ดำเนินการแล้วเสร็จ'), o('na', 'ไม่เกี่ยวข้อง')]],
  ['ดำเนินการแล้วเสร็จ / อยู่ระหว่างการปรับแก้', () => [o('done', 'ดำเนินการแล้วเสร็จ'), o('revising', 'อยู่ระหว่างการปรับแก้')]],
  ['ดำเนินการแล้วเสร็จ / อยู่ระหว่างดำเนินการ', () => [o('done', 'ดำเนินการแล้วเสร็จ'), o('wip', 'อยู่ระหว่างดำเนินการ')]],
  ['ดำเนินการแล้วเสร็จ / มีการดำเนินการต่อเนื่อง', () => [o('done', 'ดำเนินการแล้วเสร็จ'), o('follow', 'มีการดำเนินการต่อเนื่อง')]],
  ['ชำระแล้ว / ยังไม่ชำระ', () => [o('paid', 'ชำระแล้ว'), o('unpaid', 'ยังไม่ชำระ', 'bad')]],
  ['เรียบร้อย / พบความเสียหาย', () => [o('ok', 'เรียบร้อย'), o('damaged', 'พบความเสียหาย', 'bad')]],
  ['เงินสด / โอนผ่านธนาคาร', () => [o('cash', 'เงินสด'), o('transfer', 'โอนผ่านธนาคาร')]],
];
const sig = (opts) => JSON.stringify(opts.map((x) => [x.value, x.label, x.tone || '']));
const presetIndex = (opts) => PRESETS.findIndex(([, f]) => sig(f()) === sig(opts));

// ช่องส่วนหัวสำเร็จรูป (คีย์ requesterOrg / memberNo ใช้เป็นคอลัมน์ "ผู้ขอรับบริการ" ในรายการเอกสาร)
const HEADER_PRESETS = [
  { key: 'receiveDate', label: 'วันที่รับเรื่อง', type: 'date' },
  { key: 'docNo', label: 'เลขที่คำขอ', type: 'text' },
  { key: 'requesterOrg', label: 'ชื่อผู้ขอรับบริการ (หน่วยงาน/องค์กร)', type: 'text', required: true },
  { key: 'coordinator', label: 'ชื่อผู้ประสานงาน', type: 'text', required: true },
  { key: 'phone', label: 'โทรศัพท์', type: 'tel' },
  { key: 'email', label: 'อีเมล', type: 'email' },
  { key: 'memberNo', label: 'เลขที่สมาชิก', type: 'text', required: true },
  { key: 'mediaItems', label: 'รายการสื่อการเรียนรู้', type: 'text' },
];
const TYPE_LABEL = { text: 'ข้อความ', date: 'วันที่', tel: 'โทรศัพท์', email: 'อีเมล', number: 'ตัวเลข' };
const SECTION_LABEL = { checks: 'รายการตรวจสอบ (ติ๊กถูก + หมายเหตุ)', steps: 'ตารางติดตามสถานะ (ผลการดำเนินงาน + วันที่ + ผู้ดำเนินการ)', fields: 'ช่องกรอกข้อมูล' };

const blankSchema = () => ({
  header: HEADER_PRESETS.slice(0, 6).map((f) => ({ ...f })),
  sections: [
    { type: 'checks', id: rid('s'), title: 'การตรวจสอบคำขอ เอกสาร และข้อมูลประกอบการให้บริการ', items: [{ id: rid('c'), label: 'ความถูกต้องของหนังสือขออนุเคราะห์' }] },
    { type: 'steps', id: rid('s'), title: 'การติดตามสถานะการดำเนินงาน', items: [{ id: rid('t'), label: 'ตรวจสอบความถูกต้องและครบถ้วนของเอกสารข้อมูล', options: PRESETS[1][1]() }] },
  ],
  footer: { note: true, completedDate: true, closedBy: true },
});

const swap = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };

function Row({ children, i, n, onMove, onDel, delTitle = 'ลบ' }) {
  return (
    <div className="ed-row">
      <div className="ed-row-main">{children}</div>
      <div className="ed-row-act">
        <button type="button" className="btn ghost" disabled={i === 0} onClick={() => onMove(-1)} title="เลื่อนขึ้น">↑</button>
        <button type="button" className="btn ghost" disabled={i === n - 1} onClick={() => onMove(1)} title="เลื่อนลง">↓</button>
        <button type="button" className="btn danger ghost" onClick={onDel} title={delTitle}>✕</button>
      </div>
    </div>
  );
}

function FieldEditor({ list, onChange, presets, withRequired }) {
  const edit = (fn) => { const n = structuredClone(list); fn(n); onChange(n); };
  const unused = presets?.filter((p) => !list.some((f) => f.key === p.key)) || [];
  return (
    <div>
      {list.map((f, i) => (
        <Row key={f.key} i={i} n={list.length} onMove={(d) => edit((n) => swap(n, i, d))} onDel={() => edit((n) => n.splice(i, 1))}>
          <input value={f.label} placeholder="ชื่อช่อง" onChange={(e) => edit((n) => { n[i].label = e.target.value; })} />
          <select value={f.type} onChange={(e) => edit((n) => { n[i].type = e.target.value; })}>
            {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {withRequired && (
            <label className="small"><input type="checkbox" checked={!!f.required}
              onChange={(e) => edit((n) => { if (e.target.checked) n[i].required = true; else delete n[i].required; })} /> บังคับกรอก <span className="req">*</span></label>
          )}
        </Row>
      ))}
      <div className="ed-add">
        <button type="button" className="btn ghost" onClick={() => edit((n) => n.push({ key: rid('f'), label: '', type: 'text' }))}>＋ เพิ่มช่อง</button>
        {unused.length > 0 && (
          <select value="" onChange={(e) => { const p = unused.find((x) => x.key === e.target.value); if (p) edit((n) => n.push({ ...p })); }}>
            <option value="">＋ เพิ่มช่องสำเร็จรูป…</option>
            {unused.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}

function OptionsEditor({ options, onChange }) {
  const pi = presetIndex(options);
  const edit = (fn) => { const n = structuredClone(options); fn(n); onChange(n); };
  return (
    <div className="ed-opts">
      <select value={pi < 0 ? 'custom' : pi} onChange={(e) => onChange(e.target.value === 'custom' ? options : PRESETS[Number(e.target.value)][1]())}>
        {PRESETS.map(([label], i) => <option key={i} value={i}>{label}</option>)}
        <option value="custom">กำหนดเอง…</option>
      </select>
      {pi < 0 && (
        <div className="ed-custom">
          {options.map((x, i) => (
            <div key={x.value} className="ed-opt-row">
              <input value={x.label} placeholder="ชื่อตัวเลือก" onChange={(e) => edit((n) => { n[i].label = e.target.value; })} />
              <label className="small"><input type="checkbox" checked={x.tone === 'bad'} onChange={(e) => edit((n) => { if (e.target.checked) n[i].tone = 'bad'; else delete n[i].tone; })} /> ผลไม่ดี (สีแดง)</label>
              <button type="button" className="btn danger ghost" disabled={options.length <= 1} onClick={() => edit((n) => n.splice(i, 1))}>✕</button>
            </div>
          ))}
          {options.length < 6 && <button type="button" className="btn ghost" onClick={() => edit((n) => n.push({ value: rid('o'), label: '' }))}>＋ เพิ่มตัวเลือก</button>}
        </div>
      )}
    </div>
  );
}

export default function FormEditor() {
  const { code } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const isNew = !code;
  const [orgs, setOrgs] = useState([]);
  const [orgCode, setOrgCode] = useState(sp.get('org') || '');
  const [meta, setMeta] = useState({ title: '', department: '', icon: 'book', active: true });
  const [schema, setSchema] = useState(isNew ? blankSchema : null);
  const [version, setVersion] = useState(null);
  const [tab, setTab] = useState('edit');
  const [msg, setMsg] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/admin/forms').then((d) => setOrgs(d.orgs)).catch((e) => setMsg({ type: 'err', text: e.message }));
    if (!isNew) {
      api(`/admin/forms/${code}`).then((t) => {
        setOrgCode(t.org.code);
        setMeta({ title: t.title, department: t.department || '', icon: t.icon || 'book', active: t.active });
        setSchema(t.schema); setVersion(t.version);
      }).catch((e) => setMsg({ type: 'err', text: e.message }));
    }
  }, [code, isNew]);

  useEffect(() => {
    const h = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const org = orgs.find((x) => x.code === orgCode);
  const edit = (fn) => { setSchema((s) => { const n = structuredClone(s); fn(n); return n; }); setDirty(true); };
  const setM = (patch) => { setMeta((m) => ({ ...m, ...patch })); setDirty(true); };

  const previewTpl = useMemo(() => schema && ({
    title: meta.title || '(ชื่อแบบฟอร์ม)', department: meta.department, schema, version,
    org: { code: orgCode, name: org?.name || '', shortName: org?.short_name || '', address: org?.address || '', phone: org?.phone || '', color: org?.color || '#12657a', logo: org?.logo },
  }), [schema, meta, org, orgCode, version]);

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      if (isNew) {
        if (!orgCode) throw new Error('กรุณาเลือกหน่วยงาน');
        const r = await api('/admin/forms', { method: 'POST', body: { orgCode, ...meta, schema } });
        setDirty(false);
        nav(`/admin/forms/${r.code}`, { replace: true });
      } else {
        const t = await api(`/admin/forms/${code}`, { method: 'PUT', body: { ...meta, schema } });
        setSchema(t.schema);
        const bumped = version != null && t.version !== version;
        setVersion(t.version); setDirty(false);
        setMsg({ type: 'ok', text: bumped ? `บันทึกแล้ว — สร้างเวอร์ชัน v${t.version} (เอกสารที่กรอกไปแล้วยังใช้เวอร์ชันเดิม)` : 'บันทึกแล้ว (ไม่มีการเปลี่ยนโครงสร้างฟอร์ม)' });
      }
    } catch (e) { setMsg({ type: 'err', text: e.message }); } finally { setBusy(false); }
  };

  if (!schema) return msg ? <div className="alert">{msg.text}</div> : <div className="muted">กำลังโหลด...</div>;

  return (
    <>
      <div className="page-head">
        <h1>{isNew ? 'สร้างแบบฟอร์มใหม่' : 'แก้ไขแบบฟอร์ม'} {version != null && <span className="badge">v{version}</span>}</h1>
        <Link to="/admin/forms" className="btn ghost">← กลับ</Link>
        <button className="btn primary" disabled={busy} onClick={save}>💾 บันทึก{!isNew && ' (สร้างเวอร์ชันใหม่ถ้ามีการแก้โครงสร้าง)'}</button>
      </div>
      {msg && <div className={`alert ${msg.type === 'ok' ? 'ok' : ''}`}>{msg.text}</div>}
      {dirty && <div className="muted small">มีการแก้ไขที่ยังไม่บันทึก</div>}

      <div className="tabs">
        <button className={tab === 'edit' ? 'on' : ''} onClick={() => setTab('edit')}>แก้ไข</button>
        <button className={tab === 'preview' ? 'on' : ''} onClick={() => setTab('preview')}>ตัวอย่างแบบฟอร์ม</button>
      </div>

      {tab === 'preview' ? (
        <FormRenderer template={previewTpl} data={{ header: {}, checks: {}, steps: {}, fields: {} }} readOnly onChange={() => {}} />
      ) : (
        <div className="editor">
          <section className="card ed-sec">
            <h3>ข้อมูลทั่วไป</h3>
            <div className="ed-grid">
              <label>หน่วยงาน
                <select value={orgCode} disabled={!isNew} onChange={(e) => { setOrgCode(e.target.value); setDirty(true); }}>
                  <option value="">— เลือกหน่วยงาน —</option>
                  {orgs.map((x) => <option key={x.code} value={x.code}>{x.short_name}</option>)}
                </select>
              </label>
              <label>ไอคอน
                <select value={meta.icon} onChange={(e) => setM({ icon: e.target.value })}>
                  {Object.entries(ICONS).map(([k, v]) => <option key={k} value={k}>{v} {k}</option>)}
                </select>
              </label>
              <label className="wide">ชื่อแบบฟอร์ม <input value={meta.title} onChange={(e) => setM({ title: e.target.value })} /></label>
              <label className="wide">ฝ่าย/หน่วยที่รับผิดชอบ (แสดงใต้ชื่อ) <input value={meta.department} onChange={(e) => setM({ department: e.target.value })} /></label>
            </div>
          </section>

          <section className="card ed-sec">
            <h3>ช่องส่วนหัวฟอร์ม</h3>
            <p className="muted small">ใช้ช่อง "ชื่อผู้ขอรับบริการ" หรือ "เลขที่สมาชิก" (สำเร็จรูป) เพื่อให้แสดงในคอลัมน์ผู้ขอรับบริการของรายการเอกสาร</p>
            <FieldEditor withRequired list={schema.header} presets={HEADER_PRESETS} onChange={(n) => edit((s) => { s.header = n; })} />
          </section>

          {schema.sections.map((s, si) => (
            <section key={s.id} className="card ed-sec">
              <div className="ed-sec-head">
                <span className="badge">{SECTION_LABEL[s.type]}</span>
                <div className="ed-row-act">
                  <button type="button" className="btn ghost" disabled={si === 0} onClick={() => edit((n) => swap(n.sections, si, -1))}>↑</button>
                  <button type="button" className="btn ghost" disabled={si === schema.sections.length - 1} onClick={() => edit((n) => swap(n.sections, si, 1))}>↓</button>
                  <button type="button" className="btn danger ghost" disabled={schema.sections.length <= 1}
                    onClick={() => window.confirm(`ลบส่วน "${s.title}" ทั้งส่วน?`) && edit((n) => n.sections.splice(si, 1))}>ลบส่วน</button>
                </div>
              </div>
              <label className="ed-title">หัวข้อส่วน <input value={s.title} onChange={(e) => edit((n) => { n.sections[si].title = e.target.value; })} /></label>

              {s.type === 'checks' && (
                <>
                  {s.items.map((it, i) => (
                    <Row key={it.id} i={i} n={s.items.length} onMove={(d) => edit((n) => swap(n.sections[si].items, i, d))} onDel={() => edit((n) => n.sections[si].items.splice(i, 1))}>
                      <input value={it.label} placeholder="ข้อความรายการตรวจสอบ" onChange={(e) => edit((n) => { n.sections[si].items[i].label = e.target.value; })} />
                    </Row>
                  ))}
                  <div className="ed-add">
                    <button type="button" className="btn ghost" onClick={() => edit((n) => n.sections[si].items.push({ id: rid('c'), label: '' }))}>＋ เพิ่มรายการ</button>
                    <label className="small"><input type="checkbox" checked={!!s.dateField}
                      onChange={(e) => edit((n) => { if (e.target.checked) n.sections[si].dateField = { key: rid('d'), label: 'วันที่', type: 'date' }; else delete n.sections[si].dateField; })} /> มีช่องวันที่ท้ายตาราง</label>
                    {s.dateField && <input className="ed-inline" value={s.dateField.label} placeholder="ป้ายช่องวันที่ เช่น วันที่ส่งมอบ"
                      onChange={(e) => edit((n) => { n.sections[si].dateField.label = e.target.value; })} />}
                  </div>
                </>
              )}

              {s.type === 'steps' && (
                <>
                  {s.items.map((it, i) => (
                    <Row key={it.id} i={i} n={s.items.length} onMove={(d) => edit((n) => swap(n.sections[si].items, i, d))} onDel={() => edit((n) => n.sections[si].items.splice(i, 1))}>
                      <input value={it.label} placeholder="ข้อความรายการ/ขั้นตอน" onChange={(e) => edit((n) => { n.sections[si].items[i].label = e.target.value; })} />
                      <OptionsEditor options={it.options} onChange={(opts) => edit((n) => { n.sections[si].items[i].options = opts; })} />
                      <div className="ed-amount">
                        <label className="small"><input type="checkbox" checked={!!it.amount}
                          onChange={(e) => edit((n) => { if (e.target.checked) n.sections[si].items[i].amount = 'จำนวนเงิน (บาท)'; else delete n.sections[si].items[i].amount; })} /> มีช่องกรอกจำนวนเงิน</label>
                        {it.amount && <input className="ed-inline" value={it.amount} onChange={(e) => edit((n) => { n.sections[si].items[i].amount = e.target.value; })} />}
                      </div>
                    </Row>
                  ))}
                  <div className="ed-add">
                    <button type="button" className="btn ghost" onClick={() => edit((n) => n.sections[si].items.push({ id: rid('t'), label: '', options: PRESETS[0][1]() }))}>＋ เพิ่มขั้นตอน</button>
                  </div>
                </>
              )}

              {s.type === 'fields' && <FieldEditor withRequired list={s.fields} onChange={(f) => edit((n) => { n.sections[si].fields = f; })} />}
            </section>
          ))}

          <div className="card ed-sec">
            <h3>เพิ่มส่วนใหม่</h3>
            <div className="ed-add">
              {Object.entries(SECTION_LABEL).map(([type, label]) => (
                <button key={type} type="button" className="btn ghost" onClick={() => edit((n) => n.sections.push(
                  type === 'checks' ? { type, id: rid('s'), title: 'หัวข้อใหม่', items: [{ id: rid('c'), label: '' }] }
                    : type === 'steps' ? { type, id: rid('s'), title: 'หัวข้อใหม่', items: [{ id: rid('t'), label: '', options: PRESETS[0][1]() }] }
                      : { type, id: rid('s'), title: 'หัวข้อใหม่', fields: [{ key: rid('f'), label: '', type: 'text' }] }
                ))}>＋ {label}</button>
              ))}
            </div>
          </div>

          <section className="card ed-sec">
            <h3>ท้ายฟอร์ม</h3>
            <label className="ed-check"><input type="checkbox" checked={schema.footer.note} onChange={(e) => edit((n) => { n.footer.note = e.target.checked; })} /> ช่อง "รายละเอียดเพิ่มเติม (ถ้ามี)"</label>
            <label className="ed-check"><input type="checkbox" checked={schema.footer.completedDate} onChange={(e) => edit((n) => { n.footer.completedDate = e.target.checked; })} /> ช่อง "วันที่ดำเนินการแล้วเสร็จ" <span className="muted small">(ถ้าเปิด ต้องกรอกก่อนปิดงาน)</span></label>
            <label className="ed-check"><input type="checkbox" checked={schema.footer.closedBy} onChange={(e) => edit((n) => { n.footer.closedBy = e.target.checked; })} /> ช่อง "ผู้ปิดงาน" <span className="muted small">(ถ้าเปิด ต้องกรอกก่อนปิดงาน)</span></label>
          </section>
        </div>
      )}
    </>
  );
}
