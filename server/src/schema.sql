CREATE TABLE IF NOT EXISTS orgs (
  id          SERIAL PRIMARY KEY,
  code        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  short_name  TEXT NOT NULL,
  address     TEXT,
  phone       TEXT,
  color       TEXT NOT NULL DEFAULT '#12657a',
  sort        INT  NOT NULL DEFAULT 0,
  logo        TEXT
);
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS logo TEXT;

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  org_id        INT REFERENCES orgs(id),          -- NULL = เข้าถึงได้ทุกหน่วยงาน
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- นิยามแบบฟอร์ม (schema เป็น JSONB: header / sections / footer)
CREATE TABLE IF NOT EXISTS form_templates (
  id          SERIAL PRIMARY KEY,
  org_id      INT NOT NULL REFERENCES orgs(id),
  code        TEXT UNIQUE NOT NULL,
  title       TEXT NOT NULL,
  department  TEXT,
  icon        TEXT,
  sort        INT NOT NULL DEFAULT 0,
  schema      JSONB NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS case_seq;

-- ใบ Checklist ที่กรอกจริง 1 แถว = 1 คำขอ
CREATE TABLE IF NOT EXISTS cases (
  id           SERIAL PRIMARY KEY,
  case_no      TEXT UNIQUE NOT NULL,
  template_id  INT NOT NULL REFERENCES form_templates(id),
  receive_date DATE,
  doc_no       TEXT,
  requester    TEXT,
  data         JSONB NOT NULL DEFAULT '{}',
  progress     INT  NOT NULL DEFAULT 0,          -- 0-100
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  created_by   INT REFERENCES users(id),
  updated_by   INT REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS cases_template_idx ON cases(template_id);
CREATE INDEX IF NOT EXISTS cases_status_idx   ON cases(status);
CREATE INDEX IF NOT EXISTS cases_receive_idx  ON cases(receive_date DESC);

-- ประวัติการแก้ไข
CREATE TABLE IF NOT EXISTS case_logs (
  id         SERIAL PRIMARY KEY,
  case_id    INT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  user_id    INT REFERENCES users(id),
  action     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== เลขที่เอกสารแยกตามหน่วยงาน: <PREFIX>-<พ.ศ.>-<ลำดับ> =====
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS doc_prefix TEXT;
CREATE TABLE IF NOT EXISTS case_counters (
  org_id INT NOT NULL REFERENCES orgs(id),
  year   INT NOT NULL,
  last   INT NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, year)
);

-- ===== เวอร์ชันของแบบฟอร์ม: เอกสารเก่าแสดงตามเวอร์ชันที่กรอก =====
ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS form_template_versions (
  template_id INT NOT NULL REFERENCES form_templates(id) ON DELETE CASCADE,
  version     INT NOT NULL,
  schema      JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  INT REFERENCES users(id),
  PRIMARY KEY (template_id, version)
);
ALTER TABLE cases ADD COLUMN IF NOT EXISTS template_version INT NOT NULL DEFAULT 1;

-- เวลาเปลี่ยนรหัสผ่านล่าสุด: token ที่ออกก่อนหน้านี้ใช้ไม่ได้อีก
ALTER TABLE users ADD COLUMN IF NOT EXISTS pwd_changed_at TIMESTAMPTZ;

-- ค่าสถานะการ migrate ครั้งเดียว (กันการเขียนทับสิ่งที่ผู้ดูแลปรับในภายหลัง)
CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT);
