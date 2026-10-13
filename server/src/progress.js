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

// ตัดข้อมูลให้เหลือเฉพาะ key ที่มีใน schema (กันข้อมูลแปลกปลอม) และจำกัดความยาวข้อความ
const str = (v, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : v == null ? '' : String(v).slice(0, max));

export function sanitizeData(schema, input = {}) {
  const out = { header: {}, checks: {}, steps: {}, fields: {} };
  for (const f of schema.header) out.header[f.key] = str(input.header?.[f.key], 300);

  for (const s of schema.sections) {
    if (s.type === 'checks') {
      for (const it of s.items) {
        const c = input.checks?.[it.id] || {};
        out.checks[it.id] = { checked: !!c.checked, remark: str(c.remark, 500) };
      }
      if (s.dateField) out.fields[s.dateField.key] = str(input.fields?.[s.dateField.key], 20);
    } else if (s.type === 'steps') {
      for (const it of s.items) {
        const c = input.steps?.[it.id] || {};
        const allowed = it.options.map((o) => o.value);
        out.steps[it.id] = {
          value: allowed.includes(c.value) ? c.value : '',
          date: str(c.date, 20),
          operator: str(c.operator, 200),
          remark: str(c.remark, 500),
          ...(it.amount ? { amount: str(c.amount, 30) } : {}),
        };
      }
    } else if (s.type === 'fields') {
      for (const f of s.fields) out.fields[f.key] = str(input.fields?.[f.key], 500);
    }
  }
  if (schema.footer?.note) out.note = str(input.note, 5000);
  if (schema.footer?.completedDate) out.completedDate = str(input.completedDate, 20);
  if (schema.footer?.closedBy) out.closedBy = str(input.closedBy, 200);
  return out;
}

// ชื่อช่องส่วนหัวที่เป็นช่องบังคับแต่ยังว่าง
export function missingRequired(schema, data = {}) {
  const empty = (v) => !String(v ?? '').trim();
  const head = (schema.header || []).filter((f) => f.required && empty(data.header?.[f.key]));
  const body = (schema.sections || [])
    .filter((s) => s.type === 'fields')
    .flatMap((s) => s.fields.filter((f) => f.required && empty(data.fields?.[f.key])));
  return [...head, ...body].map((f) => f.label);
}
