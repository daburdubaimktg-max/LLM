-- From Save to Build — Test & Validate module: relational schema.
-- All ids are UUIDs, all timestamps are timestamptz (stored UTC).
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  bio text check (char_length(bio) <= 1000),
  country text,
  devices text[] not null default '{}',
  skills text[] not null default '{}',
  is_demo boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- products
create table public.products (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users (id),
  name text not null check (char_length(name) between 1 and 120),
  description text not null check (char_length(description) between 1 and 4000),
  category text not null check (category in ('finance','productivity','health_fitness','beauty_personal_care',
    'education','travel','entertainment','ecommerce','creator_tools','other')),
  stage text not null check (stage in ('idea','prototype','alpha','beta','live')),
  stage_label text,
  target_audience text,
  demo_url text,
  is_demo boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_creator_idx on public.products (creator_id);

create table public.product_releases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  version text not null check (char_length(version) between 1 and 40),
  notes text,
  access_url text,
  access_instructions text,
  released_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (product_id, version)
);

create table public.product_assets (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  kind text not null check (kind in ('logo','screenshot','demo_link')),
  storage_path text,
  url text,
  caption text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  check (storage_path is not null or url is not null)
);
create index product_assets_product_idx on public.product_assets (product_id);

-- ---------------------------------------------------------------- testing rounds
create table public.testing_rounds (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  release_id uuid not null references public.product_releases (id),
  previous_round_id uuid references public.testing_rounds (id),
  round_number int not null check (round_number > 0),
  title text not null,
  status text not null default 'draft' check (status in ('draft','published','closed','completed','archived')),
  summary text not null default '',              -- plain-language "what you will be asked to do"
  target_audience text,
  cohort_size int not null check (cohort_size between 1 and 10000),
  expected_minutes_min int not null check (expected_minutes_min > 0),
  expected_minutes_max int not null,
  supported_devices text[] not null default '{}',
  countries text[] not null default '{}',        -- empty = no country restriction
  application_deadline timestamptz,
  testing_deadline timestamptz,
  reward_type text not null default 'unpaid' check (reward_type in ('unpaid','paid','perk')),
  reward_details text,
  privacy_requirements text,
  beginner_friendly boolean not null default false,
  instructions text,
  access_instructions text,
  support_contact text,
  application_form jsonb not null default '{"steps":[]}'::jsonb,
  evidence_retention_days int not null default 180 check (evidence_retention_days between 1 and 3650),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, round_number),
  check (expected_minutes_max >= expected_minutes_min)
);
create index testing_rounds_status_idx on public.testing_rounds (status);
create index testing_rounds_product_idx on public.testing_rounds (product_id);
create index testing_rounds_release_idx on public.testing_rounds (release_id);

create table public.testing_objectives (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.testing_rounds (id),
  objective text not null check (char_length(objective) between 1 and 500),
  sort_order int not null default 0
);
create index testing_objectives_round_idx on public.testing_objectives (round_id);

-- ---------------------------------------------------------------- reusable task engine
create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id),      -- null = platform template
  is_public boolean not null default false,
  title text not null,
  task_type text not null,
  definition jsonb not null,                     -- same shape as a testing_task_versions row
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.testing_tasks (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.testing_rounds (id),
  template_id uuid references public.task_templates (id),
  position int not null default 0,
  is_required boolean not null default true,
  depends_on_task_id uuid references public.testing_tasks (id),
  current_version_id uuid,                       -- fk added below
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  check (depends_on_task_id is null or depends_on_task_id <> id)
);
create index testing_tasks_round_idx on public.testing_tasks (round_id, position);

-- Immutable, versioned task definitions. Editing a task inserts a new version; sessions pin a version.
create table public.testing_task_versions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.testing_tasks (id),
  version_number int not null check (version_number > 0),
  title text not null check (char_length(title) between 1 and 160),
  description text,
  scenario text,
  instructions jsonb not null default '[]'::jsonb,       -- ["step", ...]
  expected_result text,
  success_criteria jsonb not null default '[]'::jsonb,   -- ["criterion", ...]
  measures jsonb not null default '[]'::jsonb,           -- ["what the creator wants to learn", ...]
  estimated_minutes int check (estimated_minutes > 0),
  task_type text not null check (task_type in ('guided_scenario','feature_exploration','usability_assessment',
    'bug_reproduction','comparison','comprehension_check','open_exploration','final_review')),
  required_evidence text[] not null default '{}'
    check (required_evidence <@ array['screenshot','recording','voice']::text[]),
  feedback_questions jsonb not null default '[]'::jsonb, -- [{key,label,type,options?}]
  allow_skip boolean not null default false,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (task_id, version_number)
);
alter table public.testing_tasks
  add constraint testing_tasks_current_version_fk foreign key (current_version_id)
  references public.testing_task_versions (id) deferrable initially deferred;

-- ---------------------------------------------------------------- applications → assignments
create table public.tester_applications (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.testing_rounds (id),
  tester_id uuid not null references auth.users (id),
  status text not null default 'draft' check (status in ('draft','submitted','under_review','info_requested',
    'approved','waitlisted','declined','withdrawn')),
  current_step int not null default 1 check (current_step between 1 and 50),
  answers jsonb not null default '{}'::jsonb,    -- only questions the tester actually answered
  available_days text[] not null default '{}',
  confirm_device_access boolean not null default false,
  confirm_time_commitment boolean not null default false,
  confirm_instructions boolean not null default false,
  accept_terms boolean not null default false,
  consent_screenshots boolean not null default false,   -- optional, never required
  consent_recordings boolean not null default false,
  consent_voice boolean not null default false,
  creator_message text,
  is_demo boolean not null default false,
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, tester_id)
);
create index tester_applications_tester_idx on public.tester_applications (tester_id);
create index tester_applications_round_status_idx on public.tester_applications (round_id, status);

create table public.tester_assignments (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.testing_rounds (id),
  application_id uuid not null unique references public.tester_applications (id),
  tester_id uuid not null references auth.users (id),
  release_id uuid not null references public.product_releases (id),
  status text not null default 'invited' check (status in ('invited','accepted','declined','in_progress','completed','removed')),
  assigned_by uuid not null references auth.users (id),
  assigned_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (round_id, tester_id)
);
create index tester_assignments_tester_idx on public.tester_assignments (tester_id);

create table public.testing_consents (
  id uuid primary key default gen_random_uuid(),
  tester_id uuid references auth.users (id) on delete set null,
  round_id uuid not null references public.testing_rounds (id),
  assignment_id uuid not null references public.tester_assignments (id),
  participation boolean not null,
  privacy boolean not null,
  instructions_acknowledged boolean not null,
  screenshots boolean not null default false,
  recordings boolean not null default false,
  voice boolean not null default false,
  terms_version text not null default '2026-11',
  granted_at timestamptz not null default now(),
  check (participation and privacy and instructions_acknowledged)
);
create index testing_consents_assignment_idx on public.testing_consents (assignment_id, granted_at desc);

-- ---------------------------------------------------------------- sessions & task completion
create table public.test_sessions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null unique references public.tester_assignments (id),
  tester_id uuid references auth.users (id) on delete set null,
  round_id uuid not null references public.testing_rounds (id),
  product_id uuid not null references public.products (id),
  release_id uuid not null references public.product_releases (id),   -- exact release under test
  consent_id uuid not null references public.testing_consents (id),
  status text not null default 'active' check (status in ('active','paused','completed','abandoned')),
  started_at timestamptz not null default now(),
  paused_at timestamptz,
  completed_at timestamptz,
  last_activity_at timestamptz not null default now()
);
create index test_sessions_round_idx on public.test_sessions (round_id, status);
create index test_sessions_tester_idx on public.test_sessions (tester_id);

create table public.task_completions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.test_sessions (id),
  task_id uuid not null references public.testing_tasks (id),
  task_version_id uuid not null references public.testing_task_versions (id),  -- pinned at session start
  position int not null,
  is_required boolean not null,
  allow_skip boolean not null,
  depends_on_task_id uuid references public.testing_tasks (id),
  status text not null default 'not_started' check (status in ('not_started','in_progress','completed','blocked','skipped')),
  started_at timestamptz,
  completed_at timestamptz,
  last_resumed_at timestamptz,
  active_seconds int not null default 0 check (active_seconds >= 0),   -- excludes paused time
  help_requested boolean,
  difficulty text check (difficulty in ('very_easy','easy','somewhat_difficult','difficult','could_not_complete')),
  had_problem boolean,
  unique (session_id, task_id)
);
create index task_completions_task_idx on public.task_completions (task_id);

create table public.tester_feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.test_sessions (id),
  task_completion_id uuid references public.task_completions (id),
  tester_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('task','general','feature_request')),
  difficulty text check (difficulty in ('very_easy','easy','somewhat_difficult','difficult','could_not_complete')),
  help_requested boolean,
  comment text check (char_length(comment) <= 5000),
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index tester_feedback_session_idx on public.tester_feedback (session_id);

-- ---------------------------------------------------------------- bug reports (original report is immutable)
create table public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.test_sessions (id),
  round_id uuid not null references public.testing_rounds (id),
  product_id uuid not null references public.products (id),
  release_id uuid not null references public.product_releases (id),
  tester_id uuid references auth.users (id) on delete set null,
  task_completion_id uuid references public.task_completions (id),
  task_id uuid references public.testing_tasks (id),
  title text not null check (char_length(title) between 3 and 200),
  expected_result text not null check (char_length(expected_result) >= 1),
  actual_result text not null check (char_length(actual_result) >= 1),
  steps_to_reproduce text not null check (char_length(steps_to_reproduce) >= 1),
  severity text not null check (severity in ('minor','major','critical')),
  device text,
  operating_system text,
  product_version text not null,
  created_at timestamptz not null default now()
);
create index bug_reports_round_idx on public.bug_reports (round_id, severity);
create index bug_reports_session_idx on public.bug_reports (session_id);

-- Mutable creator-side triage state, kept apart from the tester's report.
create table public.bug_triage (
  bug_id uuid primary key references public.bug_reports (id),
  status text not null default 'new' check (status in ('new','reviewed','in_progress','needs_info','duplicate','fixed','closed')),
  category text,
  assignee_id uuid references auth.users (id),
  duplicate_of uuid references public.bug_reports (id),
  updated_at timestamptz not null default now()
);

create table public.bug_report_events (
  id uuid primary key default gen_random_uuid(),
  bug_id uuid not null references public.bug_reports (id),
  actor_id uuid references auth.users (id) on delete set null,
  actor_role text not null check (actor_role in ('creator','tester')),
  event_type text not null check (event_type in ('review','categorise','assign','mark_duplicate','mark_fixed',
    'request_info','close','reopen','note','tester_reply')),
  from_status text,
  to_status text,
  note text,
  created_at timestamptz not null default now()
);
create index bug_report_events_bug_idx on public.bug_report_events (bug_id, created_at);

create table public.bug_attachments (
  id uuid primary key default gen_random_uuid(),
  bug_id uuid not null references public.bug_reports (id),
  session_id uuid not null references public.test_sessions (id),
  uploader_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('screenshot','recording','voice')),
  storage_path text not null,
  file_name text,
  mime_type text,
  size_bytes bigint check (size_bytes >= 0),
  created_at timestamptz not null default now()
);
create index bug_attachments_bug_idx on public.bug_attachments (bug_id);

-- ---------------------------------------------------------------- verdicts (immutable) + amendments
create table public.tester_verdicts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.test_sessions (id),
  round_id uuid not null references public.testing_rounds (id),
  release_id uuid not null references public.product_releases (id),
  tester_id uuid references auth.users (id) on delete set null,
  rating int not null check (rating between 1 and 5),
  would_use text not null check (would_use in ('yes_definitely','maybe_with_improvements','no')),
  biggest_improvement text not null check (char_length(btrim(biggest_improvement)) >= 1),
  verdict text not null check (verdict in ('good_to_go','good_needs_improvements','needs_major_redevelopment','insufficient_information')),
  reason text not null check (char_length(btrim(reason)) >= 1),
  submitted_at timestamptz not null default now()
);
create index tester_verdicts_round_idx on public.tester_verdicts (round_id);

create table public.verdict_amendments (
  id uuid primary key default gen_random_uuid(),
  verdict_id uuid not null references public.tester_verdicts (id),
  tester_id uuid references auth.users (id) on delete set null,
  rating int check (rating between 1 and 5),
  would_use text check (would_use in ('yes_definitely','maybe_with_improvements','no')),
  biggest_improvement text,
  verdict text check (verdict in ('good_to_go','good_needs_improvements','needs_major_redevelopment','insufficient_information')),
  reason text not null check (char_length(btrim(reason)) >= 1),
  created_at timestamptz not null default now()
);
create index verdict_amendments_verdict_idx on public.verdict_amendments (verdict_id, created_at);

-- Evidence attached to a task completion or a final verdict (bug evidence lives in bug_attachments).
create table public.evidence_files (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.test_sessions (id),
  task_completion_id uuid references public.task_completions (id),
  verdict_id uuid references public.tester_verdicts (id),
  uploader_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('screenshot','recording','voice')),
  storage_path text not null,
  file_name text,
  mime_type text,
  size_bytes bigint check (size_bytes >= 0),
  created_at timestamptz not null default now()
);
create index evidence_files_session_idx on public.evidence_files (session_id);

-- ---------------------------------------------------------------- validation reports
create table public.validation_reports (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.testing_rounds (id),
  product_id uuid not null references public.products (id),
  release_id uuid not null references public.product_releases (id),
  generated_by uuid references auth.users (id) on delete set null,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed')),
  generator text,                  -- e.g. 'openai:<model>' or 'dev_heuristic' (no AI model involved)
  stats jsonb,                     -- deterministic aggregates computed by code, never by the model
  executive_summary text,
  limitations jsonb not null default '[]'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index validation_reports_round_idx on public.validation_reports (round_id, created_at desc);

create table public.validation_report_findings (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.validation_reports (id),
  position int not null default 0,
  section text not null check (section in ('worked_well','usability_problems','technical_problems','feature_requests',
    'task_analysis','segment_differences','conflicting_opinions','priorities','next_steps')),
  kind text not null check (kind in ('tester_statement','aggregated_observation','interpretation','recommendation')),
  title text not null,
  body text not null,
  task_id uuid references public.testing_tasks (id),
  supporting_tester_count int not null check (supporting_tester_count >= 0),  -- recomputed from evidence rows
  total_testers int not null check (total_testers >= 0),
  confidence text not null check (confidence in ('low','medium','high')),
  limitations text,
  -- creator review layer (the generated text above never changes)
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected')),
  edited_title text,
  edited_body text,
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz
);
create index validation_report_findings_report_idx on public.validation_report_findings (report_id, position);

create table public.validation_report_evidence (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.validation_reports (id),
  finding_id uuid not null references public.validation_report_findings (id),
  source_type text not null check (source_type in ('task_feedback','bug_report','verdict','task_completion')),
  source_id uuid not null,
  session_id uuid references public.test_sessions (id),
  excerpt text,                    -- copied verbatim from the source row by code
  created_at timestamptz not null default now()
);
create index validation_report_evidence_finding_idx on public.validation_report_evidence (finding_id);

-- ---------------------------------------------------------------- product-improvement tasks
create table public.project_tasks (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  round_id uuid references public.testing_rounds (id),
  finding_id uuid references public.validation_report_findings (id),
  title text not null check (char_length(title) between 1 and 200),
  description text,
  owner_id uuid references auth.users (id),
  owner_name text,
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  due_date date,
  status text not null default 'open' check (status in ('open','in_progress','resolved','wont_fix')),
  resolved_in_release_id uuid references public.product_releases (id),
  resolved_at timestamptz,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index project_tasks_product_idx on public.project_tasks (product_id, status);

-- ---------------------------------------------------------------- activity, notifications, audit, deletion
create table public.testing_activity (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.testing_rounds (id),
  session_id uuid references public.test_sessions (id),
  actor_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index testing_activity_round_idx on public.testing_activity (round_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link jsonb,                      -- {"screen": "...", "id": "..."}
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

create table public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  status text not null default 'pending' check (status in ('pending','processed')),
  requested_at timestamptz not null default now(),
  processed_at timestamptz
);
