-- Dulcy lead engine schema. Safe to run more than once.

-- One job = one Airtable button press (e.g. "verify this lead list").
CREATE TABLE IF NOT EXISTS jobs (
  id            BIGSERIAL PRIMARY KEY,
  kind          TEXT NOT NULL,            -- stage name, e.g. 'leadlist.verify'
  record_id     TEXT NOT NULL,            -- Airtable record the job is about
  client_id     TEXT,                     -- Airtable Workspace IDs record (optional)
  input         JSONB NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','running','succeeded','failed','needs_review','cancelled')),
  attempts      INT NOT NULL DEFAULT 0,
  max_attempts  INT NOT NULL DEFAULT 3,
  lease_owner   TEXT,
  lease_until   TIMESTAMPTZ,
  run_after     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deadline_at   TIMESTAMPTZ,              -- hard stop for the whole job
  error         TEXT,
  result        JSONB,
  dry_run       BOOLEAN NOT NULL DEFAULT true,
  request_id    TEXT,                     -- idempotency key from the caller
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one active job per record and kind: a double click can't start two runs.
CREATE UNIQUE INDEX IF NOT EXISTS jobs_one_active_per_record
  ON jobs (kind, record_id) WHERE status IN ('queued','running');
-- The same request sent twice returns the same job.
CREATE UNIQUE INDEX IF NOT EXISTS jobs_request_id ON jobs (request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS jobs_claimable ON jobs (status, run_after);
-- Latest progress line while a job waits (e.g. "MillionVerifier 40% complete").
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS progress TEXT;

-- A step is a checkpoint inside a job. A finished step is never run again.
CREATE TABLE IF NOT EXISTS steps (
  job_id      BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  step_key    TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('running','done','failed')),
  output      JSONB,
  error       TEXT,
  attempts    INT NOT NULL DEFAULT 0,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  PRIMARY KEY (job_id, step_key)
);

-- A receipt is written BEFORE every paid call, so the engine never pays twice.
-- 'pending' with no answer = outcome unclear: never retried automatically.
CREATE TABLE IF NOT EXISTS receipts (
  receipt_key  TEXT PRIMARY KEY,          -- job id + step + call identity
  job_id       BIGINT REFERENCES jobs(id) ON DELETE SET NULL,
  provider     TEXT NOT NULL,             -- e.g. 'millionverifier'
  units        NUMERIC NOT NULL DEFAULT 0,-- credits/rows this call may spend
  status       TEXT NOT NULL CHECK (status IN ('pending','done','failed','dry_run')),
  response     JSONB,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS receipts_provider_day ON receipts (provider, created_at);

-- Everything that happens, for debugging and the status page.
CREATE TABLE IF NOT EXISTS events (
  id         BIGSERIAL PRIMARY KEY,
  job_id     BIGINT REFERENCES jobs(id) ON DELETE CASCADE,
  level      TEXT NOT NULL CHECK (level IN ('info','warn','error')),
  message    TEXT NOT NULL,
  data       JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_job ON events (job_id, id);

-- Lead-list companies: the engine's master copy (Google Sheets is only a view of it).
-- One row per company per lead list; batch 0 = the sample, 1.. = expansion batches.
CREATE TABLE IF NOT EXISTS lead_companies (
  list_id     TEXT NOT NULL,              -- Airtable Lead List record
  domain      TEXT NOT NULL,
  tier        TEXT NOT NULL CHECK (tier IN ('Tier 1','Tier 2','Cut')),
  reasons     JSONB NOT NULL DEFAULT '[]',
  signals     JSONB NOT NULL DEFAULT '[]',
  data        JSONB NOT NULL,             -- the company fields the fit check read
  batch       INT NOT NULL,
  seq         BIGSERIAL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, domain)
);
CREATE INDEX IF NOT EXISTS lead_companies_batch ON lead_companies (list_id, batch, seq);

-- Where each list is mirrored in Google Sheets, and which batches are already written.
CREATE TABLE IF NOT EXISTS lead_list_sheets (
  list_id           TEXT NOT NULL,
  kind              TEXT NOT NULL,        -- 'companies' (later: 'contacts', 'final')
  sheet_id          TEXT NOT NULL,
  tab               TEXT NOT NULL,
  mirrored_batches  INT[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (list_id, kind)
);

-- One profile per lead list: who the list is for (from thesis + client context + plan).
CREATE TABLE IF NOT EXISTS lead_list_profiles (
  list_id      TEXT PRIMARY KEY,
  profile      JSONB NOT NULL,
  inputs_hash  TEXT NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lead-list contacts (master copy; the sheet's Contacts tab is a view). One row per email.
CREATE TABLE IF NOT EXISTS lead_contacts (
  list_id     TEXT NOT NULL,
  email       TEXT NOT NULL,
  domain      TEXT NOT NULL,
  tier        TEXT NOT NULL CHECK (tier IN ('Tier 1','Tier 2','Cut')),
  reasons     JSONB NOT NULL DEFAULT '[]',
  signals     JSONB NOT NULL DEFAULT '[]',
  data        JSONB NOT NULL,
  batch       INT NOT NULL,
  seq         BIGSERIAL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, email)
);
CREATE INDEX IF NOT EXISTS lead_contacts_batch ON lead_contacts (list_id, batch, seq);
-- Which companies were already searched for contacts (a re-run only searches new ones).
CREATE TABLE IF NOT EXISTS lead_contact_domains (
  list_id     TEXT NOT NULL,
  domain      TEXT NOT NULL,
  batch       INT NOT NULL,
  found       INT NOT NULL DEFAULT 0,
  PRIMARY KEY (list_id, domain)
);
-- When ContraGen last looked at a company (NULL = never): a company gets one ContraGen pass.
ALTER TABLE lead_contact_domains ADD COLUMN IF NOT EXISTS contragen_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS lead_contact_profiles (
  list_id      TEXT PRIMARY KEY,
  profile      JSONB NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Jobs queued from an Airtable button (Engine Action), and what was last written back.
CREATE TABLE IF NOT EXISTS airtable_jobs (
  job_id      BIGINT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  record_id   TEXT NOT NULL,
  action      TEXT NOT NULL,
  written     TEXT,                    -- last state written to the record (state|progress)
  finished    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Build Campaign: the Campaigns record a job writes to, its output, and the button press it belongs to.
ALTER TABLE airtable_jobs ADD COLUMN IF NOT EXISTS target_table  TEXT;
ALTER TABLE airtable_jobs ADD COLUMN IF NOT EXISTS target_record TEXT;
ALTER TABLE airtable_jobs ADD COLUMN IF NOT EXISTS parent_record TEXT;
ALTER TABLE airtable_jobs ADD COLUMN IF NOT EXISTS output        TEXT;
ALTER TABLE airtable_jobs ADD COLUMN IF NOT EXISTS press         TEXT;
