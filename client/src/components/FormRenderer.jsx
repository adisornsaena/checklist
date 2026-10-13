// แสดงแบบฟอร์มจาก schema (header / sections / footer) ให้กรอกได้ หรือแสดงแบบอ่านอย่างเดียว
export default function FormRenderer({ template, data, onChange, readOnly, invalid = [] }) {
  const { schema, org } = template;
  const set = (patch) => onChange({ ...data, ...patch });
  const setIn = (group, key, patch) =>
    set({ [group]: { ...data[group], [key]: { ...data[group]?.[key], ...patch } } });
  const setField = (key, value) => set({ fields: { ...data.fields, [key]: value } });

  return (
    <div className="paper" style={{ '--c': org.color }}>
      <div className="paper-head">
        <span className={`logo-pill logo-${org.code}`}><img src={org.logo || '/okmd-logo.png'} alt={org.shortName} /></span>
        <div className="paper-title">CHECKLIST</div>
        <div className="paper-org">
          <b>{org.name}</b>
          <span>ที่อยู่ {org.address}</span>
          <span>โทร {org.phone}</span>
        </div>
      </div>

      <div className="band">
        <h2>{template.title}</h2>
        <div>{template.department}</div>
      </div>

      <div className="hdr-fields">
        {schema.header.map((f) => (
          <label key={f.key} className={`hf hf-${f.key}`}>
            <span>{f.label}{f.required && <em className="req" title="ต้องกรอก"> *</em>}</span>
            <input
              className={invalid.includes(f.key) ? 'invalid' : ''}
              type={f.type}
              value={data.header?.[f.key] || ''}
              disabled={readOnly}
              onChange={(e) => set({ header: { ...data.header, [f.key]: e.target.value } })}
            />
          </label>
        ))}
      </div>

      {schema.sections.map((s) => {
        if (s.type === 'checks') {
          return (
            <section key={s.id}>
              <h3>{s.title}</h3>
              <table className="tbl checks">
                <thead><tr><th className="w-chk" /><th>รายการตรวจสอบ</th><th className="w-remark">หมายเหตุ</th></tr></thead>
                <tbody>
                  {s.items.map((it) => {
                    const v = data.checks?.[it.id] || {};
                    return (
                      <tr key={it.id} className={v.checked ? 'done' : ''}>
                        <td className="w-chk">
                          <input type="checkbox" className="cb" checked={!!v.checked} disabled={readOnly}
                            onChange={(e) => setIn('checks', it.id, { checked: e.target.checked })} />
                        </td>
                        <td>{it.label}</td>
                        <td className="w-remark">
                          <input value={v.remark || ''} disabled={readOnly}
                            onChange={(e) => setIn('checks', it.id, { remark: e.target.value })} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {s.dateField && (
                <label className="inline-date">
                  {s.dateField.label}
                  <input type="date" value={data.fields?.[s.dateField.key] || ''} disabled={readOnly}
                    onChange={(e) => setField(s.dateField.key, e.target.value)} />
                </label>
              )}
            </section>
          );
        }

        if (s.type === 'steps') {
          return (
            <section key={s.id}>
              <h3>{s.title}</h3>
              <table className="tbl steps">
                <thead>
                  <tr><th>รายการ</th><th>ผลการดำเนินงาน</th><th className="w-date">วันที่ดำเนินการ</th><th>ผู้ดำเนินการ</th><th>หมายเหตุ</th></tr>
                </thead>
                <tbody>
                  {s.items.map((it, i) => {
                    const v = data.steps?.[it.id] || {};
                    return (
                      <tr key={it.id} className={v.value ? 'done' : ''}>
                        <td className="step-label" data-l="รายการ"><span className="no">({i + 1})</span> {it.label}</td>
                        <td data-l="ผลการดำเนินงาน">
                          <div className="opts">
                            {it.options.map((o) => (
                              <label key={o.value} className={`opt ${o.tone || ''} ${v.value === o.value ? 'on' : ''}`}>
                                <input
                                  type="checkbox" className="cb" disabled={readOnly} checked={v.value === o.value}
                                  onChange={() => {
                                    const on = v.value !== o.value;
                                    setIn('steps', it.id, {
                                      value: on ? o.value : '',
                                      // ติ๊กผลแล้วใส่วันที่วันนี้ให้อัตโนมัติ (แก้ไขได้)
                                      ...(on && !v.date ? { date: new Date().toISOString().slice(0, 10) } : {}),
                                    });
                                  }}
                                />
                                {o.label}
                              </label>
                            ))}
                          </div>
                          {it.amount && (
                            <label className="amount">{it.amount}
                              <input type="number" min="0" step="0.01" value={v.amount || ''} disabled={readOnly}
                                onChange={(e) => setIn('steps', it.id, { amount: e.target.value })} />
                            </label>
                          )}
                        </td>
                        <td className="w-date" data-l="วันที่ดำเนินการ">
                          <input type="date" value={v.date || ''} disabled={readOnly}
                            onChange={(e) => setIn('steps', it.id, { date: e.target.value })} />
                        </td>
                        <td data-l="ผู้ดำเนินการ">
                          <input value={v.operator || ''} disabled={readOnly}
                            onChange={(e) => setIn('steps', it.id, { operator: e.target.value })} />
                        </td>
                        <td data-l="หมายเหตุ">
                          <input value={v.remark || ''} disabled={readOnly}
                            onChange={(e) => setIn('steps', it.id, { remark: e.target.value })} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          );
        }

        if (s.type === 'fields') {
          return (
            <section key={s.id}>
              <h3>{s.title}</h3>
              <div className="box fields">
                {s.fields.map((f) => (
                  <label key={f.key}>
                    <span>{f.label}{f.required && <em className="req" title="ต้องกรอก"> *</em>}</span>
                    <input type={f.type} className={invalid.includes(f.key) ? 'invalid' : ''} value={data.fields?.[f.key] || ''} disabled={readOnly}
                      onChange={(e) => setField(f.key, e.target.value)} />
                  </label>
                ))}
              </div>
            </section>
          );
        }
        return null;
      })}

      {schema.footer?.note && (
        <section>
          <h3>รายละเอียดเพิ่มเติม (ถ้ามี)</h3>
          <textarea rows="3" value={data.note || ''} disabled={readOnly} onChange={(e) => set({ note: e.target.value })} />
        </section>
      )}

      <div className="sign">
        {schema.footer?.completedDate && (
          <label>วันที่ดำเนินการแล้วเสร็จ <em className="req" title="ต้องกรอกก่อนปิดงาน">*</em>
            <input type="date" className={invalid.includes('completedDate') ? 'invalid' : ''} value={data.completedDate || ''} disabled={readOnly}
              onChange={(e) => set({ completedDate: e.target.value })} />
          </label>
        )}
        {schema.footer?.closedBy && (
          <label>ผู้ปิดงาน <em className="req" title="ต้องกรอกก่อนปิดงาน">*</em>
            <input className={invalid.includes('closedBy') ? 'invalid' : ''} value={data.closedBy || ''} disabled={readOnly} onChange={(e) => set({ closedBy: e.target.value })} />
          </label>
        )}
      </div>
    </div>
  );
}
