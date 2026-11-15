-- Guards (immutability, tamper protection) and Row Level Security.

-- ---------------------------------------------------------------- helpers
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();
create trigger rounds_touch before update on public.testing_rounds for each row execute function public.touch_updated_at();
create trigger applications_touch before update on public.tester_applications for each row execute function public.touch_updated_at();
create trigger project_tasks_touch before update on public.project_tasks for each row execute function public.touch_updated_at();
create trigger templates_touch before update on public.task_templates for each row execute function public.touch_updated_at();

-- A profile row for every auth user.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, is_demo)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(new.email, 'user'), '@', 1)),
          coalesce((new.raw_user_meta_data ->> 'is_demo')::boolean, false))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Historical records: no update / delete. The only tolerated change is anonymisation
-- (a user reference becoming null when an account is deleted).
create or replace function public.forbid_mutation() returns trigger language plpgsql as $$
declare
  user_cols text[] := array['tester_id','uploader_id','actor_id','generated_by','created_by'];
begin
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - user_cols) = (to_jsonb(old) - user_cols)
     and not exists (select 1 from jsonb_each(to_jsonb(new)) n
                     where n.key = any (user_cols) and n.value <> 'null'::jsonb and n.value <> (to_jsonb(old) -> n.key)) then
    return new;
  end if;
  if current_setting('fstb.retention_purge', true) = 'on' and tg_op = 'DELETE' then
    return old;
  end if;
  raise exception '% is an immutable historical record (%)', tg_table_name, tg_op using errcode = '42501';
end $$;

do $$
declare t text;
begin
  foreach t in array array['testing_task_versions','bug_reports','bug_report_events','tester_verdicts',
    'verdict_amendments','tester_feedback','testing_consents','validation_report_evidence','audit_logs','testing_activity']
  loop
    execute format('create trigger %I_immutable before update or delete on public.%I for each row execute function public.forbid_mutation()', t, t);
  end loop;
end $$;

-- Evidence files can be deleted only by the retention purge; never edited.
create trigger bug_attachments_immutable before update or delete on public.bug_attachments for each row execute function public.forbid_mutation();
create trigger evidence_files_immutable before update or delete on public.evidence_files for each row execute function public.forbid_mutation();

-- A finished report is frozen.
create or replace function public.guard_report_update() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' or old.status in ('completed','failed') then
    raise exception 'validation reports are immutable once finished' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger validation_reports_guard before update or delete on public.validation_reports for each row execute function public.guard_report_update();

-- Findings: generated content is frozen; only the creator-review layer may change.
create or replace function public.guard_finding_update() returns trigger language plpgsql as $$
declare review_cols text[] := array['review_status','edited_title','edited_body','reviewed_by','reviewed_at'];
begin
  if tg_op = 'DELETE' or (to_jsonb(new) - review_cols) <> (to_jsonb(old) - review_cols) then
    raise exception 'generated finding content is immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger validation_findings_guard before update or delete on public.validation_report_findings for each row execute function public.guard_finding_update();

-- Testers edit their own draft directly (save-and-return), but may never change status,
-- ownership or decision fields from the client: those move only through RPCs.
create or replace function public.guard_application_write() returns trigger language plpgsql as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;   -- SECURITY DEFINER RPCs / service role
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.submitted_at is not null or new.decided_at is not null
       or new.decided_by is not null or new.creator_message is not null or new.is_demo then
      raise exception 'applications start as a plain draft' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.status is distinct from old.status or new.tester_id <> old.tester_id or new.round_id <> old.round_id
     or new.submitted_at is distinct from old.submitted_at or new.decided_at is distinct from old.decided_at
     or new.decided_by is distinct from old.decided_by or new.creator_message is distinct from old.creator_message
     or new.is_demo is distinct from old.is_demo then
    raise exception 'application status and decision fields can only change through the review workflow' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger applications_guard before insert or update on public.tester_applications for each row execute function public.guard_application_write();

-- Round status changes go through publish_round / close_round (validation lives there).
create or replace function public.guard_round_write() returns trigger language plpgsql as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'rounds are created as drafts' using errcode = '42501'; end if;
    return new;
  end if;
  if new.status is distinct from old.status or new.product_id <> old.product_id then
    raise exception 'use publish_round / close_round to change round status' using errcode = '42501';
  end if;
  if old.status <> 'draft' and (new.release_id <> old.release_id or new.application_form <> old.application_form) then
    raise exception 'the release and application form are locked once a round has been published' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger rounds_guard before insert or update on public.testing_rounds for each row execute function public.guard_round_write();

-- Evidence may only be stored for a media type the tester explicitly consented to.
create or replace function public.guard_evidence_consent() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.testing_consents;
begin
  select tc.* into c from public.test_sessions s join public.testing_consents tc on tc.id = s.consent_id where s.id = new.session_id;
  if not found then raise exception 'unknown session' using errcode = '22023'; end if;
  if (new.kind = 'screenshot' and not c.screenshots) or (new.kind = 'recording' and not c.recordings)
     or (new.kind = 'voice' and not c.voice) then
    raise exception 'No consent on record for % evidence in this session', new.kind using errcode = '42501';
  end if;
  return new;
end $$;
create trigger bug_attachments_consent before insert on public.bug_attachments for each row execute function public.guard_evidence_consent();
create trigger evidence_files_consent before insert on public.evidence_files for each row execute function public.guard_evidence_consent();

-- ---------------------------------------------------------------- RLS predicate helpers
-- SECURITY DEFINER so policies can consult other tables without recursive policy evaluation.
create or replace function public.is_product_creator(p_product uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from products where id = p_product and creator_id = auth.uid())
$$;
create or replace function public.is_round_creator(p_round uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from testing_rounds r join products p on p.id = r.product_id
                 where r.id = p_round and p.creator_id = auth.uid())
$$;
create or replace function public.has_round_access(p_round uuid) returns boolean   -- assigned + accepted tester
language sql stable security definer set search_path = public as $$
  select exists (select 1 from tester_assignments a where a.round_id = p_round and a.tester_id = auth.uid()
                 and a.status in ('invited','accepted','in_progress','completed'))
$$;
create or replace function public.is_round_participant(p_round uuid) returns boolean  -- applied or assigned
language sql stable security definer set search_path = public as $$
  select exists (select 1 from tester_applications a where a.round_id = p_round and a.tester_id = auth.uid())
$$;
create or replace function public.round_is_public(p_round uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from testing_rounds where id = p_round and status = 'published')
$$;
create or replace function public.product_is_visible(p_product uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from testing_rounds r where r.product_id = p_product
                 and (r.status = 'published' or exists (select 1 from tester_applications a
                      where a.round_id = r.id and a.tester_id = auth.uid())))
$$;
create or replace function public.owns_session(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from test_sessions where id = p_session and tester_id = auth.uid())
$$;
create or replace function public.creator_of_session(p_session uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from test_sessions s join testing_rounds r on r.id = s.round_id
                 join products p on p.id = r.product_id where s.id = p_session and p.creator_id = auth.uid())
$$;
create or replace function public.creator_of_bug(p_bug uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from bug_reports b join products p on p.id = b.product_id
                 where b.id = p_bug and p.creator_id = auth.uid())
$$;
create or replace function public.owns_bug(p_bug uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from bug_reports where id = p_bug and tester_id = auth.uid())
$$;
create or replace function public.profile_is_visible(p_profile uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_profile = auth.uid()
      -- creators with a public listing have a public profile
      or exists (select 1 from products p join testing_rounds r on r.product_id = p.id
                 where p.creator_id = p_profile and r.status = 'published')
      -- a creator can see testers who applied to their rounds (never other testers)
      or exists (select 1 from tester_applications a join testing_rounds r on r.id = a.round_id
                 join products p on p.id = r.product_id
                 where a.tester_id = p_profile and p.creator_id = auth.uid() and a.status <> 'draft')
$$;

-- ---------------------------------------------------------------- enable RLS everywhere
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- profiles
create policy profiles_select on public.profiles for select using (public.profile_is_visible(id));
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- products & releases & assets
create policy products_select on public.products for select
  using (deleted_at is null and (creator_id = auth.uid() or public.product_is_visible(id)));
create policy products_insert on public.products for insert to authenticated with check (creator_id = auth.uid() and not is_demo);
create policy products_update on public.products for update to authenticated using (creator_id = auth.uid()) with check (creator_id = auth.uid());

create policy releases_select on public.product_releases for select
  using (public.is_product_creator(product_id) or public.product_is_visible(product_id));
create policy releases_insert on public.product_releases for insert to authenticated with check (public.is_product_creator(product_id));
create policy releases_update on public.product_releases for update to authenticated
  using (public.is_product_creator(product_id)) with check (public.is_product_creator(product_id));

create policy assets_select on public.product_assets for select
  using (public.is_product_creator(product_id) or public.product_is_visible(product_id));
create policy assets_write on public.product_assets for all to authenticated
  using (public.is_product_creator(product_id)) with check (public.is_product_creator(product_id));

-- rounds & objectives
create policy rounds_select on public.testing_rounds for select
  using (status = 'published' or public.is_product_creator(product_id) or public.is_round_participant(id));
create policy rounds_insert on public.testing_rounds for insert to authenticated with check (public.is_product_creator(product_id));
create policy rounds_update on public.testing_rounds for update to authenticated
  using (public.is_product_creator(product_id)) with check (public.is_product_creator(product_id));

create policy objectives_select on public.testing_objectives for select
  using (public.round_is_public(round_id) or public.is_round_creator(round_id) or public.is_round_participant(round_id));
create policy objectives_write on public.testing_objectives for all to authenticated
  using (public.is_round_creator(round_id)) with check (public.is_round_creator(round_id));

-- task engine: full task content is for the creator and assigned testers only
create policy tasks_select on public.testing_tasks for select to authenticated
  using (public.is_round_creator(round_id) or public.has_round_access(round_id));
create policy task_versions_select on public.testing_task_versions for select to authenticated
  using (exists (select 1 from public.testing_tasks t where t.id = task_id
                 and (public.is_round_creator(t.round_id) or public.has_round_access(t.round_id))));
create policy templates_select on public.task_templates for select to authenticated using (is_public or owner_id = auth.uid());
create policy templates_insert on public.task_templates for insert to authenticated with check (owner_id = auth.uid() and not is_public);
create policy templates_update on public.task_templates for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid() and not is_public);
create policy templates_delete on public.task_templates for delete to authenticated using (owner_id = auth.uid());

-- applications: the tester and the round's creator, nobody else
create policy applications_select on public.tester_applications for select to authenticated
  using (tester_id = auth.uid() or (status <> 'draft' and public.is_round_creator(round_id)));
create policy applications_insert on public.tester_applications for insert to authenticated
  with check (tester_id = auth.uid() and public.round_is_public(round_id) and not public.is_round_creator(round_id));
create policy applications_update on public.tester_applications for update to authenticated
  using (tester_id = auth.uid() and status in ('draft','info_requested')) with check (tester_id = auth.uid());
create policy applications_delete on public.tester_applications for delete to authenticated
  using (tester_id = auth.uid() and status = 'draft' and not is_demo);

-- assignments, consents, sessions, completions: read-only to clients; written by RPCs
create policy assignments_select on public.tester_assignments for select to authenticated
  using (tester_id = auth.uid() or public.is_round_creator(round_id));
create policy consents_select on public.testing_consents for select to authenticated
  using (tester_id = auth.uid() or public.is_round_creator(round_id));
create policy sessions_select on public.test_sessions for select to authenticated
  using (tester_id = auth.uid() or public.is_round_creator(round_id));
create policy completions_select on public.task_completions for select to authenticated
  using (public.owns_session(session_id) or public.creator_of_session(session_id));

-- feedback
create policy feedback_select on public.tester_feedback for select to authenticated
  using (tester_id = auth.uid() or public.creator_of_session(session_id));
create policy feedback_insert on public.tester_feedback for insert to authenticated
  with check (tester_id = auth.uid() and public.owns_session(session_id) and kind in ('general','feature_request')
              and task_completion_id is null);

-- bugs
create policy bugs_select on public.bug_reports for select to authenticated
  using (tester_id = auth.uid() or public.is_product_creator(product_id));
create policy bug_triage_select on public.bug_triage for select to authenticated
  using (public.owns_bug(bug_id) or public.creator_of_bug(bug_id));
create policy bug_events_select on public.bug_report_events for select to authenticated
  using (public.creator_of_bug(bug_id)
         or (public.owns_bug(bug_id) and event_type in ('request_info','tester_reply','mark_fixed','close')));
create policy bug_attachments_select on public.bug_attachments for select to authenticated
  using (uploader_id = auth.uid() or public.creator_of_bug(bug_id));
create policy bug_attachments_insert on public.bug_attachments for insert to authenticated
  with check (uploader_id = auth.uid() and public.owns_bug(bug_id) and public.owns_session(session_id)
              and exists (select 1 from public.bug_reports b where b.id = bug_id and b.session_id = bug_attachments.session_id));

-- verdicts
create policy verdicts_select on public.tester_verdicts for select to authenticated
  using (tester_id = auth.uid() or public.is_round_creator(round_id));
create policy amendments_select on public.verdict_amendments for select to authenticated
  using (tester_id = auth.uid() or exists (select 1 from public.tester_verdicts v
         where v.id = verdict_id and public.is_round_creator(v.round_id)));

-- evidence files
create policy evidence_select on public.evidence_files for select to authenticated
  using (uploader_id = auth.uid() or public.creator_of_session(session_id));
create policy evidence_insert on public.evidence_files for insert to authenticated
  with check (uploader_id = auth.uid() and public.owns_session(session_id));

-- validation reports: creator only; rows are written by the server-side report job (service role)
create policy reports_select on public.validation_reports for select to authenticated using (public.is_product_creator(product_id));
create policy findings_select on public.validation_report_findings for select to authenticated
  using (exists (select 1 from public.validation_reports r where r.id = report_id and public.is_product_creator(r.product_id)));
create policy report_evidence_select on public.validation_report_evidence for select to authenticated
  using (exists (select 1 from public.validation_reports r where r.id = report_id and public.is_product_creator(r.product_id)));

-- project tasks
create policy project_tasks_select on public.project_tasks for select to authenticated using (public.is_product_creator(product_id));
create policy project_tasks_insert on public.project_tasks for insert to authenticated
  with check (public.is_product_creator(product_id) and created_by = auth.uid() and finding_id is null);
create policy project_tasks_update on public.project_tasks for update to authenticated
  using (public.is_product_creator(product_id)) with check (public.is_product_creator(product_id));

-- activity, notifications, audit
create policy activity_select on public.testing_activity for select to authenticated
  using (public.is_round_creator(round_id) or actor_id = auth.uid());
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy audit_select on public.audit_logs for select to authenticated using (actor_id = auth.uid());
create policy deletion_requests_select on public.deletion_requests for select to authenticated using (user_id = auth.uid());

-- Anonymous visitors may browse public listings only.
revoke all on all tables in schema public from anon;
grant select on public.products, public.product_releases, public.product_assets, public.testing_rounds,
  public.testing_objectives, public.profiles to anon;
