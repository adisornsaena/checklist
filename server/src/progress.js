// คำนวณความคืบหน้า (0-100) จาก schema + ข้อมูลที่กรอก
// นับรายการตรวจสอบที่ติ๊กแล้ว + ขั้นตอนที่เลือกผลการดำเนินงานแล้ว
export function calcProgress(schema, data = {}) {
  let total = 0;
  let done = 0;
  for (const s of schema.sections) {
    if (s.type === 'checks') {
      for (const it of s.items) {
        total++;
        if (data.checks?.[it.id]?.checked) done++;
      }
    } else if (s.type === 'steps') {
      for (const it of s.items) {
        total++;
        if (data.steps?.[it.id]?.value) done++;
      }
    }
  }
  return total ? Math.round((done / total) * 100) : 0;
}

// 'YYYY-MM-DD' ที่เป็นวันที่มีอยู่จริงเท่านั้น (2026-02-30 → false)
export function validDate(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// ตัดข้อมูลให้เหลือเฉพาะ key ที่มีใน schema (กันข้อมูลแปลกปลอม) และจำกัดความยาวข้อความ
const str = (v, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : v == null ? '' : String(v).slice(0, max));
const date = (v) => (validDate(v) ? v : '');
const fieldVal = (f, v) => (f.type === 'date' ? date(v) : str(v, 500));

export function sanitizeData(schema, input) {
  if (!input || typeof input !== 'object') input = {};
  const out = { header: {}, checks: {}, steps: {}, fields: {} };
  for (const f of schema.header) out.header[f.key] = str(input.header?.[f.key], 300);

  for (const s of schema.sections) {
    if (s.type === 'checks') {
      for (const it of s.items) {
        const c = input.checks?.[it.id] || {};
        out.checks[it.id] = { checked: c.checked === true, remark: str(c.remark, 500) };
      }
      if (s.dateField) out.fields[s.dateField.key] = date(input.fields?.[s.dateField.key]);
    } else if (s.type === 'steps') {
      for (const it of s.items) {
        const c = input.steps?.[it.id] || {};
        const allowed = it.options.map((o) => o.value);
        out.steps[it.id] = {
          value: allowed.includes(c.value) ? c.value : '',
          date: date(c.date),
          operator: str(c.operator, 200),
          remark: str(c.remark, 500),
          ...(it.amount ? { amount: str(c.amount, 30) } : {}),
        };
      }
    } else if (s.type === 'fields') {
      for (const f of s.fields) out.fields[f.key] = fieldVal(f, input.fields?.[f.key]);
    }
  }
  if (schema.footer?.note) out.note = str(input.note, 5000);
  if (schema.footer?.completedDate) out.completedDate = date(input.completedDate);
  if (schema.footer?.closedBy) out.closedBy = str(input.closedBy, 200);
  return out;
}

// ชื่อช่องส่วนหัวที่เป็นช่องบังคับแต่ยังว่าง
export function missingRequired(schema, data = {}) {
  const empty = (v) => !String(v ?? '').trim();
  const head = (schema.header || []).filter((f) => f.required && empty(data.header?.[f.key]));
  // ช่องใน section ชนิด fields และช่องวันที่ (dateField) ของ section ชนิด checks ต่างเก็บไว้ใน data.fields
  const body = (schema.sections || [])
    .flatMap((s) => (s.type === 'fields' ? s.fields : s.type === 'checks' && s.dateField ? [s.dateField] : []))
    .filter((f) => f.required && empty(data.fields?.[f.key]));
  return [...head, ...body].map((f) => f.label);
}
