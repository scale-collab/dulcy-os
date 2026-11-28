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
-- Campaign Center: the Campaigns record whose Engine Action was pressed (its Engine Status/Message show the result).
ALTER TABLE airtable_jobs ADD COLUMN IF NOT EXISTS campaign_record TEXT;

-- LeadMagic email-finder results per person (first|last|domain) of a list: a person is looked
-- up once, never paid twice (old n8n: each identity attempted once).
CREATE TABLE IF NOT EXISTS lead_lm_results (
  list_id     TEXT NOT NULL,
  key         TEXT NOT NULL,
  verdict     TEXT NOT NULL CHECK (verdict IN ('Good','Risky')),
  email       TEXT NOT NULL DEFAULT '',
  detail      TEXT NOT NULL DEFAULT '',
  job_id      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, key)
);

-- DiscoGen deep review (optional, paid): one verdict per company, so a company is never reviewed twice.
CREATE TABLE IF NOT EXISTS lead_deep_reviews (
  list_id      TEXT NOT NULL,
  domain       TEXT NOT NULL,
  verdict      TEXT NOT NULL,             -- Pass | Needs review | Fail (n8n's Deep Review Verdict)
  row          JSONB NOT NULL,            -- n8n's reviewed row (AI Company Review tab)
  task_id      TEXT,
  reviewed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, domain)
);

-- DiscoGen contact persona review (optional, paid): one verdict per contact, never reviewed twice.
CREATE TABLE IF NOT EXISTS lead_contact_reviews (
  list_id      TEXT NOT NULL,
  email        TEXT NOT NULL,
  persona_id   BIGINT,
  tier         TEXT NOT NULL,             -- n8n's Tier 1 | Tier 2 | Cut
  row          JSONB NOT NULL,            -- n8n's reviewed row (Contact Review tab)
  task_id      TEXT,
  reviewed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, email)
);
ALTER TABLE lead_contact_reviews ADD COLUMN IF NOT EXISTS prev_tier TEXT;  -- the code-fit tier before the review (for an undo)

-- Echo (inbox agent): one row per prospect reply handled (record + reply time), so a reply is drafted once.
CREATE TABLE IF NOT EXISTS sean_drafts (
  email_record TEXT NOT NULL,
  reply_at     TEXT NOT NULL,
  action       TEXT NOT NULL,
  reason       TEXT,
  decision_id  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (email_record, reply_at)
);

-- Calendar slots Echo offered, so two prospects are never offered the same time (2026-11-24).
CREATE TABLE IF NOT EXISTS offered_slots (
  ws_rec       TEXT NOT NULL,
  slot         TEXT NOT NULL,
  email_record TEXT NOT NULL,
  offered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ws_rec, slot, email_record)
);

-- OAuth connections (Xero for Ledger, 2026-11-25): one row per provider. Xero rotates the refresh
-- token on every refresh, so the row is locked while refreshing (engine and CLI never race).
CREATE TABLE IF NOT EXISTS oauth_tokens (
  provider       TEXT PRIMARY KEY,
  refresh_token  TEXT,
  access_token   TEXT,
  expires_at     TIMESTAMPTZ,
  tenant_id      TEXT,
  tenant_name    TEXT,
  pending_state  TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ledger: Slack messages already answered with a purchase yes/no (each answered once).
CREATE TABLE IF NOT EXISTS ledger_checks (
  channel     TEXT NOT NULL,
  ts          TEXT NOT NULL,
  verdict     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (channel, ts)
);

-- Ledger reconciliation prep: one row per Mercury transaction it handled (created in Xero, found
-- already there, or asked about), so nothing is ever entered twice.
CREATE TABLE IF NOT EXISTS ledger_entries (
  mercury_id  TEXT PRIMARY KEY,
  action      TEXT NOT NULL,             -- transfer | payment | spend | exists | asked
  xero_id     TEXT,
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cole: one row per Fathom recording looked at (reviewed, or skipped as not a sales call), so a call is reviewed once.
CREATE TABLE IF NOT EXISTS cole_reviews (
  recording_id  TEXT PRIMARY KEY,
  kind          TEXT NOT NULL,             -- sales | client | internal | other
  title         TEXT,
  review        JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Campaign creation (Atlas, 2026-11-25): one row per trigger (campaign past 60%, or a new client).
-- state: planning → filters → sample → approval1 → approved (→ part 2/3) | rejected | stuck
CREATE TABLE IF NOT EXISTS campaign_plans (
  id             SERIAL PRIMARY KEY,
  trigger_key    TEXT NOT NULL UNIQUE,
  ws_rec         TEXT NOT NULL,
  client         TEXT NOT NULL DEFAULT '',
  state          TEXT NOT NULL,
  plan           JSONB,
  lead_list_rec  TEXT,
  campaign_rec   TEXT,
  decision_rec   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Campaign creation part 2 (Scribe copy, approval 2, client portal), 2026-11-25.
ALTER TABLE campaign_plans ADD COLUMN IF NOT EXISTS decision2_rec TEXT;
ALTER TABLE campaign_plans ADD COLUMN IF NOT EXISTS copy JSONB;
ALTER TABLE campaign_plans ADD COLUMN IF NOT EXISTS copy_state TEXT;
ALTER TABLE campaign_plans ADD COLUMN IF NOT EXISTS copy_issues JSONB;
ALTER TABLE campaign_plans ADD COLUMN IF NOT EXISTS copy_round INT NOT NULL DEFAULT 1;
ALTER TABLE campaign_plans ADD COLUMN IF NOT EXISTS copy_feedback TEXT;
ALTER TABLE campaign_plans ADD COLUMN IF NOT EXISTS plan_round INT NOT NULL DEFAULT 1;
ALTER TABLE campaign_plans ADD COLUMN IF NOT EXISTS plan_error TEXT;
ALTER TABLE campaign_plans ADD COLUMN IF NOT EXISTS launch_tries INT NOT NULL DEFAULT 0;

-- ---------- Dulcy HQ (the private web app), 2026-11-25 ----------
-- Logins. Passwords are scrypt hashes (never stored or printed in clear). role: owner | member.
CREATE TABLE IF NOT EXISTS hq_users (
  id             SERIAL PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,      -- lower case
  name           TEXT NOT NULL DEFAULT '',  -- first name, written as Decided By
  password_hash  TEXT,                      -- NULL = Google sign-in only
  role           TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  disabled       BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Sessions: the cookie holds a random id (signed); only its sha256 is kept here, so a database
-- copy cannot be used to log in. Logging out deletes the row.
CREATE TABLE IF NOT EXISTS hq_sessions (
  id_hash     TEXT PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES hq_users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Login attempts, for the rate limit (failed tries per email and per address in 15 minutes).
CREATE TABLE IF NOT EXISTS hq_login_attempts (
  id          BIGSERIAL PRIMARY KEY,
  email       TEXT NOT NULL,
  ip          TEXT NOT NULL,
  ok          BOOLEAN NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hq_login_attempts_recent ON hq_login_attempts (created_at);

-- Every report an agent writes (brief, client health, call review, money report, ideas...).
-- Shown in HQ; posted to Slack only while SLACK_REPORTS=on (urgent alerts always post).
CREATE TABLE IF NOT EXISTS hq_reports (
  id          BIGSERIAL PRIMARY KEY,
  agent       TEXT NOT NULL,              -- Ada, Atlas, Cole, Ledger, Sienna, Riley...
  kind        TEXT NOT NULL,              -- brief | client_health | call_review | money_report | ...
  title       TEXT NOT NULL,
  summary     TEXT NOT NULL DEFAULT '',   -- 1-2 lines for the card
  body        TEXT NOT NULL DEFAULT '',   -- full text (markdown)
  link        TEXT,
  data        JSONB,                      -- structured extras (e.g. a call review's score and 3 fixes)
  urgent      BOOLEAN NOT NULL DEFAULT false,
  dry_run     BOOLEAN NOT NULL DEFAULT false,
  job_id      BIGINT,
  dedupe_key  TEXT UNIQUE,                -- the same report is saved once (job retries)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hq_reports_agent ON hq_reports (agent, created_at DESC);

-- Chat with Ada and the agents. A thread is a person ↔ one agent, or Ada ↔ an agent (ask_agent).
CREATE TABLE IF NOT EXISTS hq_chat_threads (
  id             BIGSERIAL PRIMARY KEY,
  user_id        INT REFERENCES hq_users(id) ON DELETE SET NULL,
  agent          TEXT NOT NULL,
  asked_by       TEXT NOT NULL DEFAULT 'user',   -- 'user' or the asking agent ('Ada')
  parent_id      BIGINT REFERENCES hq_chat_threads(id) ON DELETE SET NULL,
  title          TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hq_chat_threads_agent ON hq_chat_threads (agent, updated_at DESC);
CREATE TABLE IF NOT EXISTS hq_chat_messages (
  id          BIGSERIAL PRIMARY KEY,
  thread_id   BIGINT NOT NULL REFERENCES hq_chat_threads(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('user','assistant')),
  author      TEXT NOT NULL,               -- 'Alex', 'Ada', 'Atlas'...
  text        TEXT NOT NULL,
  sources     JSONB NOT NULL DEFAULT '[]', -- what the answer was read from
  tools       JSONB NOT NULL DEFAULT '[]', -- tool calls made (name, input, short result)
  usage       JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hq_chat_messages_thread ON hq_chat_messages (thread_id, id);

-- Each agent's own to-do list (the Airtable Tasks table has no Agent field; kept here instead).
CREATE TABLE IF NOT EXISTS hq_agent_tasks (
  id          BIGSERIAL PRIMARY KEY,
  agent       TEXT NOT NULL,
  title       TEXT NOT NULL,
  due_date    DATE,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  client      TEXT NOT NULL DEFAULT '',
  link        TEXT,
  notes       TEXT NOT NULL DEFAULT '',
  source_key  TEXT UNIQUE,                 -- a generator makes one task per source (e.g. plan-next:<campaign>)
  done_note   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  done_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS hq_agent_tasks_open ON hq_agent_tasks (agent, status, due_date);
-- Agent task lists (Alex, 2026-11-25: "the task should be assigned to them, and we could see and
-- ask for progress"). Status: open (not started) | in_progress | waiting_alex | done. Each task has a
-- one-line progress note and the time it last changed (updated_at: only bumped when the title,
-- status, note, due date or link changes, so a task nobody touches goes stale). The engine opens,
-- updates and closes them with upsertAgentTask() (engine/src/hq/agentTasks.ts), one row per source_key.
-- job_kind/job_record/job_input: the engine job that moves it; Ada re-queues it when it stalls.
-- waiting_until: a planned wait (an account resting until its retest) is not "stalled" before then.
ALTER TABLE hq_agent_tasks DROP CONSTRAINT IF EXISTS hq_agent_tasks_status_check;
ALTER TABLE hq_agent_tasks ADD CONSTRAINT hq_agent_tasks_status_check CHECK (status IN ('open','in_progress','waiting_alex','done'));
ALTER TABLE hq_agent_tasks ADD COLUMN IF NOT EXISTS progress_note TEXT NOT NULL DEFAULT '';
ALTER TABLE hq_agent_tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
UPDATE hq_agent_tasks SET updated_at = COALESCE(done_at, created_at) WHERE updated_at IS NULL;
ALTER TABLE hq_agent_tasks ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE hq_agent_tasks ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE hq_agent_tasks ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE hq_agent_tasks ADD COLUMN IF NOT EXISTS job_kind TEXT;
ALTER TABLE hq_agent_tasks ADD COLUMN IF NOT EXISTS job_record TEXT;
ALTER TABLE hq_agent_tasks ADD COLUMN IF NOT EXISTS job_input JSONB;
ALTER TABLE hq_agent_tasks ADD COLUMN IF NOT EXISTS waiting_until TIMESTAMPTZ;
ALTER TABLE hq_agent_tasks ADD COLUMN IF NOT EXISTS requeues INT NOT NULL DEFAULT 0;
ALTER TABLE hq_agent_tasks ADD COLUMN IF NOT EXISTS requeued_at TIMESTAMPTZ;
ALTER TABLE hq_agent_tasks ADD COLUMN IF NOT EXISTS decision_rec TEXT;          -- the Airtable Decision a waiting_alex task waits on
CREATE INDEX IF NOT EXISTS hq_agent_tasks_done ON hq_agent_tasks (done_at DESC) WHERE status = 'done';

-- HQ sign-up and user management (2026-11-25). A sign-up is a row with pending=true AND
-- disabled=true: every login path refuses disabled and pending users, so a request can never get
-- a session. The owner approves (role), denies (row deleted), disables, re-enables, resets.
ALTER TABLE hq_users ADD COLUMN IF NOT EXISTS pending BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE hq_users ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ;
ALTER TABLE hq_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
-- kind: login | signup (sign-ups have their own rate limit, per email and per address).
ALTER TABLE hq_login_attempts ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'login';
-- Every user-management action: who did what to whom, when.
CREATE TABLE IF NOT EXISTS hq_user_events (
  id          BIGSERIAL PRIMARY KEY,
  actor       TEXT NOT NULL,              -- the owner's email, or the email that signed up
  action      TEXT NOT NULL,              -- signup | approve | deny | role | disable | enable | password | add
  target      TEXT NOT NULL,              -- the user's email
  detail      TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hq_user_events_recent ON hq_user_events (created_at DESC);

-- "Done?" questions answered "not yet": not asked again for that task until quiet_until.
CREATE TABLE IF NOT EXISTS hq_task_checks (
  task_id     TEXT PRIMARY KEY,
  quiet_until TIMESTAMPTZ NOT NULL
);

-- "Needs you" (2026-11-25): things an agent or a Claude session asks Alex (or a member) to do,
-- e.g. "Atlas: reply to Pete about Twenty West", "Setup: publish the Google calendar app".
-- Added with addAsk() (engine/src/hq/asks.ts) or the CLI `ask add`; one row per dedupe_key.
-- Gone from HQ once done_at is set; hidden until snoozed_until. audience 'owner' = only owners
-- see it; 'everyone' = members too (never for Ledger or Sienna: money and content are owner-only).
CREATE TABLE IF NOT EXISTS hq_asks (
  id            BIGSERIAL PRIMARY KEY,
  agent         TEXT NOT NULL,
  title         TEXT NOT NULL,
  why           TEXT NOT NULL DEFAULT '',
  steps         TEXT NOT NULL DEFAULT '',
  action_label  TEXT NOT NULL DEFAULT '',
  action_url    TEXT NOT NULL DEFAULT '',     -- a relative HQ route (decisions/Replies) or an https:// link
  priority      TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('high','normal')),
  audience      TEXT NOT NULL DEFAULT 'owner' CHECK (audience IN ('owner','everyone')),
  dedupe_key    TEXT NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  done_at       TIMESTAMPTZ,
  done_by       TEXT,
  snoozed_until TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS hq_asks_open ON hq_asks (created_at DESC) WHERE done_at IS NULL;
-- Needs you day switcher (2026-11-25): an ask can be due on a day (shown on that day, "Tomorrow"
-- the day before), and flagged money or client-facing (those come first on Today).
ALTER TABLE hq_asks ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE hq_asks ADD COLUMN IF NOT EXISTS client_facing BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE hq_asks ADD COLUMN IF NOT EXISTS money BOOLEAN NOT NULL DEFAULT false;

-- "Not now" on a Needs-you item that lives elsewhere (a Riley System Issue): hidden until quiet_until.
CREATE TABLE IF NOT EXISTS hq_needs_quiet (
  item_key    TEXT PRIMARY KEY,               -- e.g. issue:rec...
  quiet_until TIMESTAMPTZ NOT NULL,
  set_by      TEXT NOT NULL DEFAULT ''
);

-- HQ Inbox → AI replier (2026-11-25): every save of a client's Reply Agent settings row from HQ
-- (who, when, which fields from what to what) and every "Get calendar link" request.
CREATE TABLE IF NOT EXISTS hq_settings_log (
  id          BIGSERIAL PRIMARY KEY,
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,                  -- 'save' | 'calendar_invite'
  ws_rec      TEXT NOT NULL DEFAULT '',
  row_id      TEXT NOT NULL DEFAULT '',
  changes     JSONB NOT NULL DEFAULT '[]',    -- [{field, from, to}] (save) or {provider, email, expiresAt} (invite)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hq_settings_log_ws ON hq_settings_log (ws_rec, created_at DESC);

-- Sean was renamed Echo (Alex, 2026-11-25): carry HQ's own rows over. Idempotent; matches nothing after the first boot.
UPDATE hq_reports SET agent = 'Echo' WHERE agent = 'Sean';
UPDATE hq_chat_threads SET agent = 'Echo' WHERE agent = 'Sean';
UPDATE hq_agent_tasks SET agent = 'Echo' WHERE agent = 'Sean';
UPDATE hq_asks SET agent = 'Echo' WHERE agent = 'Sean';

-- HQ client portal (2026-11-26): role 'client' = one client's own login. It sees only that client's
-- results (/hq/api/portal/*); every other HQ route refuses it. client_rec is the client's main
-- Workspace IDs record (workspaces that are one client, like Twenty West + "(Internal)", count as
-- one: the server finds the group from any of its records). Only the owner makes one (Users page);
-- a sign-up is always a pending member, and no owner/member row can become a client.
ALTER TABLE hq_users ADD COLUMN IF NOT EXISTS client_rec TEXT;
ALTER TABLE hq_users ADD COLUMN IF NOT EXISTS client_name TEXT NOT NULL DEFAULT '';
ALTER TABLE hq_users DROP CONSTRAINT IF EXISTS hq_users_role_check;
ALTER TABLE hq_users ADD CONSTRAINT hq_users_role_check CHECK (role IN ('owner','member','client'));
ALTER TABLE hq_users DROP CONSTRAINT IF EXISTS hq_users_client_link;
ALTER TABLE hq_users ADD CONSTRAINT hq_users_client_link CHECK (
  (role = 'client') = (client_rec IS NOT NULL AND client_rec ~ '^rec[A-Za-z0-9]{14}$') AND NOT (role = 'client' AND pending));

-- HQ Content (2026-11-26): every idea decision HQ writes to the Content Channels table (who, when,
-- which record, which fields from what to what). The same fields the Content Center's buttons write.
CREATE TABLE IF NOT EXISTS hq_content_log (
  id          BIGSERIAL PRIMARY KEY,
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,                  -- 'idea_approve' | 'idea_reject'
  record_id   TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  changes     JSONB NOT NULL DEFAULT '[]',    -- [{field, from, to}]
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hq_content_log_at ON hq_content_log (created_at DESC);

-- HQ client portal v2 (2026-11-26): portal.dulcy.io replaces Softr.
-- A sign-up on the portal host is a pending request (portal_signup) the owner links to a client; it
-- never becomes a client by itself (only a Google-verified email matching Airtable Portal Users can).
ALTER TABLE hq_users ADD COLUMN IF NOT EXISTS portal_signup BOOLEAN NOT NULL DEFAULT false;
-- One-time set-password links (setup for existing Softr users, and password resets). Only the
-- token's sha256 is kept; a link works once and expires.
CREATE TABLE IF NOT EXISTS hq_portal_tokens (
  id_hash     TEXT PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES hq_users(id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL,                    -- 'setup' | 'reset'
  created_by  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- "Forgot password" asks from the portal: the owner sees them on Users and makes a link.
CREATE TABLE IF NOT EXISTS hq_portal_resets (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES hq_users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  handled_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS hq_portal_resets_open ON hq_portal_resets (user_id) WHERE handled_at IS NULL;
-- Every write a client makes from the portal: who, when, what (table, record, field names; no values).
CREATE TABLE IF NOT EXISTS hq_portal_writes (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INT REFERENCES hq_users(id) ON DELETE SET NULL,
  user_email  TEXT NOT NULL,
  client_rec  TEXT NOT NULL,
  action      TEXT NOT NULL,
  table_id    TEXT NOT NULL,
  record_id   TEXT NOT NULL,
  fields      TEXT[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hq_portal_writes_at ON hq_portal_writes (created_at DESC);

-- Batch 4b (2026-11-27): chat like Slack. Several chats per agent; HQ opens the one you had open
-- last (opened_at); old chats can be archived (hidden, restorable). Additive and idempotent: every
-- chat saved before this keeps its messages and becomes a chat in the list, and the last one used
-- per agent is the one that opens (opened_at starts as its last message time).
ALTER TABLE hq_chat_threads ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE hq_chat_threads ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;
UPDATE hq_chat_threads SET opened_at = updated_at WHERE opened_at IS NULL;
ALTER TABLE hq_chat_threads ALTER COLUMN opened_at SET DEFAULT now();
CREATE INDEX IF NOT EXISTS hq_chat_threads_open ON hq_chat_threads (user_id, agent, opened_at DESC) WHERE archived_at IS NULL;

-- Riley n8n fixes (Alex 2026-11-27): the full workflow as it was before the engine changed it on
-- Alex's ✅, so `riley-n8n-rollback <issueId>` can put it back. Never printed (it can hold old
-- hardcoded keys); the System Issue's Rollback field only gets a short pointer to the row.
CREATE TABLE IF NOT EXISTS riley_n8n_rollbacks (
  id             BIGSERIAL PRIMARY KEY,
  issue_id       TEXT NOT NULL,
  workflow_id    TEXT NOT NULL,
  workflow_name  TEXT NOT NULL DEFAULT '',
  job_id         BIGINT,
  previous       JSONB NOT NULL,
  patch          JSONB NOT NULL,
  was_active     BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at     TIMESTAMPTZ,
  rolled_back_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS riley_n8n_rollbacks_issue ON riley_n8n_rollbacks (issue_id, id DESC);
-- HQ phone notifications (Web Push), Alex 2026-11-27. Additive and idempotent.
-- The VAPID key pair (made on first start when VAPID_* env is not set). The private key never leaves the server.
CREATE TABLE IF NOT EXISTS hq_push_keys (
  id           INT PRIMARY KEY CHECK (id = 1),
  public_key   TEXT NOT NULL,
  private_key  TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One row per device (browser push subscription) of an HQ login. 404/410 from the push service = removed.
CREATE TABLE IF NOT EXISTS hq_push_subscriptions (
  id           BIGSERIAL PRIMARY KEY,
  user_id      INT NOT NULL REFERENCES hq_users(id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL UNIQUE,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  user_agent   TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_ok_at   TIMESTAMPTZ,
  failures     INT NOT NULL DEFAULT 0,
  last_error   TEXT
);
CREATE INDEX IF NOT EXISTS hq_push_subscriptions_user ON hq_push_subscriptions (user_id);
-- Per person: which of the 4 kinds are on (default all), and the send limits' state
-- (last push, last decision push for grouping, pushes today in New York).
CREATE TABLE IF NOT EXISTS hq_push_settings (
  user_id                INT PRIMARY KEY REFERENCES hq_users(id) ON DELETE CASCADE,
  on_decision            BOOLEAN NOT NULL DEFAULT true,
  on_agent               BOOLEAN NOT NULL DEFAULT true,
  on_urgent              BOOLEAN NOT NULL DEFAULT true,
  on_good                BOOLEAN NOT NULL DEFAULT true,
  last_push_at           TIMESTAMPTZ,
  last_decision_push_at  TIMESTAMPTZ,
  day                    TEXT NOT NULL DEFAULT '',
  day_count              INT NOT NULL DEFAULT 0,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Every push per person: one row per (person, dedupe key), so the same event is never pushed twice.
-- status: pending (waiting for the minute / grouping window) | sent | capped (daily cap) | expired (30 min old).
CREATE TABLE IF NOT EXISTS hq_push_log (
  id           BIGSERIAL PRIMARY KEY,
  user_id      INT NOT NULL REFERENCES hq_users(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,                 -- decision | agent | urgent | good | test
  dedupe_key   TEXT NOT NULL,
  title        TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL DEFAULT '',
  url          TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','capped','expired')),
  batch        TEXT,                          -- rows sent as one push share a batch
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at      TIMESTAMPTZ,
  UNIQUE (user_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS hq_push_log_pending ON hq_push_log (user_id, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS hq_push_log_at ON hq_push_log (created_at);
-- The watch loop: when each detector last ran, and baseline_at (its first run only records what is
-- already there: nothing that existed before is pushed). hq_push_seen: what was seen (new = not seen before).
CREATE TABLE IF NOT EXISTS hq_push_watch (
  name         TEXT PRIMARY KEY,
  baseline_at  TIMESTAMPTZ,
  last_run_at  TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS hq_push_seen (
  key          TEXT PRIMARY KEY,              -- <namespace>:<id>, e.g. decision:rec…
  seen_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hq_push_seen_at ON hq_push_seen (seen_at);
-- Which screen each person has open (so a chat answer they are looking at is not pushed).
CREATE TABLE IF NOT EXISTS hq_push_presence (
  user_id      INT PRIMARY KEY REFERENCES hq_users(id) ON DELETE CASCADE,
  route        TEXT NOT NULL DEFAULT '',
  visible      BOOLEAN NOT NULL DEFAULT false,
  seen_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Finances → Personal (Alex 2026-11-28): Alex's own cards and bank accounts linked through Plaid,
-- read only. access_token_enc is the Plaid access token sealed with AES-256-GCM (key derived from
-- ENGINE_SECRET, bound to item_id); the clear token is never stored, logged or sent to a browser.
CREATE TABLE IF NOT EXISTS hq_plaid_items (
  id                SERIAL PRIMARY KEY,
  item_id           TEXT NOT NULL UNIQUE,
  institution       TEXT NOT NULL DEFAULT '',
  access_token_enc  TEXT NOT NULL,
  added_by          TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- HQ Content round 5 (Alex 2026-11-28): "complete distribution stats" inside HQ. Per video and per
-- platform slot (a Content Distribution record id, or 'TikTok', which has no draft row in the
-- Content OS): where and when it was posted, and its views, likes and comments, typed in by Alex.
-- Airtable has no stats fields; the post URL also goes to the draft's Published URL (as the Content
-- Center's "mark as published" writes it). Nothing here posts or schedules.
CREATE TABLE IF NOT EXISTS hq_content_posts (
  id          BIGSERIAL PRIMARY KEY,
  content_id  TEXT NOT NULL,                  -- Content Channels record id
  slot        TEXT NOT NULL,                  -- Content Distribution record id, or 'TikTok'
  platform    TEXT NOT NULL,
  post_url    TEXT NOT NULL DEFAULT '',
  posted_on   DATE,
  views       INT,
  likes       INT,
  comments    INT,
  updated_by  TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (content_id, slot)
);

-- HQ voice (Alex 2026-11-28): one row per voice turn (speech to text) or read-aloud (text to speech),
-- for the hourly limit and the cost. Counts only: the clip and the words are never stored here.
CREATE TABLE IF NOT EXISTS hq_voice_uses (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES hq_users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                   -- 'turn' | 'speak'
  seconds     NUMERIC,                         -- clip length (turn)
  chars       INT,                             -- characters read out (speak)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hq_voice_uses_recent ON hq_voice_uses (user_id, kind, created_at DESC);

-- Instant webhooks (Alex 2026-11-28: agents start on events, never on a timer).
-- One row per accepted POST /hooks/<source>: what came in and which jobs it started. A provider's own event id
-- (Slack event_id, Fathom webhook-id, Close event id) is kept once, so a retried delivery starts nothing twice.
-- info holds a short summary only (a Make/n8n error: scenario + message), never lead rows or email bodies.
CREATE TABLE IF NOT EXISTS hook_events (
  id          BIGSERIAL PRIMARY KEY,
  source      TEXT NOT NULL,
  event       TEXT NOT NULL,
  event_id    TEXT,
  jobs        TEXT[] NOT NULL DEFAULT '{}',
  info        JSONB NOT NULL DEFAULT '{}',
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS hook_events_once ON hook_events (source, event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS hook_events_recent ON hook_events (source, received_at DESC);
-- An event that arrives while its job is already running: run it once more right after (the running job may
-- have read its data before the event). One row per job and record, however many events came in.
CREATE TABLE IF NOT EXISTS job_reruns (
  kind        TEXT NOT NULL,
  record_id   TEXT NOT NULL,
  input       JSONB NOT NULL DEFAULT '{}',
  reason      TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, record_id)
);
