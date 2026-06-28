-- CCSP MVP PostgreSQL Schema

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(200) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'candidate',
  is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS candidate_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_name VARCHAR(255),
  office_title VARCHAR(255) NOT NULL,
  jurisdiction VARCHAR(255) NOT NULL,
  election_date DATE,
  party_affiliation VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS checklist_templates (
  id BIGSERIAL PRIMARY KEY,
  office_title VARCHAR(255) NOT NULL,
  jurisdiction VARCHAR(255) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  due_offset_days INTEGER,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (office_title, jurisdiction, item_code)
);

CREATE TABLE IF NOT EXISTS candidate_checklist_items (
  id BIGSERIAL PRIMARY KEY,
  candidate_profile_id BIGINT NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  template_id BIGINT REFERENCES checklist_templates(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  due_date DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_deadlines (
  id BIGSERIAL PRIMARY KEY,
  candidate_profile_id BIGINT NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  label VARCHAR(255) NOT NULL,
  due_date DATE NOT NULL,
  reporting_period_start DATE,
  reporting_period_end DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'upcoming',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS treasurers (
  id BIGSERIAL PRIMARY KEY,
  full_name VARCHAR(200) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  certification_id VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS candidate_treasurer_assignments (
  id BIGSERIAL PRIMARY KEY,
  candidate_profile_id BIGINT NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  treasurer_id BIGINT NOT NULL REFERENCES treasurers(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unassigned_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS documents (
  id BIGSERIAL PRIMARY KEY,
  candidate_profile_id BIGINT NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  checklist_item_id BIGINT REFERENCES candidate_checklist_items(id) ON DELETE SET NULL,
  document_type VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  file_key TEXT,
  mime_type VARCHAR(120),
  uploaded_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  candidate_profile_id BIGINT NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('donation', 'expense')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  transaction_date DATE NOT NULL,
  source_or_vendor VARCHAR(255) NOT NULL,
  purpose TEXT,
  reference_number VARCHAR(100),
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reminders (
  id BIGSERIAL PRIMARY KEY,
  candidate_profile_id BIGINT NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
  deadline_id BIGINT REFERENCES finance_deadlines(id) ON DELETE CASCADE,
  checklist_item_id BIGINT REFERENCES candidate_checklist_items(id) ON DELETE CASCADE,
  remind_at TIMESTAMPTZ NOT NULL,
  channel VARCHAR(30) NOT NULL DEFAULT 'email',
  status VARCHAR(30) NOT NULL DEFAULT 'scheduled',
  sent_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checklist_candidate ON candidate_checklist_items(candidate_profile_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_candidate ON finance_deadlines(candidate_profile_id, due_date);
CREATE INDEX IF NOT EXISTS idx_tx_candidate_date ON transactions(candidate_profile_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_reminders_schedule ON reminders(remind_at, status);
