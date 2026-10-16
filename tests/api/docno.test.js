// หัวข้อ 4: เลขที่เอกสาร <PREFIX>-<พ.ศ.>-<5 หลัก> นับแยกหน่วยงาน ไม่ซ้ำและต่อเนื่องเมื่อยิงพร้อมกัน
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCase } from '../lib/api.js';

const RE = /^(OK|ND|TK)-25\d{2}-\d{5}$/;
const year = new Date().getFullYear() + 543;
const seq = (no) => Number(no.slice(-5));

test('รูปแบบ ^(OK|ND|TK)-25\\d{2}-\\d{5}$ และปี = ค.ศ. + 543', async () => {
  const r = await createCase('okmd', 'okmd-knowledge-mgmt');
  assert.equal(r.status, 201, r.text);
  assert.match(r.body.caseNo, RE);
  assert.equal(r.body.caseNo.split('-')[1], String(year));
});

test('นับแยกหน่วยงาน: สร้างของหน่วยงานอื่นคั่นกลาง ลำดับของ ND ยัง +1', async () => {
  const a = await createCase('ndmi', 'ndmi-consult');
  await createCase('okmd', 'okmd-capability');
  await createCase('tkpark', 'tkpark-borrow');
  const b = await createCase('ndmi', 'ndmi-refund');
  assert.ok(a.body.caseNo.startsWith('ND-') && b.body.caseNo.startsWith('ND-'));
  assert.equal(seq(b.body.caseNo), seq(a.body.caseNo) + 1, `${a.body.caseNo} → ${b.body.caseNo}`);
});

test('ยิงสร้างพร้อมกัน 20 คำขอ: เลขไม่ซ้ำและต่อเนื่อง', async () => {
  const rs = await Promise.all(Array.from({ length: 20 }, () => createCase('tkpark', 'tkpark-borrow')));
  rs.forEach((r) => assert.equal(r.status, 201, r.text));
  const nos = rs.map((r) => r.body.caseNo);
  nos.forEach((n) => assert.match(n, /^TK-/));
  assert.equal(new Set(nos).size, 20);
  const s = nos.map(seq).sort((x, y) => x - y);
  assert.equal(s[19] - s[0], 19, `ไม่ต่อเนื่อง: ${s.join(',')}`);
});

test('ยิงพร้อมกันข้าม 3 หน่วยงาน (รวม 30): แต่ละหน่วยงานต่อเนื่องของตัวเอง', async () => {
  const jobs = [];
  for (let i = 0; i < 10; i++) jobs.push(createCase('okmd', 'okmd-capability'), createCase('ndmi', 'ndmi-consult'), createCase('tkpark', 'tkpark-borrow'));
  const rs = await Promise.all(jobs);
  rs.forEach((r) => assert.equal(r.status, 201, r.text));
  for (const p of ['OK', 'ND', 'TK']) {
    const s = rs.map((r) => r.body.caseNo).filter((n) => n.startsWith(p)).map(seq).sort((x, y) => x - y);
    assert.equal(s.length, 10);
    assert.equal(s[9] - s[0], 9, `${p} ไม่ต่อเนื่อง: ${s.join(',')}`);
  }
});
