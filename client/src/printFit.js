// ทำให้เอกสารพิมพ์ลงกระดาษ A4 "แผ่นเดียว" เสมอ
//  1) ตอนเข้าโหมดพิมพ์ คัดลอกค่าของช่องกรอกเป็นข้อความที่ขึ้นบรรทัดใหม่ได้ (ช่อง input บรรทัดเดียวจะตัดข้อความยาวทิ้ง)
//  2) วัดความสูงของแบบฟอร์มในเลย์เอาต์แบบพิมพ์จริง ถ้าเกินหน้ากระดาษให้ย่อ (zoom) พอดี
// ใช้ matchMedia('print') เพราะตอน listener นี้ทำงาน เบราว์เซอร์ใช้เลย์เอาต์ของหน้าพิมพ์แล้ว (ต่างจาก beforeprint)

const PAGE_H = 1050; // px: A4 สูง 297mm − ขอบ 7mm×2 ≈ 1069px เผื่อไว้เล็กน้อย
const MIN_ZOOM = 0.45;
const THAI_DATE = { year: 'numeric', month: 'short', day: 'numeric' };

function mirrorInputs(root) {
  root.querySelectorAll('input, textarea').forEach((el) => {
    if (el.type === 'checkbox' || el.classList.contains('pv-hidden')) return;
    const span = document.createElement('span');
    span.className = 'pv pv-gen';
    let v = el.value || '';
    if (el.type === 'date' && v) v = new Date(`${v}T00:00:00`).toLocaleDateString('th-TH', THAI_DATE);
    span.textContent = v;
    el.classList.add('pv-hidden');
    el.insertAdjacentElement('afterend', span);
  });
}

function restore(root) {
  root.querySelectorAll('.pv-gen').forEach((n) => n.remove());
  root.querySelectorAll('.pv-hidden').forEach((n) => n.classList.remove('pv-hidden'));
  root.style.zoom = '';
}

// หาค่า zoom ที่ใหญ่ที่สุดที่ความสูงยังไม่เกินหน้า (ค้นหาแบบแบ่งครึ่ง; zoom ทำให้ตัวอักษรขึ้นบรรทัดน้อยลงด้วย จึงต้องวัดซ้ำ)
function fit(paper) {
  const heightAt = (z) => { paper.style.zoom = z === 1 ? '' : String(z); return paper.getBoundingClientRect().height; };
  if (heightAt(1) <= PAGE_H) return 1;
  let lo = MIN_ZOOM; // ถือว่าพอดีเสมอ
  let hi = 1;
  for (let i = 0; i < 9; i++) {
    const mid = (lo + hi) / 2;
    if (heightAt(mid) <= PAGE_H) lo = mid; else hi = mid;
  }
  heightAt(lo);
  return lo;
}

export function installPrintFit() {
  const mql = window.matchMedia('print');
  const onChange = (e) => {
    const paper = document.querySelector('.paper');
    if (!paper) return;
    try {
      if (e.matches) { mirrorInputs(paper); fit(paper); } else restore(paper);
    } catch { /* พิมพ์ต่อได้แม้ตัวช่วยล้มเหลว */ }
  };
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}
