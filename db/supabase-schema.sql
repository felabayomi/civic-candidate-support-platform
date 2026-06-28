-- CCSP Database Schema for Supabase
-- Run this SQL in your Supabase project's SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table (managed by Supabase Auth, but we store profile data here)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'candidate',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Profiles table for role-based access
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'candidate' CHECK (role IN ('candidate', 'treasurer', 'admin', 'advisor', 'volunteer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected'));
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- Backfill profile rows for existing users (idempotent)
INSERT INTO profiles (id, role)
SELECT id, 'candidate'
FROM users
ON CONFLICT (id) DO NOTHING;

-- Ensure a known platform operator account is provisioned as admin (idempotent).
INSERT INTO users (id, email, full_name, role)
SELECT
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'full_name', NULL),
  'admin'
FROM auth.users au
WHERE lower(au.email) IN ('felabayomi@gmail.com', 'ccspcivicos@gmail.com')
ON CONFLICT (id) DO UPDATE
SET
  email = EXCLUDED.email,
  full_name = COALESCE(users.full_name, EXCLUDED.full_name),
  role = 'admin',
  updated_at = NOW();

INSERT INTO profiles (id, full_name, role, approval_status, approved_by, approved_at)
SELECT
  au.id,
  COALESCE(au.raw_user_meta_data->>'full_name', NULL),
  'admin',
  'approved',
  NULL,
  NOW()
FROM auth.users au
WHERE lower(au.email) IN ('felabayomi@gmail.com', 'ccspcivicos@gmail.com')
ON CONFLICT (id) DO UPDATE
SET
  full_name = COALESCE(profiles.full_name, EXCLUDED.full_name),
  role = 'admin',
  approval_status = 'approved',
  approved_by = NULL,
  approved_at = COALESCE(profiles.approved_at, NOW());

-- Candidates table
CREATE TABLE IF NOT EXISTS candidates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_name TEXT NOT NULL,
  office_title TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  election_date DATE,
  party_affiliation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS biography TEXT;
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS campaign_website TEXT;
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS volunteer_opportunities TEXT;
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS is_public_profile BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS public_profile_slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_candidates_public_profile_slug_unique
  ON candidates(public_profile_slug)
  WHERE public_profile_slug IS NOT NULL;

UPDATE candidates
SET public_profile_slug = lower(
  regexp_replace(
    regexp_replace(
      coalesce(campaign_name, 'candidate') || '-' || coalesce(office_title, 'office') || '-' || left(id::text, 8),
      '[^a-zA-Z0-9]+',
      '-',
      'g'
    ),
    '(^-+|-+$)',
    '',
    'g'
  )
)
WHERE (public_profile_slug IS NULL OR btrim(public_profile_slug) = '')
  AND is_public_profile = true;

-- Campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  campaign_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS campaign_name TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS state_code TEXT;

UPDATE campaigns cp
SET state_code = UPPER(SUBSTRING(c.jurisdiction FROM '([A-Za-z]{2})$'))
FROM candidates c
WHERE cp.candidate_id = c.id
  AND (cp.state_code IS NULL OR btrim(cp.state_code) = '');

UPDATE campaigns cp
SET campaign_name = c.campaign_name
FROM candidates c
WHERE cp.candidate_id = c.id
  AND (cp.campaign_name IS NULL OR btrim(cp.campaign_name) = '');

-- Ensure each candidate has at least one campaign row (idempotent backfill).
INSERT INTO campaigns (candidate_id, campaign_name, status)
SELECT c.id, c.campaign_name, 'active'
FROM candidates c
WHERE NOT EXISTS (
  SELECT 1 FROM campaigns cp WHERE cp.candidate_id = c.id
);

-- Treasurers table
CREATE TABLE IF NOT EXISTS treasurers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  certification_id TEXT,
  notes TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Treasurer assignments
CREATE TABLE IF NOT EXISTS treasurer_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  treasurer_id UUID NOT NULL REFERENCES treasurers(id) ON DELETE RESTRICT,
  request_id UUID,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unassigned_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Treasurer marketplace requests
CREATE TABLE IF NOT EXISTS treasurer_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  treasurer_id UUID NOT NULL REFERENCES treasurers(id) ON DELETE CASCADE,
  requested_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  notes TEXT,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE treasurers ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE treasurers ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE treasurers ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE treasurers ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE treasurer_assignments ADD COLUMN IF NOT EXISTS request_id UUID;
ALTER TABLE treasurer_assignments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- Checklist items
CREATE TABLE IF NOT EXISTS checklist_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Donations
CREATE TABLE IF NOT EXISTS donations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  donor_name TEXT NOT NULL,
  donor_email TEXT,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  donation_date DATE NOT NULL,
  reference_number TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  vendor_name TEXT NOT NULL,
  vendor_email TEXT,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  expense_date DATE NOT NULL,
  category TEXT,
  reference_number TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reports
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL,
  reporting_period_start DATE,
  reporting_period_end DATE,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Documents
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  document_type TEXT,
  candidate_id UUID REFERENCES candidates(id) ON DELETE SET NULL,
  checklist_item_id UUID REFERENCES checklist_items(id) ON DELETE SET NULL,
  mime_type TEXT,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS donation_document_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donation_id UUID NOT NULL REFERENCES donations(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  linked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (donation_id, document_id)
);

CREATE TABLE IF NOT EXISTS state_compliance_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code TEXT NOT NULL,
  state_name TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed official state election agency resources for all 50 states + DC (idempotent).
CREATE UNIQUE INDEX IF NOT EXISTS idx_state_compliance_resources_state_url_unique
  ON state_compliance_resources(state_code, url);

INSERT INTO state_compliance_resources (state_code, state_name, title, url, is_active)
VALUES
  ('AL', 'Alabama', 'Alabama Secretary of State Elections Division', 'https://www.sos.alabama.gov/alabama-votes', true),
  ('AK', 'Alaska', 'Alaska Division of Elections', 'https://www.elections.alaska.gov/', true),
  ('AZ', 'Arizona', 'Arizona Secretary of State Elections', 'https://azsos.gov/elections', true),
  ('AR', 'Arkansas', 'Arkansas Secretary of State Elections', 'https://www.sos.arkansas.gov/elections', true),
  ('CA', 'California', 'California Secretary of State Elections', 'https://www.sos.ca.gov/elections', true),
  ('CO', 'Colorado', 'Colorado Secretary of State Elections', 'https://www.coloradosos.gov/pubs/elections/main.html', true),
  ('CT', 'Connecticut', 'Connecticut Secretary of the State Elections', 'https://portal.ct.gov/sots/election-services', true),
  ('DE', 'Delaware', 'Delaware Department of Elections', 'https://elections.delaware.gov/', true),
  ('FL', 'Florida', 'Florida Division of Elections', 'https://dos.myflorida.com/elections/', true),
  ('GA', 'Georgia', 'Georgia Secretary of State Elections', 'https://sos.ga.gov/page/elections-and-voting', true),
  ('HI', 'Hawaii', 'Hawaii Office of Elections', 'https://elections.hawaii.gov/', true),
  ('ID', 'Idaho', 'Idaho Secretary of State Elections', 'https://voteidaho.gov/', true),
  ('IL', 'Illinois', 'Illinois State Board of Elections', 'https://www.elections.il.gov/', true),
  ('IN', 'Indiana', 'Indiana Secretary of State Elections', 'https://www.in.gov/sos/elections/', true),
  ('IA', 'Iowa', 'Iowa Secretary of State Elections', 'https://sos.iowa.gov/elections/', true),
  ('KS', 'Kansas', 'Kansas Secretary of State Elections', 'https://sos.ks.gov/elections/elections.html', true),
  ('KY', 'Kentucky', 'Kentucky State Board of Elections', 'https://elect.ky.gov/', true),
  ('LA', 'Louisiana', 'Louisiana Secretary of State Elections and Voting', 'https://www.sos.la.gov/ElectionsAndVoting/Pages/default.aspx', true),
  ('ME', 'Maine', 'Maine Bureau of Corporations, Elections and Commissions', 'https://www.maine.gov/sos/cec/elec/', true),
  ('MD', 'Maryland', 'Maryland State Board of Elections', 'https://elections.maryland.gov/', true),
  ('MA', 'Massachusetts', 'Massachusetts Elections Division', 'https://www.sec.state.ma.us/divisions/elections/', true),
  ('MI', 'Michigan', 'Michigan Department of State Elections', 'https://www.michigan.gov/sos/elections', true),
  ('MN', 'Minnesota', 'Minnesota Secretary of State Elections', 'https://www.sos.state.mn.us/elections-voting/', true),
  ('MS', 'Mississippi', 'Mississippi Secretary of State Elections and Voting', 'https://www.sos.ms.gov/elections-voting', true),
  ('MO', 'Missouri', 'Missouri Secretary of State Elections', 'https://www.sos.mo.gov/elections', true),
  ('MT', 'Montana', 'Montana Secretary of State Elections', 'https://sosmt.gov/elections/', true),
  ('NE', 'Nebraska', 'Nebraska Secretary of State Elections', 'https://sos.nebraska.gov/elections', true),
  ('NV', 'Nevada', 'Nevada Secretary of State Elections', 'https://www.nvsos.gov/sos/elections', true),
  ('NH', 'New Hampshire', 'New Hampshire Secretary of State Elections', 'https://www.sos.nh.gov/elections', true),
  ('NJ', 'New Jersey', 'New Jersey Division of Elections', 'https://www.nj.gov/state/elections/', true),
  ('NM', 'New Mexico', 'New Mexico Secretary of State Voting and Elections', 'https://www.sos.nm.gov/voting-and-elections/', true),
  ('NY', 'New York', 'New York State Board of Elections', 'https://elections.ny.gov/', true),
  ('NC', 'North Carolina', 'North Carolina State Board of Elections', 'https://www.ncsbe.gov/', true),
  ('ND', 'North Dakota', 'North Dakota Secretary of State Elections', 'https://vip.sos.nd.gov/', true),
  ('OH', 'Ohio', 'Ohio Secretary of State Elections', 'https://www.ohiosos.gov/elections/', true),
  ('OK', 'Oklahoma', 'Oklahoma State Election Board', 'https://oklahoma.gov/elections.html', true),
  ('OR', 'Oregon', 'Oregon Secretary of State Elections', 'https://sos.oregon.gov/voting-elections/Pages/default.aspx', true),
  ('PA', 'Pennsylvania', 'Pennsylvania Voting and Elections', 'https://www.vote.pa.gov/', true),
  ('RI', 'Rhode Island', 'Rhode Island Board of Elections and Secretary of State Voting', 'https://vote.sos.ri.gov/', true),
  ('SC', 'South Carolina', 'South Carolina State Election Commission', 'https://scvotes.gov/', true),
  ('SD', 'South Dakota', 'South Dakota Secretary of State Elections', 'https://sdsos.gov/elections-voting/', true),
  ('TN', 'Tennessee', 'Tennessee Secretary of State Elections', 'https://sos.tn.gov/elections', true),
  ('TX', 'Texas', 'Texas Secretary of State Elections', 'https://www.sos.state.tx.us/elections/', true),
  ('UT', 'Utah', 'Utah Elections', 'https://vote.utah.gov/', true),
  ('VT', 'Vermont', 'Vermont Secretary of State Elections', 'https://sos.vermont.gov/elections/', true),
  ('VA', 'Virginia', 'Virginia Department of Elections', 'https://www.elections.virginia.gov/', true),
  ('WA', 'Washington', 'Washington Secretary of State Elections', 'https://www.sos.wa.gov/elections/', true),
  ('WV', 'West Virginia', 'West Virginia Secretary of State Elections', 'https://sos.wv.gov/elections/Pages/default.aspx', true),
  ('WI', 'Wisconsin', 'Wisconsin Elections Commission', 'https://elections.wi.gov/', true),
  ('WY', 'Wyoming', 'Wyoming Secretary of State Elections', 'https://sos.wyo.gov/Elections/', true),
  ('DC', 'District of Columbia', 'District of Columbia Board of Elections', 'https://www.dcboe.org/', true)
ON CONFLICT (state_code, url) DO UPDATE
SET
  state_name = EXCLUDED.state_name,
  title = EXCLUDED.title,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

CREATE TABLE IF NOT EXISTS compliance_assistant_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state_code TEXT NOT NULL,
  state_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compliance_assistant_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES compliance_assistant_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  citations JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compliance_assistant_cache (
  cache_key TEXT PRIMARY KEY,
  state_code TEXT NOT NULL,
  normalized_question TEXT NOT NULL,
  answer TEXT NOT NULL,
  citations JSONB,
  source TEXT NOT NULL DEFAULT 'ai',
  expires_at TIMESTAMPTZ NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compliance_assistant_usage_daily (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  requests_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, usage_date)
);

CREATE TABLE IF NOT EXISTS volunteer_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  county TEXT,
  skills TEXT[] NOT NULL DEFAULT '{}',
  availability TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS candidate_volunteer_needs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  county TEXT,
  skills TEXT[] NOT NULL DEFAULT '{}',
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filled', 'closed')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS candidate_volunteer_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  need_id UUID NOT NULL REFERENCES candidate_volunteer_needs(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  volunteer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (need_id, volunteer_id)
);

ALTER TABLE documents ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;
ALTER TABLE documents ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE documents ALTER COLUMN candidate_id DROP NOT NULL;
ALTER TABLE documents ALTER COLUMN campaign_id DROP NOT NULL;
UPDATE documents
SET user_id = COALESCE(user_id, uploaded_by)
WHERE user_id IS NULL AND uploaded_by IS NOT NULL;
UPDATE documents d
SET user_id = c.user_id
FROM candidates c
WHERE d.user_id IS NULL AND d.candidate_id = c.id;
UPDATE documents
SET file_path = 'legacy/unknown-' || id::text
WHERE file_path IS NULL;
ALTER TABLE documents ALTER COLUMN file_path SET NOT NULL;

-- Deadlines
CREATE TABLE IF NOT EXISTS deadlines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  due_date DATE NOT NULL,
  reporting_period_start DATE,
  reporting_period_end DATE,
  status TEXT NOT NULL DEFAULT 'upcoming',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deadline_reminder_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deadline_id UUID NOT NULL REFERENCES deadlines(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  trigger_day INTEGER NOT NULL,
  reminder_type TEXT NOT NULL,
  delivery_date DATE NOT NULL,
  send_status TEXT NOT NULL CHECK (send_status IN ('sent', 'skipped', 'failed')),
  provider_message_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_id UUID REFERENCES candidates(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  overall_score INTEGER NOT NULL DEFAULT 0 CHECK (overall_score >= 0 AND overall_score <= 100),
  readiness_status TEXT NOT NULL DEFAULT 'Early Setup' CHECK (readiness_status IN ('Ready for Filing', 'Nearly Ready', 'In Progress', 'Early Setup')),
  readiness_bar_text TEXT NOT NULL DEFAULT '░░░░░░░░░░',
  category_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'wizard',
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS campaign_setup_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_number INTEGER NOT NULL UNIQUE,
  step_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_id UUID REFERENCES candidates(id) ON DELETE SET NULL,
  current_step INTEGER NOT NULL DEFAULT 1,
  total_steps INTEGER NOT NULL DEFAULT 10,
  completed_steps INTEGER[] NOT NULL DEFAULT '{}',
  last_completed_step INTEGER,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS campaign_health_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_id UUID REFERENCES candidates(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  overall_score INTEGER NOT NULL DEFAULT 0 CHECK (overall_score >= 0 AND overall_score <= 100),
  readiness_status TEXT NOT NULL DEFAULT 'Early Setup' CHECK (readiness_status IN ('Ready for Filing', 'Nearly Ready', 'In Progress', 'Early Setup')),
  readiness_bar_text TEXT NOT NULL DEFAULT '░░░░░░░░░░',
  category_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'wizard',
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS campaign_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_id UUID REFERENCES candidates(id) ON DELETE SET NULL,
  milestone_key TEXT NOT NULL,
  title TEXT NOT NULL,
  due_date DATE,
  category TEXT,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'wizard',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, milestone_key)
);

CREATE TABLE IF NOT EXISTS compliance_jurisdictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('state', 'county', 'city', 'district')),
  state_code TEXT NOT NULL,
  parent_id UUID REFERENCES compliance_jurisdictions(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compliance_offices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_id UUID REFERENCES compliance_jurisdictions(id) ON DELETE CASCADE,
  office_name TEXT NOT NULL,
  office_level TEXT NOT NULL,
  election_cycle TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compliance_rule_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code TEXT NOT NULL,
  jurisdiction_scope TEXT NOT NULL DEFAULT 'state' CHECK (jurisdiction_scope IN ('federal', 'state', 'local')),
  name TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT 'v1',
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (state_code, jurisdiction_scope, name, version)
);

ALTER TABLE compliance_rule_sets
  ADD COLUMN IF NOT EXISTS jurisdiction_id UUID REFERENCES compliance_jurisdictions(id) ON DELETE CASCADE;
ALTER TABLE compliance_rule_sets
  ADD COLUMN IF NOT EXISTS office_id UUID REFERENCES compliance_offices(id) ON DELETE SET NULL;
ALTER TABLE compliance_rule_sets
  ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE compliance_rule_sets
  ADD COLUMN IF NOT EXISTS effective_start DATE;
ALTER TABLE compliance_rule_sets
  ADD COLUMN IF NOT EXISTS effective_end DATE;
ALTER TABLE compliance_rule_sets
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived'));
ALTER TABLE compliance_rule_sets
  ADD COLUMN IF NOT EXISTS source_url TEXT;

UPDATE compliance_rule_sets
SET effective_start = COALESCE(effective_start, effective_from, CURRENT_DATE),
    effective_end = COALESCE(effective_end, effective_to),
    status = COALESCE(status, CASE WHEN is_active THEN 'active' ELSE 'draft' END)
WHERE effective_start IS NULL
   OR status IS NULL;

CREATE TABLE IF NOT EXISTS compliance_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_set_id UUID REFERENCES compliance_rule_sets(id) ON DELETE CASCADE,
  rule_code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (
    category IN (
      'candidate_registration',
      'committee_registration',
      'treasurer',
      'banking',
      'contribution',
      'expense',
      'reporting',
      'document',
      'deadline',
      'disclosure'
    )
  ),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'blocking')),
  condition JSONB NOT NULL,
  message TEXT NOT NULL,
  recommended_action TEXT,
  source_label TEXT,
  source_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rule_set_id, rule_code)
);

CREATE TABLE IF NOT EXISTS compliance_required_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_set_id UUID REFERENCES compliance_rule_sets(id) ON DELETE CASCADE,
  form_name TEXT NOT NULL,
  form_code TEXT,
  description TEXT,
  required_for TEXT[],
  filing_url TEXT,
  due_rule JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compliance_deadline_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_set_id UUID REFERENCES compliance_rule_sets(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  deadline_type TEXT NOT NULL CHECK (
    deadline_type IN ('registration', 'finance_report', 'pre_election', 'post_election', 'annual', 'custom')
  ),
  trigger_event TEXT,
  offset_days INTEGER DEFAULT 0,
  fixed_date DATE,
  recurrence TEXT CHECK (recurrence IN ('none', 'quarterly', 'monthly', 'annual')),
  reminder_days INTEGER[] DEFAULT array[30,14,7,1],
  severity TEXT DEFAULT 'warning',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compliance_contribution_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_set_id UUID REFERENCES compliance_rule_sets(id) ON DELETE CASCADE,
  donor_type TEXT NOT NULL,
  recipient_type TEXT NOT NULL,
  limit_amount NUMERIC(12,2),
  period TEXT NOT NULL CHECK (period IN ('election_cycle', 'calendar_year', 'reporting_period', 'none')),
  cash_limit NUMERIC(12,2),
  anonymous_limit NUMERIC(12,2),
  requires_employer BOOLEAN DEFAULT false,
  requires_address BOOLEAN DEFAULT true,
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compliance_expense_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_set_id UUID REFERENCES compliance_rule_sets(id) ON DELETE CASCADE,
  expense_type TEXT NOT NULL,
  receipt_required_threshold NUMERIC(12,2),
  allowed BOOLEAN DEFAULT true,
  warning_message TEXT,
  blocking_message TEXT,
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compliance_rule_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_set_id UUID NOT NULL REFERENCES compliance_rule_sets(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('filing_requirements', 'reporting_schedule', 'contribution_limits', 'banking_requirements', 'required_forms', 'election_calendar')),
  rule_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'error' CHECK (severity IN ('info', 'warning', 'error')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rule_set_id, category, rule_key)
);

CREATE TABLE IF NOT EXISTS compliance_validation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_id UUID REFERENCES candidates(id) ON DELETE SET NULL,
  state_code TEXT NOT NULL,
  report_type TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL CHECK (status IN ('passed', 'failed')),
  violations JSONB NOT NULL DEFAULT '[]'::jsonb,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE compliance_validation_runs ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE compliance_validation_runs DROP CONSTRAINT IF EXISTS compliance_validation_runs_user_id_fkey;
ALTER TABLE compliance_validation_runs
  ADD CONSTRAINT compliance_validation_runs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE compliance_validation_runs
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE;
ALTER TABLE compliance_validation_runs
  ADD COLUMN IF NOT EXISTS rule_set_id UUID REFERENCES compliance_rule_sets(id) ON DELETE SET NULL;
ALTER TABLE compliance_validation_runs
  ADD COLUMN IF NOT EXISTS validation_type TEXT CHECK (validation_type IN ('wizard', 'donation', 'expense', 'report', 'filing', 'assistant'));
ALTER TABLE compliance_validation_runs
  ADD COLUMN IF NOT EXISTS blocking_count INTEGER DEFAULT 0;
ALTER TABLE compliance_validation_runs
  ADD COLUMN IF NOT EXISTS warning_count INTEGER DEFAULT 0;
ALTER TABLE compliance_validation_runs
  ADD COLUMN IF NOT EXISTS info_count INTEGER DEFAULT 0;

UPDATE compliance_validation_runs
SET validation_type = COALESCE(validation_type, 'filing'),
    status = CASE
      WHEN status IN ('passed', 'failed', 'completed') THEN
        CASE WHEN status = 'passed' THEN 'completed' ELSE status END
      ELSE 'completed'
    END
WHERE validation_type IS NULL OR status IS NULL;

ALTER TABLE compliance_validation_runs DROP CONSTRAINT IF EXISTS compliance_validation_runs_status_check;
ALTER TABLE compliance_validation_runs
  ADD CONSTRAINT compliance_validation_runs_status_check CHECK (status IN ('completed', 'failed', 'passed'));

CREATE TABLE IF NOT EXISTS compliance_validation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES compliance_validation_runs(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES compliance_rules(id) ON DELETE SET NULL,
  severity TEXT NOT NULL,
  passed BOOLEAN NOT NULL,
  message TEXT NOT NULL,
  recommended_action TEXT,
  entity_type TEXT,
  entity_id UUID,
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_compliance_jurisdictions_type_state_name
  ON compliance_jurisdictions(type, state_code, name);

INSERT INTO compliance_jurisdictions (name, type, state_code, is_active)
SELECT DISTINCT state_name, 'state', state_code, true
FROM state_compliance_resources
ON CONFLICT (type, state_code, name) DO UPDATE
SET is_active = true;

INSERT INTO compliance_jurisdictions (name, type, state_code, is_active)
VALUES ('All States', 'state', 'ALL', true)
ON CONFLICT (type, state_code, name) DO UPDATE
SET is_active = true;

INSERT INTO compliance_rule_sets (state_code, jurisdiction_scope, jurisdiction_id, name, version, is_active, status, effective_start)
SELECT
  seeded.state_code,
  'state',
  cj.id,
  seeded.name,
  'v1',
  true,
  'active',
  CURRENT_DATE
FROM (
  VALUES
    ('ALL', 'Default Candidate Compliance Baseline'),
    ('MD', 'Maryland Candidate Compliance Baseline')
) AS seeded(state_code, name)
LEFT JOIN compliance_jurisdictions cj
  ON cj.type = 'state'
  AND cj.state_code = seeded.state_code
ON CONFLICT (state_code, jurisdiction_scope, name, version) DO UPDATE
SET
  is_active = true,
  status = 'active',
  jurisdiction_id = COALESCE(compliance_rule_sets.jurisdiction_id, EXCLUDED.jurisdiction_id),
  effective_start = COALESCE(compliance_rule_sets.effective_start, CURRENT_DATE),
  updated_at = NOW();

UPDATE compliance_rule_sets rs
SET jurisdiction_id = cj.id,
    effective_start = COALESCE(rs.effective_start, CURRENT_DATE),
    status = COALESCE(rs.status, CASE WHEN rs.is_active THEN 'active' ELSE 'draft' END)
FROM compliance_jurisdictions cj
WHERE rs.jurisdiction_id IS NULL
  AND cj.type = 'state'
  AND cj.state_code = rs.state_code;

INSERT INTO compliance_rules (rule_set_id, rule_code, title, description, category, severity, condition, message, recommended_action, source_label, source_url, is_active)
SELECT
  rs.id,
  seeded.rule_code,
  seeded.title,
  seeded.description,
  seeded.category,
  seeded.severity,
  seeded.condition::jsonb,
  seeded.message,
  seeded.recommended_action,
  seeded.source_label,
  seeded.source_url,
  true
FROM compliance_rule_sets rs
JOIN (
  VALUES
    ('Default Candidate Compliance Baseline', 'CHK-001', 'Checklist completion requirement', 'Campaign checklist completion must meet threshold before filing.', 'reporting', 'warning', '{"type":"minimum_count","table":"checklist_items","minimum":1}', 'Checklist completion must meet baseline before filing.', 'Complete required checklist actions.', 'CCSP Baseline', 'https://www.eac.gov/voters/register-and-vote-in-your-state'),
    ('Maryland Candidate Compliance Baseline', 'MD-FORM-001', 'Maryland finance forms guidance', 'Candidates must verify Maryland forms and manuals before filing.', 'document', 'info', '{"type":"required_field","table":"candidates","field":"jurisdiction"}', 'Review Maryland campaign finance forms and manuals before filing.', 'Open the official Maryland forms page and confirm requirements.', 'Maryland SBE', 'https://elections.maryland.gov/campaign_finance/forms_and_manuals.html')
) AS seeded(rule_set_name, rule_code, title, description, category, severity, condition, message, recommended_action, source_label, source_url)
ON seeded.rule_set_name = rs.name
ON CONFLICT (rule_set_id, rule_code) DO UPDATE
SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  severity = EXCLUDED.severity,
  condition = EXCLUDED.condition,
  message = EXCLUDED.message,
  recommended_action = EXCLUDED.recommended_action,
  source_label = EXCLUDED.source_label,
  source_url = EXCLUDED.source_url,
  is_active = true;

DROP VIEW IF EXISTS campaign_active_rule_sets;
CREATE VIEW campaign_active_rule_sets AS
SELECT
  c.id AS campaign_id,
  crs.id AS rule_set_id,
  crs.jurisdiction_id,
  crs.office_id,
  crs.name,
  crs.description,
  crs.version,
  crs.status,
  crs.source_url,
  crs.effective_start,
  crs.effective_end
FROM campaigns c
JOIN compliance_jurisdictions cj
  ON cj.state_code = c.state_code
  AND cj.type = 'state'
JOIN compliance_rule_sets crs
  ON crs.jurisdiction_id = cj.id
WHERE crs.status = 'active'
  AND CURRENT_DATE BETWEEN crs.effective_start AND COALESCE(crs.effective_end, CURRENT_DATE);

INSERT INTO compliance_rule_requirements (rule_set_id, category, rule_key, title, description, severity, config, is_active)
SELECT
  rs.id,
  seeded.category,
  seeded.rule_key,
  seeded.title,
  seeded.description,
  seeded.severity,
  seeded.config::jsonb,
  true
FROM compliance_rule_sets rs
JOIN (
  VALUES
    ('ALL', 'filing_requirements', 'checklist_completion_min_percent', 'Checklist completion threshold', 'Checklist completion should meet minimum threshold before filing.', 'warning', '{"minPercent":80}'),
    ('ALL', 'reporting_schedule', 'upcoming_deadline_required', 'Upcoming reporting deadline required', 'At least one upcoming reporting deadline should be present before filing.', 'error', '{"requireUpcomingDeadline":true}'),
    ('ALL', 'contribution_limits', 'non_negative_finance_totals', 'Finance totals must be non-negative', 'Donations and expenses must not be negative.', 'error', '{"enforceNonNegativeTotals":true}'),
    ('ALL', 'banking_requirements', 'campaign_health_score_min', 'Readiness score threshold', 'Campaign health score should meet the minimum threshold before submission.', 'warning', '{"minScore":75}'),
    ('MD', 'required_forms', 'md_forms_manual_reference', 'Maryland forms and manuals review', 'Maryland campaigns should verify required forms and manuals before submission.', 'info', '{"resourceUrl":"https://elections.maryland.gov/campaign_finance/forms_and_manuals.html"}')
) AS seeded(state_code, category, rule_key, title, description, severity, config)
ON seeded.state_code = rs.state_code
ON CONFLICT (rule_set_id, category, rule_key) DO UPDATE
SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  severity = EXCLUDED.severity,
  config = EXCLUDED.config,
  is_active = true,
  updated_at = NOW();

INSERT INTO campaign_setup_steps (step_number, step_key, title, description, is_required, sort_order)
VALUES
  (1, 'candidate-information', 'Candidate Information', 'Candidate identity, campaign, office, and contact details.', true, 1),
  (2, 'campaign-committee', 'Campaign Committee', 'Committee registration and contact details.', true, 2),
  (3, 'treasurer', 'Treasurer', 'Treasurer assignment path selection.', true, 3),
  (4, 'banking-checklist', 'Banking Checklist', 'Bank account and EIN readiness.', true, 4),
  (5, 'compliance-calendar', 'Compliance Calendar', 'Milestones and filing calendar setup.', true, 5),
  (6, 'fundraising-setup', 'Fundraising Setup', 'Donor intake and processor readiness.', true, 6),
  (7, 'volunteer-recruitment', 'Volunteer Recruitment', 'Volunteer needs and outreach setup.', true, 7),
  (8, 'document-checklist', 'Document Checklist', 'Required campaign document uploads.', true, 8),
  (9, 'campaign-health-score', 'Campaign Health Score', 'Readiness benchmark review.', true, 9),
  (10, 'launch-dashboard', 'Launch Dashboard', 'Final launch confirmation and dashboard handoff.', true, 10)
ON CONFLICT (step_number) DO UPDATE
SET
  step_key = EXCLUDED.step_key,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  is_required = EXCLUDED.is_required,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_deadline_reminder_deliveries_unique
  ON deadline_reminder_deliveries(deadline_id, recipient_email, trigger_day, delivery_date, send_status);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_candidates_user_id ON candidates(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_campaigns_candidate_id ON campaigns(candidate_id);
CREATE INDEX IF NOT EXISTS idx_treasurers_verified ON treasurers(is_verified, full_name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_treasurers_user_id_unique ON treasurers(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_treasurer_requests_candidate_id ON treasurer_requests(candidate_id);
CREATE INDEX IF NOT EXISTS idx_treasurer_requests_treasurer_id_status ON treasurer_requests(treasurer_id, status);
CREATE INDEX IF NOT EXISTS idx_checklist_items_candidate_id ON checklist_items(candidate_id);
CREATE INDEX IF NOT EXISTS idx_donations_candidate_id ON donations(candidate_id);
CREATE INDEX IF NOT EXISTS idx_expenses_candidate_id ON expenses(candidate_id);
CREATE INDEX IF NOT EXISTS idx_reports_candidate_id ON reports(candidate_id);
CREATE INDEX IF NOT EXISTS idx_documents_candidate_id ON documents(candidate_id);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_campaign_id ON documents(campaign_id);
CREATE INDEX IF NOT EXISTS idx_donation_document_links_donation_id ON donation_document_links(donation_id);
CREATE INDEX IF NOT EXISTS idx_donation_document_links_document_id ON donation_document_links(document_id);
CREATE INDEX IF NOT EXISTS idx_state_compliance_resources_state_code ON state_compliance_resources(state_code);
CREATE INDEX IF NOT EXISTS idx_state_compliance_resources_active ON state_compliance_resources(is_active);
CREATE INDEX IF NOT EXISTS idx_ca_conversations_user_id ON compliance_assistant_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ca_conversations_updated_at ON compliance_assistant_conversations(updated_at);
CREATE INDEX IF NOT EXISTS idx_ca_messages_conversation_id ON compliance_assistant_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ca_messages_user_id ON compliance_assistant_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_ca_cache_state_code ON compliance_assistant_cache(state_code);
CREATE INDEX IF NOT EXISTS idx_ca_cache_expires_at ON compliance_assistant_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_ca_usage_daily_usage_date ON compliance_assistant_usage_daily(usage_date);
CREATE INDEX IF NOT EXISTS idx_volunteer_profiles_county ON volunteer_profiles(county);
CREATE INDEX IF NOT EXISTS idx_volunteer_profiles_skills ON volunteer_profiles USING GIN (skills);
CREATE INDEX IF NOT EXISTS idx_candidate_volunteer_needs_candidate_id ON candidate_volunteer_needs(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_volunteer_needs_status ON candidate_volunteer_needs(status);
CREATE INDEX IF NOT EXISTS idx_candidate_volunteer_needs_skills ON candidate_volunteer_needs USING GIN (skills);
CREATE INDEX IF NOT EXISTS idx_candidate_volunteer_applications_need_id ON candidate_volunteer_applications(need_id);
CREATE INDEX IF NOT EXISTS idx_candidate_volunteer_applications_candidate_id_status ON candidate_volunteer_applications(candidate_id, status);
CREATE INDEX IF NOT EXISTS idx_candidate_volunteer_applications_volunteer_id ON candidate_volunteer_applications(volunteer_id);
CREATE INDEX IF NOT EXISTS idx_deadline_reminder_deliveries_deadline_id ON deadline_reminder_deliveries(deadline_id);
CREATE INDEX IF NOT EXISTS idx_deadline_reminder_deliveries_delivery_date ON deadline_reminder_deliveries(delivery_date);
CREATE INDEX IF NOT EXISTS idx_deadlines_candidate_id ON deadlines(candidate_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_due_date ON deadlines(due_date);
CREATE INDEX IF NOT EXISTS idx_campaign_health_candidate_id ON campaign_health(candidate_id);
CREATE INDEX IF NOT EXISTS idx_campaign_progress_candidate_id ON campaign_progress(candidate_id);
CREATE INDEX IF NOT EXISTS idx_campaign_health_scores_candidate_id ON campaign_health_scores(candidate_id);
CREATE INDEX IF NOT EXISTS idx_campaign_milestones_candidate_id ON campaign_milestones(candidate_id);
CREATE INDEX IF NOT EXISTS idx_campaign_milestones_due_date ON campaign_milestones(due_date);
CREATE INDEX IF NOT EXISTS idx_compliance_jurisdictions_state_code_type ON compliance_jurisdictions(state_code, type);
CREATE INDEX IF NOT EXISTS idx_compliance_offices_jurisdiction_id ON compliance_offices(jurisdiction_id);
CREATE INDEX IF NOT EXISTS idx_compliance_rule_sets_state_code_active ON compliance_rule_sets(state_code, is_active);
CREATE INDEX IF NOT EXISTS idx_compliance_rule_sets_jurisdiction_status_dates ON compliance_rule_sets(jurisdiction_id, status, effective_start, effective_end);
CREATE INDEX IF NOT EXISTS idx_compliance_rule_requirements_rule_set_id ON compliance_rule_requirements(rule_set_id);
CREATE INDEX IF NOT EXISTS idx_compliance_rules_rule_set_active ON compliance_rules(rule_set_id, is_active);
CREATE INDEX IF NOT EXISTS idx_compliance_required_forms_rule_set_id ON compliance_required_forms(rule_set_id);
CREATE INDEX IF NOT EXISTS idx_compliance_deadline_rules_rule_set_id ON compliance_deadline_rules(rule_set_id);
CREATE INDEX IF NOT EXISTS idx_compliance_contribution_limits_rule_set_id ON compliance_contribution_limits(rule_set_id);
CREATE INDEX IF NOT EXISTS idx_compliance_expense_rules_rule_set_id ON compliance_expense_rules(rule_set_id);
CREATE INDEX IF NOT EXISTS idx_compliance_validation_runs_user_id_created_at ON compliance_validation_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_validation_runs_campaign_id_created_at ON compliance_validation_runs(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_validation_results_run_id ON compliance_validation_results(run_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_campaign_id_created_at ON audit_events(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor_user_id_created_at ON audit_events(actor_user_id, created_at DESC);

-- Enable RLS (Row Level Security) on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE treasurers ENABLE ROW LEVEL SECURITY;
ALTER TABLE treasurer_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE treasurer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE donation_document_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE state_compliance_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_assistant_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_assistant_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_assistant_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_assistant_usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE volunteer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_volunteer_needs ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_volunteer_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE deadline_reminder_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE deadlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_setup_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_health_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_jurisdictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_rule_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_rule_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_required_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_deadline_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_contribution_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_expense_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_validation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_validation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

-- Re-runnable policy setup
DROP POLICY IF EXISTS "Users can see own profile" ON users;
DROP POLICY IF EXISTS "Users can insert own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Profiles can see own profile" ON profiles;
DROP POLICY IF EXISTS "Profiles can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Profiles can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;
DROP POLICY IF EXISTS "Candidates can see own candidate profile" ON candidates;
DROP POLICY IF EXISTS "Candidates can insert own candidate profile" ON candidates;
DROP POLICY IF EXISTS "Candidates can update own candidate profile" ON candidates;
DROP POLICY IF EXISTS "Treasurers can view linked candidate profiles" ON candidates;
DROP POLICY IF EXISTS "Admins can view all candidate profiles" ON candidates;
DROP POLICY IF EXISTS "Public can view published candidate profiles" ON candidates;
DROP POLICY IF EXISTS "Candidates can see own checklists" ON checklist_items;
DROP POLICY IF EXISTS "Candidates can insert own checklists" ON checklist_items;
DROP POLICY IF EXISTS "Candidates can update own checklists" ON checklist_items;
DROP POLICY IF EXISTS "Candidates can see own campaigns" ON campaigns;
DROP POLICY IF EXISTS "Candidates can insert own campaigns" ON campaigns;
DROP POLICY IF EXISTS "Candidates can update own campaigns" ON campaigns;
DROP POLICY IF EXISTS "Admins can view all campaigns" ON campaigns;
DROP POLICY IF EXISTS "Candidates can see own donations" ON donations;
DROP POLICY IF EXISTS "Candidates can insert own donations" ON donations;
DROP POLICY IF EXISTS "Candidates can see own expenses" ON expenses;
DROP POLICY IF EXISTS "Candidates can insert own expenses" ON expenses;
DROP POLICY IF EXISTS "Candidates can see own deadlines" ON deadlines;
DROP POLICY IF EXISTS "Candidates can insert own deadlines" ON deadlines;
DROP POLICY IF EXISTS "Admins can view all deadlines" ON deadlines;
DROP POLICY IF EXISTS "Admins can insert deadlines" ON deadlines;
DROP POLICY IF EXISTS "Admins can update deadlines" ON deadlines;
DROP POLICY IF EXISTS "Admins can delete deadlines" ON deadlines;
DROP POLICY IF EXISTS "Users can see own documents" ON documents;
DROP POLICY IF EXISTS "Users can insert own documents" ON documents;
DROP POLICY IF EXISTS "Users can update own documents" ON documents;
DROP POLICY IF EXISTS "Users can delete own documents" ON documents;
DROP POLICY IF EXISTS "Admins can view all documents" ON documents;
DROP POLICY IF EXISTS "Admins can update documents" ON documents;
DROP POLICY IF EXISTS "Admins can delete documents" ON documents;
DROP POLICY IF EXISTS "Users can read own donation document links" ON donation_document_links;
DROP POLICY IF EXISTS "Users can create own donation document links" ON donation_document_links;
DROP POLICY IF EXISTS "Users can delete own donation document links" ON donation_document_links;
DROP POLICY IF EXISTS "Admins can read all donation document links" ON donation_document_links;
DROP POLICY IF EXISTS "Authenticated users can read active state compliance resources" ON state_compliance_resources;
DROP POLICY IF EXISTS "Admins can manage state compliance resources" ON state_compliance_resources;
DROP POLICY IF EXISTS "Users can read own compliance conversations" ON compliance_assistant_conversations;
DROP POLICY IF EXISTS "Users can create own compliance conversations" ON compliance_assistant_conversations;
DROP POLICY IF EXISTS "Users can update own compliance conversations" ON compliance_assistant_conversations;
DROP POLICY IF EXISTS "Admins can read all compliance conversations" ON compliance_assistant_conversations;
DROP POLICY IF EXISTS "Users can read own compliance messages" ON compliance_assistant_messages;
DROP POLICY IF EXISTS "Users can create own compliance messages" ON compliance_assistant_messages;
DROP POLICY IF EXISTS "Admins can read all compliance messages" ON compliance_assistant_messages;
DROP POLICY IF EXISTS "Admins can manage compliance cache" ON compliance_assistant_cache;
DROP POLICY IF EXISTS "Users can read own daily usage" ON compliance_assistant_usage_daily;
DROP POLICY IF EXISTS "Admins can read all daily usage" ON compliance_assistant_usage_daily;
DROP POLICY IF EXISTS "Authenticated users can read volunteer profiles" ON volunteer_profiles;
DROP POLICY IF EXISTS "Users can create own volunteer profile" ON volunteer_profiles;
DROP POLICY IF EXISTS "Users can update own volunteer profile" ON volunteer_profiles;
DROP POLICY IF EXISTS "Admins can manage volunteer profiles" ON volunteer_profiles;
DROP POLICY IF EXISTS "Authenticated users can read volunteer needs" ON candidate_volunteer_needs;
DROP POLICY IF EXISTS "Candidates can create own volunteer needs" ON candidate_volunteer_needs;
DROP POLICY IF EXISTS "Candidates can update own volunteer needs" ON candidate_volunteer_needs;
DROP POLICY IF EXISTS "Admins can manage volunteer needs" ON candidate_volunteer_needs;
DROP POLICY IF EXISTS "Users can read related volunteer applications" ON candidate_volunteer_applications;
DROP POLICY IF EXISTS "Volunteers can apply to open needs" ON candidate_volunteer_applications;
DROP POLICY IF EXISTS "Volunteers can update own applications" ON candidate_volunteer_applications;
DROP POLICY IF EXISTS "Candidates can update applications on own needs" ON candidate_volunteer_applications;
DROP POLICY IF EXISTS "Admins can manage volunteer applications" ON candidate_volunteer_applications;
DROP POLICY IF EXISTS "Admins can read all deadline reminder deliveries" ON deadline_reminder_deliveries;
DROP POLICY IF EXISTS "Authenticated users can view treasurers" ON treasurers;
DROP POLICY IF EXISTS "Authenticated users can create treasurers" ON treasurers;
DROP POLICY IF EXISTS "Admins can update treasurers" ON treasurers;
DROP POLICY IF EXISTS "Treasurers can update own treasurer profile" ON treasurers;
DROP POLICY IF EXISTS "Candidates can see own treasurer assignments" ON treasurer_assignments;
DROP POLICY IF EXISTS "Candidates can insert own treasurer assignments" ON treasurer_assignments;
DROP POLICY IF EXISTS "Candidates can update own treasurer assignments" ON treasurer_assignments;
DROP POLICY IF EXISTS "Candidates can create treasurer requests" ON treasurer_requests;
DROP POLICY IF EXISTS "Candidates can view own treasurer requests" ON treasurer_requests;
DROP POLICY IF EXISTS "Candidates can cancel own treasurer requests" ON treasurer_requests;
DROP POLICY IF EXISTS "Treasurers can view assigned requests" ON treasurer_requests;
DROP POLICY IF EXISTS "Treasurers can respond to requests" ON treasurer_requests;
DROP POLICY IF EXISTS "Admins can view all treasurer requests" ON treasurer_requests;
DROP POLICY IF EXISTS "Users can read own campaign health" ON campaign_health;
DROP POLICY IF EXISTS "Users can insert own campaign health" ON campaign_health;
DROP POLICY IF EXISTS "Users can update own campaign health" ON campaign_health;
DROP POLICY IF EXISTS "Admins can read all campaign health" ON campaign_health;
DROP POLICY IF EXISTS "Authenticated users can read campaign setup steps" ON campaign_setup_steps;
DROP POLICY IF EXISTS "Admins can manage campaign setup steps" ON campaign_setup_steps;
DROP POLICY IF EXISTS "Users can read own campaign progress" ON campaign_progress;
DROP POLICY IF EXISTS "Users can insert own campaign progress" ON campaign_progress;
DROP POLICY IF EXISTS "Users can update own campaign progress" ON campaign_progress;
DROP POLICY IF EXISTS "Admins can read all campaign progress" ON campaign_progress;
DROP POLICY IF EXISTS "Users can read own campaign health scores" ON campaign_health_scores;
DROP POLICY IF EXISTS "Users can insert own campaign health scores" ON campaign_health_scores;
DROP POLICY IF EXISTS "Users can update own campaign health scores" ON campaign_health_scores;
DROP POLICY IF EXISTS "Admins can read all campaign health scores" ON campaign_health_scores;
DROP POLICY IF EXISTS "Users can read own campaign milestones" ON campaign_milestones;
DROP POLICY IF EXISTS "Users can insert own campaign milestones" ON campaign_milestones;
DROP POLICY IF EXISTS "Users can update own campaign milestones" ON campaign_milestones;
DROP POLICY IF EXISTS "Admins can read all campaign milestones" ON campaign_milestones;
DROP POLICY IF EXISTS "Authenticated users can read active compliance jurisdictions" ON compliance_jurisdictions;
DROP POLICY IF EXISTS "Authenticated users can read active compliance offices" ON compliance_offices;
DROP POLICY IF EXISTS "Authenticated users can read active compliance rule sets" ON compliance_rule_sets;
DROP POLICY IF EXISTS "Authenticated users can read active compliance rule requirements" ON compliance_rule_requirements;
DROP POLICY IF EXISTS "Authenticated users can read active compliance rules" ON compliance_rules;
DROP POLICY IF EXISTS "Authenticated users can read active compliance required forms" ON compliance_required_forms;
DROP POLICY IF EXISTS "Authenticated users can read compliance deadline rules" ON compliance_deadline_rules;
DROP POLICY IF EXISTS "Authenticated users can read compliance contribution limits" ON compliance_contribution_limits;
DROP POLICY IF EXISTS "Authenticated users can read compliance expense rules" ON compliance_expense_rules;
DROP POLICY IF EXISTS "Users can read own compliance validation results" ON compliance_validation_results;
DROP POLICY IF EXISTS "Users can insert own compliance validation results" ON compliance_validation_results;
DROP POLICY IF EXISTS "Admins can manage compliance rule sets" ON compliance_rule_sets;
DROP POLICY IF EXISTS "Admins can manage compliance rule requirements" ON compliance_rule_requirements;
DROP POLICY IF EXISTS "Admins can manage compliance jurisdictions" ON compliance_jurisdictions;
DROP POLICY IF EXISTS "Admins can manage compliance offices" ON compliance_offices;
DROP POLICY IF EXISTS "Admins can manage compliance rules" ON compliance_rules;
DROP POLICY IF EXISTS "Admins can manage compliance required forms" ON compliance_required_forms;
DROP POLICY IF EXISTS "Admins can manage compliance deadline rules" ON compliance_deadline_rules;
DROP POLICY IF EXISTS "Admins can manage compliance contribution limits" ON compliance_contribution_limits;
DROP POLICY IF EXISTS "Admins can manage compliance expense rules" ON compliance_expense_rules;
DROP POLICY IF EXISTS "Users can read own compliance validation runs" ON compliance_validation_runs;
DROP POLICY IF EXISTS "Users can insert own compliance validation runs" ON compliance_validation_runs;
DROP POLICY IF EXISTS "Admins can read all compliance validation runs" ON compliance_validation_runs;
DROP POLICY IF EXISTS "Admins can read all compliance validation results" ON compliance_validation_results;
DROP POLICY IF EXISTS "Users can read own audit events" ON audit_events;
DROP POLICY IF EXISTS "Users can insert own audit events" ON audit_events;
DROP POLICY IF EXISTS "Admins can read all audit events" ON audit_events;
DROP POLICY IF EXISTS "Users can read own storage objects" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own storage objects" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own storage objects" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own storage objects" ON storage.objects;
DROP POLICY IF EXISTS "Admins can read all storage objects" ON storage.objects;

DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view own audit logs" ON public.audit_logs';
    EXECUTE 'DROP POLICY IF EXISTS "Admins can manage audit logs" ON public.audit_logs';
  END IF;
END
$$;

-- Break policy recursion by resolving treasurer-candidate linkage in a SECURITY DEFINER helper.
DROP FUNCTION IF EXISTS public.is_linked_treasurer_for_candidate(UUID, UUID);
DROP FUNCTION IF EXISTS public.is_admin(UUID);
DROP TRIGGER IF EXISTS trg_prevent_delete_compliance_rules ON compliance_rules;
DROP TRIGGER IF EXISTS trg_prevent_delete_compliance_rule_sets ON compliance_rule_sets;
DROP FUNCTION IF EXISTS public.prevent_compliance_history_deletes();

CREATE FUNCTION public.is_admin(requester_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.id = requester_id
      AND p.role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;

CREATE FUNCTION public.is_linked_treasurer_for_candidate(candidate_row_id UUID, requester_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM treasurers t
    WHERE t.user_id = requester_id
      AND (
        EXISTS (
          SELECT 1
          FROM treasurer_requests tr
          WHERE tr.candidate_id = candidate_row_id
            AND tr.treasurer_id = t.id
            AND tr.status IN ('pending', 'accepted')
        )
        OR EXISTS (
          SELECT 1
          FROM treasurer_assignments ta
          WHERE ta.candidate_id = candidate_row_id
            AND ta.treasurer_id = t.id
            AND ta.is_active = true
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_linked_treasurer_for_candidate(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_linked_treasurer_for_candidate(UUID, UUID) TO authenticated;

CREATE FUNCTION public.prevent_compliance_history_deletes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'compliance_rules' THEN
    IF EXISTS (
      SELECT 1
      FROM compliance_validation_results vr
      WHERE vr.rule_id = OLD.id
    ) THEN
      RAISE EXCEPTION 'Cannot delete compliance rule %. It has validation history. Deactivate it instead.', OLD.id;
    END IF;
  ELSIF TG_TABLE_NAME = 'compliance_rule_sets' THEN
    IF EXISTS (
      SELECT 1
      FROM compliance_validation_runs run
      WHERE run.rule_set_id = OLD.id
    ) OR EXISTS (
      SELECT 1
      FROM compliance_rules r
      JOIN compliance_validation_results vr ON vr.rule_id = r.id
      WHERE r.rule_set_id = OLD.id
    ) THEN
      RAISE EXCEPTION 'Cannot delete compliance rule set %. It has validation history. Archive it instead.', OLD.id;
    END IF;
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_compliance_history_deletes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prevent_compliance_history_deletes() TO authenticated;

CREATE TRIGGER trg_prevent_delete_compliance_rules
  BEFORE DELETE ON compliance_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_compliance_history_deletes();

CREATE TRIGGER trg_prevent_delete_compliance_rule_sets
  BEFORE DELETE ON compliance_rule_sets
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_compliance_history_deletes();

-- RLS Policy: users can only manage their own profile row.
CREATE POLICY "Users can see own profile" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all users" ON users
  FOR SELECT USING (
    public.is_admin(auth.uid())
  );

-- RLS Policy: users can only manage their own role profile row.
CREATE POLICY "Profiles can see own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Profiles can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Profiles can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON profiles
  FOR SELECT USING (
    public.is_admin(auth.uid())
  );

CREATE POLICY "Admins can update profiles" ON profiles
  FOR UPDATE USING (
    public.is_admin(auth.uid())
  )
  WITH CHECK (
    public.is_admin(auth.uid())
  );

-- RLS Policy: candidates can only manage their own candidate profile row.
CREATE POLICY "Candidates can see own candidate profile" ON candidates
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Candidates can insert own candidate profile" ON candidates
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Candidates can update own candidate profile" ON candidates
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Treasurers can view linked candidate profiles" ON candidates
  FOR SELECT USING (
    public.is_linked_treasurer_for_candidate(candidates.id, auth.uid())
  );

CREATE POLICY "Admins can view all candidate profiles" ON candidates
  FOR SELECT USING (
    public.is_admin(auth.uid())
  );

CREATE POLICY "Public can view published candidate profiles" ON candidates
  FOR SELECT USING (is_public_profile = true);

CREATE POLICY "Candidates can see own campaigns" ON campaigns
  FOR SELECT USING (
    candidate_id IN (
      SELECT id FROM candidates WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Candidates can insert own campaigns" ON campaigns
  FOR INSERT WITH CHECK (
    candidate_id IN (
      SELECT id FROM candidates WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Candidates can update own campaigns" ON campaigns
  FOR UPDATE USING (
    candidate_id IN (
      SELECT id FROM candidates WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    candidate_id IN (
      SELECT id FROM candidates WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all campaigns" ON campaigns
  FOR SELECT USING (
    public.is_admin(auth.uid())
  );

-- RLS Policy: candidates can only read related campaign data.
CREATE POLICY "Candidates can see own checklists" ON checklist_items
  FOR SELECT USING (
    candidate_id IN (
      SELECT id FROM candidates WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Candidates can insert own checklists" ON checklist_items
  FOR INSERT WITH CHECK (
    candidate_id IN (
      SELECT id FROM candidates WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Candidates can update own checklists" ON checklist_items
  FOR UPDATE USING (
    candidate_id IN (
      SELECT id FROM candidates WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Candidates can see own donations" ON donations
  FOR SELECT USING (
    candidate_id IN (
      SELECT id FROM candidates WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Candidates can insert own donations" ON donations
  FOR INSERT WITH CHECK (
    candidate_id IN (
      SELECT id FROM candidates WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Candidates can see own expenses" ON expenses
  FOR SELECT USING (
    candidate_id IN (
      SELECT id FROM candidates WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Candidates can insert own expenses" ON expenses
  FOR INSERT WITH CHECK (
    candidate_id IN (
      SELECT id FROM candidates WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Candidates can see own deadlines" ON deadlines
  FOR SELECT USING (
    candidate_id IN (
      SELECT id FROM candidates WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Candidates can insert own deadlines" ON deadlines
  FOR INSERT WITH CHECK (
    candidate_id IN (
      SELECT id FROM candidates WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all deadlines" ON deadlines
  FOR SELECT USING (
    public.is_admin(auth.uid())
  );

CREATE POLICY "Admins can insert deadlines" ON deadlines
  FOR INSERT WITH CHECK (
    public.is_admin(auth.uid())
  );

CREATE POLICY "Admins can update deadlines" ON deadlines
  FOR UPDATE USING (
    public.is_admin(auth.uid())
  )
  WITH CHECK (
    public.is_admin(auth.uid())
  );

CREATE POLICY "Admins can delete deadlines" ON deadlines
  FOR DELETE USING (
    public.is_admin(auth.uid())
  );

CREATE POLICY "Users can see own documents" ON documents
  FOR SELECT USING (
    user_id = auth.uid()
  );

CREATE POLICY "Users can insert own documents" ON documents
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
  );

CREATE POLICY "Users can update own documents" ON documents
  FOR UPDATE USING (
    user_id = auth.uid()
  )
  WITH CHECK (
    user_id = auth.uid()
  );

CREATE POLICY "Users can delete own documents" ON documents
  FOR DELETE USING (
    user_id = auth.uid()
  );

CREATE POLICY "Admins can view all documents" ON documents
  FOR SELECT USING (
    public.is_admin(auth.uid())
  );

CREATE POLICY "Admins can update documents" ON documents
  FOR UPDATE USING (
    public.is_admin(auth.uid())
  )
  WITH CHECK (
    public.is_admin(auth.uid())
  );

CREATE POLICY "Admins can delete documents" ON documents
  FOR DELETE USING (
    public.is_admin(auth.uid())
  );

CREATE POLICY "Users can read own donation document links" ON donation_document_links
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM donations d
      JOIN candidates c ON c.id = d.candidate_id
      WHERE d.id = donation_document_links.donation_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create own donation document links" ON donation_document_links
  FOR INSERT WITH CHECK (
    linked_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM donations d
      JOIN candidates c ON c.id = d.candidate_id
      WHERE d.id = donation_document_links.donation_id
        AND c.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM documents doc
      WHERE doc.id = donation_document_links.document_id
        AND doc.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own donation document links" ON donation_document_links
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM donations d
      JOIN candidates c ON c.id = d.candidate_id
      WHERE d.id = donation_document_links.donation_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can read all donation document links" ON donation_document_links
  FOR SELECT USING (
    public.is_admin(auth.uid())
  );

CREATE POLICY "Authenticated users can read active state compliance resources" ON state_compliance_resources
  FOR SELECT TO authenticated USING (is_active = true OR public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage state compliance resources" ON state_compliance_resources
  FOR ALL USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Users can read own compliance conversations" ON compliance_assistant_conversations
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create own compliance conversations" ON compliance_assistant_conversations
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own compliance conversations" ON compliance_assistant_conversations
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can read all compliance conversations" ON compliance_assistant_conversations
  FOR SELECT USING (public.is_admin(auth.uid()));

CREATE POLICY "Users can read own compliance messages" ON compliance_assistant_messages
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create own compliance messages" ON compliance_assistant_messages
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM compliance_assistant_conversations c
      WHERE c.id = compliance_assistant_messages.conversation_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can read all compliance messages" ON compliance_assistant_messages
  FOR SELECT USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage compliance cache" ON compliance_assistant_cache
  FOR ALL USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Users can read own daily usage" ON compliance_assistant_usage_daily
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can read all daily usage" ON compliance_assistant_usage_daily
  FOR SELECT USING (public.is_admin(auth.uid()));

CREATE POLICY "Authenticated users can read volunteer profiles" ON volunteer_profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can create own volunteer profile" ON volunteer_profiles
  FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "Users can update own volunteer profile" ON volunteer_profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Admins can manage volunteer profiles" ON volunteer_profiles
  FOR ALL USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Authenticated users can read volunteer needs" ON candidate_volunteer_needs
  FOR SELECT TO authenticated USING (
    status = 'open'
    OR candidate_id IN (SELECT id FROM candidates WHERE user_id = auth.uid())
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "Candidates can create own volunteer needs" ON candidate_volunteer_needs
  FOR INSERT WITH CHECK (
    candidate_id IN (SELECT id FROM candidates WHERE user_id = auth.uid())
  );

CREATE POLICY "Candidates can update own volunteer needs" ON candidate_volunteer_needs
  FOR UPDATE USING (
    candidate_id IN (SELECT id FROM candidates WHERE user_id = auth.uid())
  )
  WITH CHECK (
    candidate_id IN (SELECT id FROM candidates WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins can manage volunteer needs" ON candidate_volunteer_needs
  FOR ALL USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Users can read related volunteer applications" ON candidate_volunteer_applications
  FOR SELECT TO authenticated USING (
    volunteer_id = auth.uid()
    OR candidate_id IN (SELECT id FROM candidates WHERE user_id = auth.uid())
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "Volunteers can apply to open needs" ON candidate_volunteer_applications
  FOR INSERT WITH CHECK (
    volunteer_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM candidate_volunteer_needs n
      WHERE n.id = need_id
        AND n.candidate_id = candidate_volunteer_applications.candidate_id
        AND n.status = 'open'
    )
  );

CREATE POLICY "Volunteers can update own applications" ON candidate_volunteer_applications
  FOR UPDATE USING (
    volunteer_id = auth.uid()
  )
  WITH CHECK (
    volunteer_id = auth.uid()
  );

CREATE POLICY "Candidates can update applications on own needs" ON candidate_volunteer_applications
  FOR UPDATE USING (
    candidate_id IN (SELECT id FROM candidates WHERE user_id = auth.uid())
  )
  WITH CHECK (
    candidate_id IN (SELECT id FROM candidates WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins can manage volunteer applications" ON candidate_volunteer_applications
  FOR ALL USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can read all deadline reminder deliveries" ON deadline_reminder_deliveries
  FOR SELECT USING (public.is_admin(auth.uid()));

CREATE POLICY "Authenticated users can view treasurers" ON treasurers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create treasurers" ON treasurers
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admins can update treasurers" ON treasurers
  FOR UPDATE USING (
    public.is_admin(auth.uid())
  )
  WITH CHECK (
    public.is_admin(auth.uid())
  );

CREATE POLICY "Treasurers can update own treasurer profile" ON treasurers
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Candidates can see own treasurer assignments" ON treasurer_assignments
  FOR SELECT USING (
    candidate_id IN (
      SELECT id FROM candidates WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Candidates can insert own treasurer assignments" ON treasurer_assignments
  FOR INSERT WITH CHECK (
    candidate_id IN (
      SELECT id FROM candidates WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Candidates can update own treasurer assignments" ON treasurer_assignments
  FOR UPDATE USING (
    candidate_id IN (
      SELECT id FROM candidates WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Candidates can create treasurer requests" ON treasurer_requests
  FOR INSERT WITH CHECK (
    requested_by_user_id = auth.uid()
    AND candidate_id IN (SELECT id FROM candidates WHERE user_id = auth.uid())
  );

CREATE POLICY "Candidates can view own treasurer requests" ON treasurer_requests
  FOR SELECT USING (
    candidate_id IN (SELECT id FROM candidates WHERE user_id = auth.uid())
  );

CREATE POLICY "Candidates can cancel own treasurer requests" ON treasurer_requests
  FOR UPDATE USING (
    candidate_id IN (SELECT id FROM candidates WHERE user_id = auth.uid())
  )
  WITH CHECK (
    candidate_id IN (SELECT id FROM candidates WHERE user_id = auth.uid())
  );

CREATE POLICY "Treasurers can view assigned requests" ON treasurer_requests
  FOR SELECT USING (
    treasurer_id IN (SELECT id FROM treasurers WHERE user_id = auth.uid())
  );

CREATE POLICY "Treasurers can respond to requests" ON treasurer_requests
  FOR UPDATE USING (
    treasurer_id IN (SELECT id FROM treasurers WHERE user_id = auth.uid())
  )
  WITH CHECK (
    treasurer_id IN (SELECT id FROM treasurers WHERE user_id = auth.uid())
  );

CREATE POLICY "Admins can view all treasurer requests" ON treasurer_requests
  FOR SELECT USING (
    public.is_admin(auth.uid())
  );

CREATE POLICY "Users can read own campaign health" ON campaign_health
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own campaign health" ON campaign_health
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own campaign health" ON campaign_health
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can read all campaign health" ON campaign_health
  FOR SELECT USING (public.is_admin(auth.uid()));

CREATE POLICY "Authenticated users can read campaign setup steps" ON campaign_setup_steps
  FOR SELECT TO authenticated USING (is_active = true OR public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage campaign setup steps" ON campaign_setup_steps
  FOR ALL USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Users can read own campaign progress" ON campaign_progress
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own campaign progress" ON campaign_progress
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own campaign progress" ON campaign_progress
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can read all campaign progress" ON campaign_progress
  FOR SELECT USING (public.is_admin(auth.uid()));

CREATE POLICY "Users can read own campaign health scores" ON campaign_health_scores
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own campaign health scores" ON campaign_health_scores
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own campaign health scores" ON campaign_health_scores
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can read all campaign health scores" ON campaign_health_scores
  FOR SELECT USING (public.is_admin(auth.uid()));

CREATE POLICY "Users can read own campaign milestones" ON campaign_milestones
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own campaign milestones" ON campaign_milestones
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own campaign milestones" ON campaign_milestones
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can read all campaign milestones" ON campaign_milestones
  FOR SELECT USING (public.is_admin(auth.uid()));

CREATE POLICY "Authenticated users can read active compliance jurisdictions" ON compliance_jurisdictions
  FOR SELECT TO authenticated USING (is_active = true OR public.is_admin(auth.uid()));

CREATE POLICY "Authenticated users can read active compliance offices" ON compliance_offices
  FOR SELECT TO authenticated USING (is_active = true OR public.is_admin(auth.uid()));

CREATE POLICY "Authenticated users can read active compliance rule sets" ON compliance_rule_sets
  FOR SELECT TO authenticated USING (is_active = true OR public.is_admin(auth.uid()));

CREATE POLICY "Authenticated users can read active compliance rule requirements" ON compliance_rule_requirements
  FOR SELECT TO authenticated USING (
    is_active = true
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "Authenticated users can read active compliance rules" ON compliance_rules
  FOR SELECT TO authenticated USING (
    is_active = true
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "Authenticated users can read active compliance required forms" ON compliance_required_forms
  FOR SELECT TO authenticated USING (
    is_active = true
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "Authenticated users can read compliance deadline rules" ON compliance_deadline_rules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read compliance contribution limits" ON compliance_contribution_limits
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can read compliance expense rules" ON compliance_expense_rules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can read own compliance validation results" ON compliance_validation_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM compliance_validation_runs run
      WHERE run.id = compliance_validation_results.run_id
        AND run.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own compliance validation results" ON compliance_validation_results
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM compliance_validation_runs run
      WHERE run.id = compliance_validation_results.run_id
        AND run.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can read own audit events" ON audit_events
  FOR SELECT USING (actor_user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "Users can insert own audit events" ON audit_events
  FOR INSERT WITH CHECK (actor_user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage compliance rule sets" ON compliance_rule_sets
  FOR ALL USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage compliance rule requirements" ON compliance_rule_requirements
  FOR ALL USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage compliance jurisdictions" ON compliance_jurisdictions
  FOR ALL USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage compliance offices" ON compliance_offices
  FOR ALL USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage compliance rules" ON compliance_rules
  FOR ALL USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage compliance required forms" ON compliance_required_forms
  FOR ALL USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage compliance deadline rules" ON compliance_deadline_rules
  FOR ALL USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage compliance contribution limits" ON compliance_contribution_limits
  FOR ALL USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage compliance expense rules" ON compliance_expense_rules
  FOR ALL USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Users can read own compliance validation runs" ON compliance_validation_runs
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own compliance validation runs" ON compliance_validation_runs
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can read all compliance validation runs" ON compliance_validation_runs
  FOR SELECT USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can read all compliance validation results" ON compliance_validation_results
  FOR SELECT USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can read all audit events" ON audit_events
  FOR SELECT USING (public.is_admin(auth.uid()));

-- Supabase storage buckets for document workflows
INSERT INTO storage.buckets (id, name, public)
VALUES ('candidate-documents', 'candidate-documents', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('campaign-receipts', 'campaign-receipts', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('finance-reports', 'finance-reports', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can read own storage objects" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id IN ('candidate-documents', 'campaign-receipts', 'finance-reports')
    AND (
      split_part(name, '/', 1) = auth.uid()::text
      OR public.is_admin(auth.uid())
    )
  );

CREATE POLICY "Users can upload own storage objects" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id IN ('candidate-documents', 'campaign-receipts', 'finance-reports')
    AND split_part(name, '/', 1) = auth.uid()::text
  );

CREATE POLICY "Users can update own storage objects" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id IN ('candidate-documents', 'campaign-receipts', 'finance-reports')
    AND split_part(name, '/', 1) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id IN ('candidate-documents', 'campaign-receipts', 'finance-reports')
    AND split_part(name, '/', 1) = auth.uid()::text
  );

CREATE POLICY "Users can delete own storage objects" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id IN ('candidate-documents', 'campaign-receipts', 'finance-reports')
    AND split_part(name, '/', 1) = auth.uid()::text
  );

CREATE POLICY "Admins can read all storage objects" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id IN ('candidate-documents', 'campaign-receipts', 'finance-reports')
    AND public.is_admin(auth.uid())
  );

-- Audit Trail System
-- Enhanced audit_events table with more detailed tracking
ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS old_values JSONB DEFAULT '{}'::jsonb;
ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS new_values JSONB DEFAULT '{}'::jsonb;
ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS resource_type TEXT;
ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS action TEXT;

-- Audit logs table for detailed action tracking
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN (
    'user_login', 'user_logout', 'user_created', 'user_role_changed',
    'donation_added', 'donation_edited', 'donation_deleted',
    'expense_added', 'expense_edited', 'expense_deleted',
    'report_created', 'report_generated', 'report_submitted',
    'document_uploaded', 'document_deleted',
    'treasurer_assigned', 'treasurer_unassigned',
    'candidate_profile_updated', 'candidate_published',
    'checklist_item_created', 'checklist_item_updated', 'checklist_item_completed',
    'volunteer_application_submitted', 'volunteer_application_reviewed'
  )),
  resource_type TEXT,
  resource_id UUID,
  old_values JSONB DEFAULT '{}'::jsonb,
  new_values JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient audit queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id_timestamp ON audit_logs(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_timestamp ON audit_logs(action, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Trigger function for donations
CREATE OR REPLACE FUNCTION log_donation_changes()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (user_id, action, resource_type, resource_id, old_values, new_values, metadata)
  VALUES (
    CASE
      WHEN TG_OP = 'DELETE' THEN OLD.created_by
      ELSE NEW.created_by
    END,
    CASE WHEN TG_OP = 'INSERT' THEN 'donation_added' 
         WHEN TG_OP = 'UPDATE' THEN 'donation_edited'
         WHEN TG_OP = 'DELETE' THEN 'donation_deleted'
    END,
    'donation',
    CASE
      WHEN TG_OP = 'DELETE' THEN OLD.id
      ELSE NEW.id
    END,
    CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE row_to_json(OLD)::jsonb END,
    CASE WHEN TG_OP = 'DELETE' THEN '{}'::jsonb ELSE row_to_json(NEW)::jsonb END,
    jsonb_build_object(
      'candidate_id',
      CASE
        WHEN TG_OP = 'DELETE' THEN OLD.candidate_id
        ELSE NEW.candidate_id
      END
    )
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_log_donation_changes ON donations;
CREATE TRIGGER trigger_log_donation_changes
AFTER INSERT OR UPDATE OR DELETE ON donations
FOR EACH ROW
EXECUTE FUNCTION log_donation_changes();

-- Trigger function for expenses
CREATE OR REPLACE FUNCTION log_expense_changes()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (user_id, action, resource_type, resource_id, old_values, new_values, metadata)
  VALUES (
    CASE
      WHEN TG_OP = 'DELETE' THEN OLD.created_by
      ELSE NEW.created_by
    END,
    CASE WHEN TG_OP = 'INSERT' THEN 'expense_added'
         WHEN TG_OP = 'UPDATE' THEN 'expense_edited'
         WHEN TG_OP = 'DELETE' THEN 'expense_deleted'
    END,
    'expense',
    CASE
      WHEN TG_OP = 'DELETE' THEN OLD.id
      ELSE NEW.id
    END,
    CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE row_to_json(OLD)::jsonb END,
    CASE WHEN TG_OP = 'DELETE' THEN '{}'::jsonb ELSE row_to_json(NEW)::jsonb END,
    jsonb_build_object(
      'candidate_id',
      CASE
        WHEN TG_OP = 'DELETE' THEN OLD.candidate_id
        ELSE NEW.candidate_id
      END
    )
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_log_expense_changes ON expenses;
CREATE TRIGGER trigger_log_expense_changes
AFTER INSERT OR UPDATE OR DELETE ON expenses
FOR EACH ROW
EXECUTE FUNCTION log_expense_changes();

-- Trigger function for documents
CREATE OR REPLACE FUNCTION log_document_upload()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (user_id, action, resource_type, resource_id, new_values, metadata)
  VALUES (
    CASE
      WHEN TG_OP = 'DELETE' THEN COALESCE(OLD.uploaded_by, OLD.user_id)
      ELSE COALESCE(NEW.uploaded_by, NEW.user_id)
    END,
    CASE WHEN TG_OP = 'INSERT' THEN 'document_uploaded'
         WHEN TG_OP = 'DELETE' THEN 'document_deleted'
    END,
    'document',
    CASE
      WHEN TG_OP = 'DELETE' THEN OLD.id
      ELSE NEW.id
    END,
    CASE WHEN TG_OP = 'DELETE' THEN '{}'::jsonb ELSE row_to_json(NEW)::jsonb END,
    jsonb_build_object(
      'document_type', CASE WHEN TG_OP = 'DELETE' THEN OLD.document_type ELSE NEW.document_type END,
      'campaign_id', CASE WHEN TG_OP = 'DELETE' THEN OLD.campaign_id ELSE NEW.campaign_id END,
      'candidate_id', CASE WHEN TG_OP = 'DELETE' THEN OLD.candidate_id ELSE NEW.candidate_id END
    )
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_log_document_upload ON documents;
CREATE TRIGGER trigger_log_document_upload
AFTER INSERT OR DELETE ON documents
FOR EACH ROW
EXECUTE FUNCTION log_document_upload();

-- Trigger function for reports
CREATE OR REPLACE FUNCTION log_report_changes()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (user_id, action, resource_type, resource_id, old_values, new_values, metadata)
  VALUES (
    auth.uid(),
    CASE WHEN TG_OP = 'INSERT' THEN 'report_created'
         WHEN NEW.status = 'submitted' AND OLD.status != 'submitted' THEN 'report_submitted'
         ELSE 'report_generated'
    END,
    'report',
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE row_to_json(OLD)::jsonb END,
    CASE WHEN TG_OP = 'DELETE' THEN '{}'::jsonb ELSE row_to_json(NEW)::jsonb END,
    jsonb_build_object(
      'report_type', COALESCE(NEW.report_type, OLD.report_type),
      'candidate_id', COALESCE(NEW.candidate_id, OLD.candidate_id)
    )
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_log_report_changes ON reports;
CREATE TRIGGER trigger_log_report_changes
AFTER INSERT OR UPDATE ON reports
FOR EACH ROW
EXECUTE FUNCTION log_report_changes();

-- Trigger function for profile role changes
CREATE OR REPLACE FUNCTION log_role_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    INSERT INTO audit_logs (user_id, action, resource_type, resource_id, old_values, new_values)
    VALUES (
      auth.uid(),
      'user_role_changed',
      'profile',
      NEW.id,
      jsonb_build_object('role', OLD.role),
      jsonb_build_object('role', NEW.role)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_log_role_changes ON profiles;
CREATE TRIGGER trigger_log_role_changes
AFTER UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION log_role_changes();

-- Trigger function for checklist items
CREATE OR REPLACE FUNCTION log_checklist_changes()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (user_id, action, resource_type, resource_id, old_values, new_values, metadata)
  VALUES (
    auth.uid(),
    CASE WHEN TG_OP = 'INSERT' THEN 'checklist_item_created'
         WHEN NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN 'checklist_item_completed'
         ELSE 'checklist_item_updated'
    END,
    'checklist_item',
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE row_to_json(OLD)::jsonb END,
    CASE WHEN TG_OP = 'DELETE' THEN '{}'::jsonb ELSE row_to_json(NEW)::jsonb END,
    jsonb_build_object(
      'candidate_id',
      CASE
        WHEN TG_OP = 'DELETE' THEN OLD.candidate_id
        ELSE NEW.candidate_id
      END
    )
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_log_checklist_changes ON checklist_items;
CREATE TRIGGER trigger_log_checklist_changes
AFTER INSERT OR UPDATE OR DELETE ON checklist_items
FOR EACH ROW
EXECUTE FUNCTION log_checklist_changes();

-- RLS Policy for audit_logs: Users can only view logs for their own account; admins can view all
DROP POLICY IF EXISTS "Users can view own audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Admins can manage audit logs" ON audit_logs;

CREATE POLICY "Users can view own audit logs" ON audit_logs
  FOR SELECT USING (
    user_id = auth.uid() OR public.is_admin(auth.uid())
  );

CREATE POLICY "Admins can manage audit logs" ON audit_logs
  FOR ALL USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Grant access to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT SELECT ON campaign_active_rule_sets TO authenticated;
