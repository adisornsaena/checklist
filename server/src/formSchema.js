// ตรวจและทำความสะอาด schema แบบฟอร์มที่ผู้ดูแลส่งมา (ก่อนบันทึกเป็นเวอร์ชันใหม่)
const ID = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const TYPES = ['text', 'date', 'tel', 'email', 'number'];

const bad = (msg) => { throw Object.assign(new Error(msg), { status: 400 }); };
const text = (v, max, what) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) bad(`กรุณากรอก${what}`);
  if (s.length > max) bad(`${what}ยาวเกิน ${max} ตัวอักษร`);
  return s;
};
const uniq = (set, id, what) => {
  if (!ID.test(id || '')) bad(`รหัส${what}ไม่ถูกต้อง`);
  if (set.has(id)) bad(`รหัส${what}ซ้ำ: ${id}`);
  set.add(id);
};
const fieldDef = (f, keys) => {
  uniq(keys, f?.key, 'ช่อง');
  return { key: f.key, label: text(f.label, 200, 'ชื่อช่อง'), type: TYPES.includes(f.type) ? f.type : 'text', ...(f.required ? { required: true } : {}) };
};

export function validateSchema(input) {
  if (!input || typeof input !== 'object') bad('schema ไม่ถูกต้อง');

  const hKeys = new Set();
  if (!Array.isArray(input.header) || input.header.length > 30) bad('ส่วนหัวฟอร์มไม่ถูกต้อง');
  const header = input.header.map((f) => fieldDef(f, hKeys));

  const fKeys = new Set(); // ช่องใน fields + dateField ใช้พื้นที่เก็บเดียวกัน
  const sIds = new Set();
  const iIds = new Set();
  if (!Array.isArray(input.sections) || !input.sections.length || input.sections.length > 30) bad('ต้องมีอย่างน้อย 1 ส่วนในฟอร์ม');

  const sections = input.sections.map((s) => {
    uniq(sIds, s?.id, 'ส่วน');
    const base = { id: s.id, title: text(s.title, 300, 'หัวข้อส่วน'), type: s.type };
    if (s.type === 'checks') {
      if (!Array.isArray(s.items) || !s.items.length || s.items.length > 60) bad(`ส่วน "${base.title}" ต้องมีรายการอย่างน้อย 1 ข้อ`);
      const out = { ...base, items: s.items.map((it) => { uniq(iIds, it?.id, 'ข้อ'); return { id: it.id, label: text(it.label, 500, 'ข้อความรายการ') }; }) };
      if (s.dateField) out.dateField = { ...fieldDef({ ...s.dateField, type: 'date' }, fKeys), type: 'date' };
      return out;
    }
    if (s.type === 'steps') {
      if (!Array.isArray(s.items) || !s.items.length || s.items.length > 60) bad(`ส่วน "${base.title}" ต้องมีรายการอย่างน้อย 1 ข้อ`);
      return {
        ...base,
        items: s.items.map((it) => {
          uniq(iIds, it?.id, 'ข้อ');
          if (!Array.isArray(it.options) || !it.options.length || it.options.length > 6) bad('แต่ละข้อต้องมีตัวเลือกผลการดำเนินงาน 1-6 ตัว');
          const vals = new Set();
          const options = it.options.map((o) => {
            uniq(vals, o?.value, 'ตัวเลือก');
            return { value: o.value, label: text(o.label, 100, 'ชื่อตัวเลือก'), ...(o.tone === 'bad' ? { tone: 'bad' } : {}) };
          });
          return {
            id: it.id, label: text(it.label, 500, 'ข้อความรายการ'), options,
            ...(it.amount ? { amount: text(it.amount, 100, 'ป้ายช่องจำนวนเงิน') } : {}),
          };
        }),
      };
    }
    if (s.type === 'fields') {
      if (!Array.isArray(s.fields) || !s.fields.length || s.fields.length > 30) bad(`ส่วน "${base.title}" ต้องมีช่องกรอกอย่างน้อย 1 ช่อง`);
      return { ...base, fields: s.fields.map((f) => fieldDef(f, fKeys)) };
    }
    return bad('ชนิดส่วนของฟอร์มไม่ถูกต้อง');
  });

  const f = input.footer || {};
  return { header, sections, footer: { note: !!f.note, completedDate: !!f.completedDate, closedBy: !!f.closedBy } };
}
