# ระบบ Checklist ออนไลน์ (OKMD / NDMI / TK Park)

แปลงแบบฟอร์ม Checklist กระดาษ 15 ใบ เป็นระบบออนไลน์ — Node.js (Express) + React (Vite) + PostgreSQL

| หน่วยงาน | แบบฟอร์ม |
|---|---|
| OKMD (ส่วนงานกลาง) | พัฒนาศักยภาพ · จัดการองค์ความรู้ · ออกแบบการเรียนรู้ (3) |
| NDMI | ขอคืนเงินค่าประกัน · ยืม-คืนอุปกรณ์ · เข้าชมหมู่คณะ · เช่าพื้นที่ · อบรม/เยี่ยมชมเฉพาะทาง · Oddy Test · ให้คำปรึกษาวิชาชีพ (7) |
| TK Park | TK Book Delivery · ยืม-คืนสื่อ · เข้าชมหมู่คณะ · พื้นที่เช่ารายวัน · เครือข่ายอุทยานการเรียนรู้ (5) |

## เริ่มใช้งาน
```bash
npm run db                 # Postgres ใน Docker (พอร์ต 5433)
npm run install:all
cp server/.env.example server/.env    # แก้ JWT_SECRET / รหัสผ่านแอดมิน
npm run dev:server         # API  http://localhost:4000  (สร้างตาราง+seed แบบฟอร์มอัตโนมัติ)
npm run dev:client         # เว็บ http://localhost:5173
```
Production: `npm run build && npm start` (server เสิร์ฟ client/dist ที่พอร์ต 4000)

ผู้ใช้เริ่มต้น: `admin` / `admin1234` (ตั้งจาก `.env`, สร้างเมื่อยังไม่มี user) — **เปลี่ยนก่อนใช้งานจริง**

## โครงสร้างและแนวคิด
- **แบบฟอร์มเป็นข้อมูล** — นิยามเป็น JSON schema (header / sections: checks · steps · fields / footer) เก็บใน `form_templates`
  - `server/src/templates.js` ใช้เป็นข้อมูลตั้งต้นเท่านั้น (เพิ่มเฉพาะฟอร์มที่ยังไม่มีในฐานข้อมูล ไม่เขียนทับ)
  - **แก้/เพิ่ม/ปิดใช้งาน/เรียงลำดับฟอร์มได้ที่เมนู "จัดการแบบฟอร์ม"** (admin) พร้อมแท็บตัวอย่าง
- **รหัสข้อคงที่ + เวอร์ชัน** — ทุกข้อ/ช่องมีรหัสของตัวเอง (ไม่ผูกกับลำดับ) การแก้โครงสร้างฟอร์มจะสร้างเวอร์ชันใหม่ใน
  `form_template_versions` เอกสารที่กรอกไปแล้วเก็บ `template_version` และแสดงตามเวอร์ชันเดิม จึงลบ/แทรก/เรียงข้อได้โดยข้อมูลเก่าไม่เพี้ยน
- `cases` 1 แถว = 1 ใบ Checklist (คำตอบเป็น JSONB + คอลัมน์ค้นหา: วันที่รับเรื่อง, เลขที่คำขอ, ผู้ขอรับบริการ, ความคืบหน้า, สถานะ)
- **เลขที่เอกสาร** `<อักษรนำหน้า>-<พ.ศ.>-<ลำดับ 5 หลัก>` รันแยกตามหน่วยงานและปี: OKMD → `OK-2569-00001`, NDMI → `ND-…`, TK Park → `TK-…`
  (อักษรนำหน้าตั้งที่ `doc_prefix` ใน `templates.js`/ตาราง `orgs`; ตัวนับอยู่ใน `case_counters`)
- สถานะ open → closed / cancelled; ปิดงานต้องกรอก "ผู้ปิดงาน" และ "วันที่ดำเนินการแล้วเสร็จ" (ถ้าฟอร์มมีช่องนั้น); ปิดแล้วล็อกฟอร์ม (เฉพาะ admin เปิดใหม่ได้)
- สิทธิ์: `admin` ทุกหน่วยงาน · `staff` ผูก `org_id` เห็นเฉพาะหน่วยงานตน (จัดการที่เมนู "ผู้ใช้งาน")
- **เมนู "คู่มือ"** (ทุกบัญชีเห็น): แอนิเมชันสาธิตขั้นตอนการใช้งาน + สรุปแต่ละขั้นตอน — ไฟล์อยู่ที่ `client/public/manual/` (`animation.html`/`animation.js`); ไฟล์เดี่ยวสำหรับแชร์อยู่ที่ `docs/usage-animation.html`
- พิมพ์/บันทึก PDF จากปุ่ม "พิมพ์" (A4 หน้าเดียว) · รองรับมือถือ/แท็บเล็ต · ประวัติการแก้ไขใน `case_logs`

## เปิดให้ผู้ใช้ภายนอกเข้าทดสอบ (nginx)
รันทั้งชุดเป็นคอนเทนเนอร์: **nginx (พอร์ต 80) → app (Node, ภายในเท่านั้น) → db (เฉพาะเครื่องนี้)**
```bash
docker compose --profile web up -d --build      # เริ่ม / อัปเดตหลังแก้โค้ด
docker compose --profile web logs -f app nginx  # ดู log
docker compose --profile web stop app nginx     # หยุดเฉพาะส่วนที่เปิดให้ภายนอก
```
- ค่าลับอยู่ใน `.env` ข้าง `docker-compose.yml` (`JWT_SECRET` สุ่มแล้ว, `HTTP_PORT` ค่าเริ่มต้น 80) — ห้ามแชร์ไฟล์นี้
- nginx: จำกัดความถี่ล็อกอิน 30 ครั้ง/นาที/IP, จำกัด API, gzip, แคชไฟล์ `/assets/`, security headers (`nginx/default.conf`)
- db (5433) และ pgAdmin (5051) เปิดเฉพาะ `127.0.0.1` เครื่องอื่นเข้าไม่ได้
- ก่อนเปิดให้คนนอก: เปลี่ยนรหัสผ่าน `admin` และสร้างบัญชีผู้ทดสอบที่เมนู "ผู้ใช้งาน"
- เป็น HTTP ธรรมดา: ถ้าเปิดออกอินเทอร์เน็ตควรใช้ HTTPS (โดเมน + ใบรับรอง หรือ tunnel)

### การป้องกันในตัวแอป
- สิทธิ์/หน่วยงาน/สถานะบัญชี อ่านจากฐานข้อมูลทุกคำขอ — ปิดบัญชี ย้ายหน่วยงาน ลดสิทธิ์ มีผลทันที
- เปลี่ยนรหัสผ่าน (ผู้ใช้เองที่ชื่อมุมขวาบน หรือผู้ดูแลตั้งให้) → token เดิมทุกเครื่องใช้ไม่ได้
- ล็อกอินผิด 10 ครั้ง / 15 นาที ต่อ (IP + ชื่อผู้ใช้) ถูกพัก 15 นาที (ต้องตั้ง `TRUST_PROXY=1` เมื่ออยู่หลัง nginx — ตั้งไว้แล้วใน compose)
- security headers + CSP ทุก response, API ตอบ `Cache-Control: no-store`, ปิด CORS (เปิดเฉพาะ origin ใน `CORS_ORIGIN` ถ้าจำเป็น)
- production ไม่ยอมสร้างผู้ดูแลคนแรกด้วย `admin1234` (ต้องตั้ง `ADMIN_PASSWORD` ≥ 12 ตัว) และเตือนใน log ถ้ามีผู้ดูแลที่ยังใช้รหัสนี้

## การทดสอบ
ใช้เซิร์ฟเวอร์และฐานข้อมูลแยก (พอร์ต 4100, ฐานข้อมูล `checklist_test`) ไม่แตะข้อมูลจริง
```bash
npm run db             # Postgres ต้องรันอยู่
npm run test:server    # หน้าต่างแยก: สร้างฐานข้อมูลทดสอบ + บัญชีทดสอบ (tests/fixtures/users.json) อัตโนมัติ
npm run test:api       # รันเทสต์ API ใน tests/api/
```
Sub agents สำหรับ Claude Code อยู่ใน `.claude/agents/`: `api-tester` · `ui-e2e-tester` · `form-schema-checker` ·
`security-reviewer` · `test-reporter` (รายงานผลเก็บที่ `tests/reports/`)

## API หลัก
`POST /api/auth/login` · `GET /api/catalog` · `GET /api/templates/:code` · `GET|POST /api/cases` ·
`GET|PUT|DELETE /api/cases/:id` · `POST /api/cases/:id/(close|reopen|cancel)` · `GET /api/stats`

admin: `GET|POST /api/admin/forms` · `GET|PUT /api/admin/forms/:code` · `GET|POST|PUT /api/users`
#   c h e c k l i s t 
 
 