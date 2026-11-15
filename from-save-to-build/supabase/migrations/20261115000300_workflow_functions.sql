-- Workflow RPCs. Every state transition that matters is a single transactional, SECURITY DEFINER
-- function that authorises the caller itself (auth.uid()), so the client can never skip a step.

create or replace function public.app_uid() returns uuid language plpgsql stable as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  return u;
end $$;

create or replace function public._notify(p_user uuid, p_type text, p_title text, p_body text, p_link jsonb)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, type, title, body, link)
  select p_user, p_type, p_title, p_body, p_link where p_user is not null
$$;
create or replace function public._activity(p_round uuid, p_session uuid, p_event text, p_payload jsonb)
returns void language sql security definer set search_path = public as $$
  insert into testing_activity (round_id, session_id, actor_id, event_type, payload)
  values (p_round, p_session, auth.uid(), p_event, coalesce(p_payload, '{}'::jsonb))
$$;
create or replace function public._audit(p_action text, p_entity text, p_id uuid, p_detail jsonb)
returns void language sql security definer set search_path = public as $$
  insert into audit_logs (actor_id, action, entity_type, entity_id, detail)
  values (auth.uid(), p_action, p_entity, p_id, coalesce(p_detail, '{}'::jsonb))
$$;
create or replace function public._round_creator(p_round uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select p.creator_id from testing_rounds r join products p on p.id = r.product_id where r.id = p_round
$$;
create or replace function public._require_round_creator(p_round uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if public._round_creator(p_round) is distinct from public.app_uid() then
    raise exception 'Only the product creator can do this' using errcode = '42501';
  end if;
end $$;

-- ================================================================ listings
-- Public counters for the marketplace. "remaining_places" counts approved testers against the
-- cohort; "pending_applications" (unreviewed) is reported separately and never reduces places.
create or replace function public.listing_stats(p_round uuid default null)
returns table (round_id uuid, cohort_size int, approved_testers int, assigned_testers int,
               pending_applications int, remaining_places int, task_count int, required_task_count int)
language sql stable security definer set search_path = public as $$
  select r.id, r.cohort_size,
    (select count(*) from tester_applications a where a.round_id = r.id and a.status = 'approved')::int,
    (select count(*) from tester_assignments s where s.round_id = r.id and s.status not in ('declined','removed'))::int,
    (select count(*) from tester_applications a where a.round_id = r.id and a.status in ('submitted','under_review','info_requested'))::int,
    greatest(r.cohort_size - (select count(*) from tester_applications a where a.round_id = r.id and a.status = 'approved'), 0)::int,
    (select count(*) from testing_tasks t where t.round_id = r.id and t.archived_at is null)::int,
    (select count(*) from testing_tasks t where t.round_id = r.id and t.archived_at is null and t.is_required)::int
  from testing_rounds r
  where (p_round is null or r.id = p_round)
    and (r.status = 'published' or public.is_product_creator(r.product_id) or public.is_round_participant(r.id))
$$;

-- Titles + timing only (no instructions) so a listing can explain what testers will be asked to do.
create or replace function public.listing_task_outline(p_round uuid)
returns table ("position" int, title text, task_type text, estimated_minutes int, is_required boolean)
language sql stable security definer set search_path = public as $$
  select t.position, v.title, v.task_type, v.estimated_minutes, t.is_required
  from testing_tasks t join testing_task_versions v on v.id = t.current_version_id
  join testing_rounds r on r.id = t.round_id
  where t.round_id = p_round and t.archived_at is null
    and (r.status = 'published' or public.is_product_creator(r.product_id) or public.is_round_participant(r.id))
  order by t.position
$$;

-- ================================================================ rounds & tasks (creator)
create or replace function public.publish_round(p_round uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r testing_rounds;
begin
  perform public._require_round_creator(p_round);
  select * into r from testing_rounds where id = p_round for update;
  if r.status <> 'draft' then raise exception 'Only a draft round can be published' using errcode = '22023'; end if;
  if not exists (select 1 from testing_tasks where round_id = p_round and archived_at is null and current_version_id is not null) then
    raise exception 'Add at least one testing task before publishing' using errcode = '22023';
  end if;
  if not exists (select 1 from testing_objectives where round_id = p_round) then
    raise exception 'Add at least one testing objective before publishing' using errcode = '22023';
  end if;
  if btrim(r.summary) = '' then raise exception 'Explain what testers will be asked to do' using errcode = '22023'; end if;
  if r.application_deadline is not null and r.application_deadline <= now() then
    raise exception 'The application deadline is in the past' using errcode = '22023';
  end if;
  update testing_rounds set status = 'published', published_at = now() where id = p_round;
  perform public._audit('round.publish', 'testing_round', p_round, null);
end $$;

create or replace function public.close_round(p_round uuid, p_status text default 'closed') returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_round_creator(p_round);
  if p_status not in ('closed','completed','archived') then raise exception 'Invalid status' using errcode = '22023'; end if;
  update testing_rounds set status = p_status where id = p_round and status <> 'draft';
  if not found then raise exception 'Round is still a draft' using errcode = '22023'; end if;
  perform public._audit('round.' || p_status, 'testing_round', p_round, null);
end $$;

create or replace function public._insert_task_version(p_task uuid, p_def jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_num int;
begin
  select coalesce(max(version_number), 0) + 1 into v_num from testing_task_versions where task_id = p_task;
  insert into testing_task_versions (task_id, version_number, title, description, scenario, instructions, expected_result,
    success_criteria, measures, estimated_minutes, task_type, required_evidence, feedback_questions, allow_skip, created_by)
  values (p_task, v_num,
    p_def ->> 'title', p_def ->> 'description', p_def ->> 'scenario',
    coalesce(p_def -> 'instructions', '[]'::jsonb), p_def ->> 'expected_result',
    coalesce(p_def -> 'success_criteria', '[]'::jsonb), coalesce(p_def -> 'measures', '[]'::jsonb),
    nullif(p_def ->> 'estimated_minutes', '')::int,
    coalesce(p_def ->> 'task_type', 'guided_scenario'),
    coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_def -> 'required_evidence', '[]'::jsonb)) x), '{}'),
    coalesce(p_def -> 'feedback_questions', '[]'::jsonb),
    coalesce((p_def ->> 'allow_skip')::boolean, false), auth.uid())
  returning id into v_id;
  update testing_tasks set current_version_id = v_id where id = p_task;
  return v_id;
end $$;

-- Create a task (p_task null) or publish a new version of an existing one. Past sessions keep
-- pointing at the version they were started with.
create or replace function public.save_task(p_round uuid, p_task uuid, p_def jsonb,
  p_is_required boolean default true, p_depends_on uuid default null, p_template uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_task uuid := p_task;
begin
  perform public._require_round_creator(p_round);
  if coalesce(btrim(p_def ->> 'title'), '') = '' then raise exception 'A task needs a title' using errcode = '22023'; end if;
  if p_depends_on is not null and not exists (select 1 from testing_tasks where id = p_depends_on and round_id = p_round) then
    raise exception 'A task can only depend on a task in the same round' using errcode = '22023';
  end if;
  if v_task is null then
    insert into testing_tasks (round_id, template_id, position, is_required, depends_on_task_id)
    values (p_round, p_template,
            (select coalesce(max(position), 0) + 1 from testing_tasks where round_id = p_round),
            not coalesce((p_def ->> 'allow_skip')::boolean, false) and coalesce(p_is_required, true), p_depends_on)
    returning id into v_task;
  else
    update testing_tasks set is_required = coalesce(p_is_required, is_required), depends_on_task_id = p_depends_on
    where id = v_task and round_id = p_round;
    if not found then raise exception 'Task not found in this round' using errcode = '22023'; end if;
  end if;
  perform public._insert_task_version(v_task, p_def);
  return v_task;
end $$;

create or replace function public.reorder_tasks(p_round uuid, p_task_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_round_creator(p_round);
  update testing_tasks t set position = o.ord
  from unnest(p_task_ids) with ordinality as o(id, ord)
  where t.id = o.id and t.round_id = p_round;
end $$;

create or replace function public.archive_task(p_task uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_round uuid;
begin
  select round_id into v_round from testing_tasks where id = p_task;
  perform public._require_round_creator(v_round);
  update testing_tasks set archived_at = now() where id = p_task;
  update testing_tasks set depends_on_task_id = null where depends_on_task_id = p_task;
end $$;

create or replace function public.save_task_as_template(p_task uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v testing_task_versions; v_round uuid; v_id uuid;
begin
  select t.round_id into v_round from testing_tasks t where t.id = p_task;
  perform public._require_round_creator(v_round);
  select tv.* into v from testing_tasks t join testing_task_versions tv on tv.id = t.current_version_id where t.id = p_task;
  insert into task_templates (owner_id, title, task_type, definition)
  values (auth.uid(), v.title, v.task_type,
    to_jsonb(v) - array['id','task_id','version_number','created_by','created_at'])
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.add_task_from_template(p_round uuid, p_template uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare tpl task_templates;
begin
  select * into tpl from task_templates where id = p_template and (is_public or owner_id = public.app_uid());
  if not found then raise exception 'Template not found' using errcode = '22023'; end if;
  return public.save_task(p_round, null, tpl.definition, true, null, tpl.id);
end $$;

-- New round for a (usually newer) release, cloned from an earlier round. Nothing in the source
-- round, its sessions or its reports is touched.
create or replace function public.create_followup_round(p_source_round uuid, p_release uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare src testing_rounds; v_new uuid; t record; v_task uuid; v_map jsonb := '{}'::jsonb;
begin
  perform public._require_round_creator(p_source_round);
  select * into src from testing_rounds where id = p_source_round;
  if not exists (select 1 from product_releases where id = p_release and product_id = src.product_id) then
    raise exception 'That release belongs to a different product' using errcode = '22023';
  end if;
  insert into testing_rounds (product_id, release_id, previous_round_id, round_number, title, status, summary, target_audience,
    cohort_size, expected_minutes_min, expected_minutes_max, supported_devices, countries, reward_type, reward_details,
    privacy_requirements, beginner_friendly, instructions, access_instructions, support_contact, application_form,
    evidence_retention_days)
  select src.product_id, p_release, src.id,
    (select max(round_number) + 1 from testing_rounds where product_id = src.product_id),
    src.title, 'draft', src.summary, src.target_audience, src.cohort_size, src.expected_minutes_min, src.expected_minutes_max,
    src.supported_devices, src.countries, src.reward_type, src.reward_details, src.privacy_requirements, src.beginner_friendly,
    src.instructions, src.access_instructions, src.support_contact, src.application_form, src.evidence_retention_days
  returning id into v_new;
  insert into testing_objectives (round_id, objective, sort_order)
  select v_new, objective, sort_order from testing_objectives where round_id = p_source_round;
  for t in select tk.*, to_jsonb(tv) as def from testing_tasks tk join testing_task_versions tv on tv.id = tk.current_version_id
           where tk.round_id = p_source_round and tk.archived_at is null order by tk.position loop
    insert into testing_tasks (round_id, template_id, position, is_required)
    values (v_new, t.template_id, t.position, t.is_required) returning id into v_task;
    perform public._insert_task_version(v_task, t.def);
    v_map := v_map || jsonb_build_object(t.id::text, v_task);
  end loop;
  update testing_tasks n set depends_on_task_id = (v_map ->> o.depends_on_task_id::text)::uuid
  from testing_tasks o
  where o.round_id = p_source_round and o.depends_on_task_id is not null
    and n.id = (v_map ->> o.id::text)::uuid and v_map ? o.depends_on_task_id::text;
  perform public._audit('round.followup', 'testing_round', v_new, jsonb_build_object('source_round', p_source_round));
  return v_new;
end $$;

-- ================================================================ applications
create or replace function public.submit_application(p_application uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a tester_applications; r testing_rounds; st jsonb; q jsonb; v jsonb;
begin
  select * into a from tester_applications where id = p_application and tester_id = public.app_uid() for update;
  if not found then raise exception 'Application not found' using errcode = '22023'; end if;
  if a.status not in ('draft','info_requested') then raise exception 'This application has already been submitted' using errcode = '22023'; end if;
  select * into r from testing_rounds where id = a.round_id;
  if r.status <> 'published' then raise exception 'This testing round is not accepting applications' using errcode = '22023'; end if;
  if r.application_deadline is not null and r.application_deadline < now() then
    raise exception 'The application deadline has passed' using errcode = '22023';
  end if;
  for st in select * from jsonb_array_elements(coalesce(r.application_form -> 'steps', '[]'::jsonb)) loop
    for q in select * from jsonb_array_elements(coalesce(st -> 'questions', '[]'::jsonb)) loop
      if coalesce((q ->> 'required')::boolean, false) then
        v := a.answers -> (q ->> 'key');
        if v is null or v in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)
           or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '') then
          raise exception 'Please answer: %', q ->> 'label' using errcode = '22023';
        end if;
      end if;
    end loop;
  end loop;
  if cardinality(a.available_days) = 0 then raise exception 'Please choose the days you are available' using errcode = '22023'; end if;
  if not (a.confirm_device_access and a.confirm_time_commitment and a.confirm_instructions and a.accept_terms) then
    raise exception 'Please confirm device access, time commitment, the instructions and the participation terms' using errcode = '22023';
  end if;
  -- optional recording consents are deliberately NOT checked
  update tester_applications set status = 'submitted', submitted_at = now(), creator_message = null where id = a.id;
  perform public._notify(public._round_creator(a.round_id), 'application.submitted', 'New tester application',
    'Someone applied to test ' || r.title, jsonb_build_object('screen', 'creator_application', 'id', a.id));
  perform public._notify(a.tester_id, 'application.received', 'Application received',
    'We passed your application to the product team. You will hear back here.',
    jsonb_build_object('screen', 'application', 'id', a.id));
  perform public._activity(a.round_id, null, 'application.submitted', jsonb_build_object('application_id', a.id));
  perform public._audit('application.submit', 'tester_application', a.id, null);
end $$;

create or replace function public.withdraw_application(p_application uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a tester_applications;
begin
  select * into a from tester_applications where id = p_application and tester_id = public.app_uid() for update;
  if not found then raise exception 'Application not found' using errcode = '22023'; end if;
  if a.status in ('withdrawn','declined','draft') then raise exception 'Nothing to withdraw' using errcode = '22023'; end if;
  if exists (select 1 from test_sessions s join tester_assignments ta on ta.id = s.assignment_id where ta.application_id = a.id) then
    raise exception 'Testing has already started; leave the test from the session screen instead' using errcode = '22023';
  end if;
  update tester_assignments set status = 'declined', responded_at = now() where application_id = a.id;
  update tester_applications set status = 'withdrawn' where id = a.id;
  perform public._activity(a.round_id, null, 'application.withdrawn', jsonb_build_object('application_id', a.id));
  perform public._audit('application.withdraw', 'tester_application', a.id, null);
end $$;

-- Creator decision. Approval never creates an assignment; cohort capacity is checked under a
-- row lock on the round so concurrent approvals cannot overbook it.
create or replace function public.review_application(p_application uuid, p_decision text, p_message text default null) returns void
language plpgsql security definer set search_path = public as $$
declare a tester_applications; r testing_rounds; v_approved int; v_title text; v_body text;
begin
  select * into a from tester_applications where id = p_application;
  if not found then raise exception 'Application not found' using errcode = '22023'; end if;
  perform public._require_round_creator(a.round_id);
  if p_decision not in ('under_review','approved','waitlisted','declined','info_requested') then
    raise exception 'Unknown decision' using errcode = '22023';
  end if;
  select * into r from testing_rounds where id = a.round_id for update;          -- serialises decisions per round
  select * into a from tester_applications where id = p_application for update;
  if a.status in ('draft','withdrawn') then raise exception 'This application is not awaiting review' using errcode = '22023'; end if;
  if a.status = p_decision then return; end if;
  if exists (select 1 from tester_assignments where application_id = a.id and status not in ('declined','removed')) then
    raise exception 'This tester is already assigned; remove the assignment first' using errcode = '22023';
  end if;
  if p_decision = 'info_requested' and coalesce(btrim(p_message), '') = '' then
    raise exception 'Tell the tester what information you need' using errcode = '22023';
  end if;
  if p_decision = 'approved' then
    select count(*) into v_approved from tester_applications where round_id = a.round_id and status = 'approved';
    if v_approved >= r.cohort_size then
      raise exception 'The cohort is full (% of % places approved). Waitlist this tester instead.', v_approved, r.cohort_size
        using errcode = '23514';
    end if;
  end if;
  update tester_applications set status = p_decision, creator_message = nullif(btrim(coalesce(p_message, '')), ''),
    decided_at = case when p_decision in ('approved','waitlisted','declined') then now() else decided_at end,
    decided_by = case when p_decision in ('approved','waitlisted','declined') then auth.uid() else decided_by end
  where id = a.id;
  v_title := case p_decision when 'approved' then 'You''re approved!' when 'waitlisted' then 'You''re on the waitlist'
    when 'declined' then 'Application update' when 'info_requested' then 'One more thing needed' else 'Application under review' end;
  v_body := case p_decision
    when 'approved' then 'Your application to test ' || r.title || ' was approved. The team will send your testing invitation next.'
    when 'waitlisted' then 'All places are currently taken for ' || r.title || '. You will be told if a place opens up.'
    when 'declined' then 'Thanks for applying to ' || r.title || '. You were not selected for this round.'
    when 'info_requested' then coalesce(p_message, '')
    else 'The team is looking at your application for ' || r.title || '.' end;
  perform public._notify(a.tester_id, 'application.' || p_decision, v_title, v_body,
    jsonb_build_object('screen', 'application', 'id', a.id));
  perform public._activity(a.round_id, null, 'application.' || p_decision, jsonb_build_object('application_id', a.id));
  perform public._audit('application.' || p_decision, 'tester_application', a.id, jsonb_build_object('from', a.status));
end $$;

-- ================================================================ assignments
create or replace function public.assign_tester(p_application uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare a tester_applications; r testing_rounds; v_active int; v_id uuid;
begin
  select * into a from tester_applications where id = p_application;
  if not found then raise exception 'Application not found' using errcode = '22023'; end if;
  perform public._require_round_creator(a.round_id);
  select * into r from testing_rounds where id = a.round_id for update;
  select * into a from tester_applications where id = p_application for update;
  if a.status <> 'approved' then raise exception 'Only an approved tester can be assigned' using errcode = '22023'; end if;
  if r.status <> 'published' then raise exception 'Publish the round before assigning testers' using errcode = '22023'; end if;
  select count(*) into v_active from tester_assignments where round_id = a.round_id and status not in ('declined','removed');
  if v_active >= r.cohort_size then
    raise exception 'All % cohort places are already assigned', r.cohort_size using errcode = '23514';
  end if;
  begin
    insert into tester_assignments (round_id, application_id, tester_id, release_id, assigned_by)
    values (a.round_id, a.id, a.tester_id, r.release_id, auth.uid()) returning id into v_id;
  exception when unique_violation then
    raise exception 'This tester already has an assignment for this round' using errcode = '23505';
  end;
  perform public._notify(a.tester_id, 'assignment.invited', 'Your testing invitation is ready',
    'You have a place in ' || r.title || '. Open it to read the instructions and start.',
    jsonb_build_object('screen', 'assignment', 'id', v_id));
  perform public._activity(a.round_id, null, 'assignment.created', jsonb_build_object('assignment_id', v_id));
  perform public._audit('assignment.create', 'tester_assignment', v_id, null);
  return v_id;
end $$;

create or replace function public.remove_assignment(p_assignment uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s tester_assignments;
begin
  select * into s from tester_assignments where id = p_assignment for update;
  if not found then raise exception 'Assignment not found' using errcode = '22023'; end if;
  perform public._require_round_creator(s.round_id);
  if s.status in ('in_progress','completed') then
    raise exception 'Testing has started; this assignment can no longer be removed' using errcode = '22023';
  end if;
  update tester_assignments set status = 'removed' where id = p_assignment;
  perform public._notify(s.tester_id, 'assignment.removed', 'Testing invitation withdrawn',
    'The product team withdrew this testing invitation.', jsonb_build_object('screen', 'application', 'id', s.application_id));
  perform public._audit('assignment.remove', 'tester_assignment', p_assignment, null);
end $$;

create or replace function public.respond_to_assignment(p_assignment uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare s tester_assignments;
begin
  select * into s from tester_assignments where id = p_assignment and tester_id = public.app_uid() for update;
  if not found then raise exception 'Invitation not found' using errcode = '22023'; end if;
  if s.status <> 'invited' then raise exception 'You have already responded to this invitation' using errcode = '22023'; end if;
  update tester_assignments set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
  where id = p_assignment;
  perform public._notify(public._round_creator(s.round_id), 'assignment.' || case when p_accept then 'accepted' else 'declined' end,
    case when p_accept then 'A tester accepted their invitation' else 'A tester declined their invitation' end, null,
    jsonb_build_object('screen', 'creator_round', 'id', s.round_id));
  perform public._activity(s.round_id, null, 'assignment.' || case when p_accept then 'accepted' else 'declined' end,
    jsonb_build_object('assignment_id', s.id));
end $$;

-- ================================================================ sessions
-- Starts (or returns) the session for an accepted assignment. Records consent, links the session
-- to the exact release and pins the current version of every task.
create or replace function public.start_session(p_assignment uuid, p_acknowledge_instructions boolean,
  p_consent_screenshots boolean default false, p_consent_recordings boolean default false, p_consent_voice boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare s tester_assignments; r testing_rounds; v_session uuid; v_consent uuid;
begin
  select * into s from tester_assignments where id = p_assignment and tester_id = public.app_uid() for update;
  if not found then raise exception 'Assignment not found' using errcode = '22023'; end if;
  select id into v_session from test_sessions where assignment_id = s.id;
  if found then return v_session; end if;
  if s.status <> 'accepted' then raise exception 'Accept the invitation before starting' using errcode = '22023'; end if;
  if not coalesce(p_acknowledge_instructions, false) then
    raise exception 'Please confirm you have read the testing instructions' using errcode = '22023';
  end if;
  select * into r from testing_rounds where id = s.round_id;
  if r.status <> 'published' then raise exception 'This testing round is no longer open' using errcode = '22023'; end if;
  insert into testing_consents (tester_id, round_id, assignment_id, participation, privacy, instructions_acknowledged,
    screenshots, recordings, voice)
  values (s.tester_id, s.round_id, s.id, true, true, true,
    coalesce(p_consent_screenshots, false), coalesce(p_consent_recordings, false), coalesce(p_consent_voice, false))
  returning id into v_consent;
  insert into test_sessions (assignment_id, tester_id, round_id, product_id, release_id, consent_id)
  values (s.id, s.tester_id, s.round_id, r.product_id, s.release_id, v_consent) returning id into v_session;
  insert into task_completions (session_id, task_id, task_version_id, position, is_required, allow_skip, depends_on_task_id)
  select v_session, t.id, t.current_version_id, t.position, t.is_required, v.allow_skip, t.depends_on_task_id
  from testing_tasks t join testing_task_versions v on v.id = t.current_version_id
  where t.round_id = s.round_id and t.archived_at is null;
  update tester_assignments set status = 'in_progress' where id = s.id;
  perform public._activity(s.round_id, v_session, 'session.started', null);
  perform public._audit('session.start', 'test_session', v_session, jsonb_build_object('release_id', s.release_id));
  return v_session;
end $$;

create or replace function public._own_session(p_session uuid, p_must_be_active boolean) returns test_sessions
language plpgsql security definer set search_path = public as $$
declare s test_sessions;
begin
  select * into s from test_sessions where id = p_session and tester_id = public.app_uid() for update;
  if not found then raise exception 'Session not found' using errcode = '22023'; end if;
  if p_must_be_active and s.status <> 'active' then
    raise exception 'This session is % — resume it to continue', s.status using errcode = '22023';
  end if;
  return s;
end $$;

create or replace function public.pause_session(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s test_sessions;
begin
  s := public._own_session(p_session, true);
  update task_completions set active_seconds = active_seconds + greatest(extract(epoch from now() - last_resumed_at)::int, 0),
    last_resumed_at = null where session_id = s.id and status = 'in_progress' and last_resumed_at is not null;
  update test_sessions set status = 'paused', paused_at = now(), last_activity_at = now() where id = s.id;
  perform public._activity(s.round_id, s.id, 'session.paused', null);
end $$;

create or replace function public.resume_session(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s test_sessions;
begin
  s := public._own_session(p_session, false);
  if s.status <> 'paused' then return; end if;
  update task_completions set last_resumed_at = now() where session_id = s.id and status = 'in_progress';
  update test_sessions set status = 'active', paused_at = null, last_activity_at = now() where id = s.id;
  perform public._activity(s.round_id, s.id, 'session.resumed', null);
end $$;

create or replace function public.leave_session(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s test_sessions;
begin
  s := public._own_session(p_session, false);
  if s.status = 'completed' then raise exception 'This test is already complete' using errcode = '22023'; end if;
  update test_sessions set status = 'abandoned', last_activity_at = now() where id = s.id;
  perform public._activity(s.round_id, s.id, 'session.abandoned', null);
end $$;

-- ================================================================ task engine (tester)
create or replace function public.start_task(p_completion uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c task_completions; s test_sessions; dep text;
begin
  select * into c from task_completions where id = p_completion;
  if not found then raise exception 'Task not found' using errcode = '22023'; end if;
  s := public._own_session(c.session_id, true);
  if c.status = 'in_progress' then return; end if;
  if c.status <> 'not_started' then raise exception 'This task is already finished' using errcode = '22023'; end if;
  if c.depends_on_task_id is not null then
    select status into dep from task_completions where session_id = c.session_id and task_id = c.depends_on_task_id;
    if dep is not null and dep in ('not_started','in_progress') then
      raise exception 'Finish the earlier task this one builds on first' using errcode = '22023';
    end if;
  end if;
  update task_completions set status = 'in_progress', started_at = now(), last_resumed_at = now() where id = c.id;
  update test_sessions set last_activity_at = now() where id = s.id;
  perform public._activity(s.round_id, s.id, 'task.started', jsonb_build_object('task_id', c.task_id));
end $$;

-- Completes a task and stores the tester's own feedback. "Could not complete" is recorded as a
-- blocked task, never coerced into a success.
create or replace function public.complete_task(p_completion uuid, p_difficulty text, p_help_requested boolean,
  p_had_problem boolean, p_comment text default null, p_answers jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare c task_completions; s test_sessions; v_feedback uuid; v_status text;
begin
  select * into c from task_completions where id = p_completion;
  if not found then raise exception 'Task not found' using errcode = '22023'; end if;
  s := public._own_session(c.session_id, true);
  if c.status <> 'in_progress' then raise exception 'Start the task before completing it' using errcode = '22023'; end if;
  if p_difficulty is null or p_difficulty not in ('very_easy','easy','somewhat_difficult','difficult','could_not_complete') then
    raise exception 'Tell us how the task went' using errcode = '22023';
  end if;
  v_status := case when p_difficulty = 'could_not_complete' then 'blocked' else 'completed' end;
  update task_completions set status = v_status, completed_at = now(),
    active_seconds = active_seconds + greatest(extract(epoch from now() - coalesce(last_resumed_at, now()))::int, 0),
    last_resumed_at = null, help_requested = coalesce(p_help_requested, false), difficulty = p_difficulty,
    had_problem = coalesce(p_had_problem, false)
  where id = c.id;
  insert into tester_feedback (session_id, task_completion_id, tester_id, kind, difficulty, help_requested, comment, answers)
  values (s.id, c.id, s.tester_id, 'task', p_difficulty, coalesce(p_help_requested, false),
          nullif(btrim(coalesce(p_comment, '')), ''), coalesce(p_answers, '{}'::jsonb))
  returning id into v_feedback;
  update test_sessions set last_activity_at = now() where id = s.id;
  perform public._activity(s.round_id, s.id, 'task.' || v_status, jsonb_build_object('task_id', c.task_id));
  return v_feedback;
end $$;

create or replace function public.skip_task(p_completion uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare c task_completions; s test_sessions;
begin
  select * into c from task_completions where id = p_completion;
  if not found then raise exception 'Task not found' using errcode = '22023'; end if;
  s := public._own_session(c.session_id, true);
  if c.is_required and not c.allow_skip then raise exception 'This task cannot be skipped' using errcode = '22023'; end if;
  if c.status not in ('not_started','in_progress') then raise exception 'This task is already finished' using errcode = '22023'; end if;
  update task_completions set status = 'skipped', completed_at = now(), last_resumed_at = null where id = c.id;
  if nullif(btrim(coalesce(p_reason, '')), '') is not null then
    insert into tester_feedback (session_id, task_completion_id, tester_id, kind, comment)
    values (s.id, c.id, s.tester_id, 'task', btrim(p_reason));
  end if;
  update test_sessions set last_activity_at = now() where id = s.id;
  perform public._activity(s.round_id, s.id, 'task.skipped', jsonb_build_object('task_id', c.task_id));
end $$;

-- ================================================================ bug reports
create or replace function public.report_bug(p_session uuid, p_completion uuid, p_title text, p_expected text, p_actual text,
  p_steps text, p_severity text, p_device text default null, p_os text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare s test_sessions; c task_completions; v_version text; v_id uuid;
begin
  s := public._own_session(p_session, false);
  if s.status = 'abandoned' then raise exception 'This session was left' using errcode = '22023'; end if;
  if p_completion is not null then
    select * into c from task_completions where id = p_completion and session_id = s.id;
    if not found then raise exception 'That task is not part of this session' using errcode = '22023'; end if;
  end if;
  select version into v_version from product_releases where id = s.release_id;
  insert into bug_reports (session_id, round_id, product_id, release_id, tester_id, task_completion_id, task_id, title,
    expected_result, actual_result, steps_to_reproduce, severity, device, operating_system, product_version)
  values (s.id, s.round_id, s.product_id, s.release_id, s.tester_id, c.id, c.task_id, btrim(p_title),
    btrim(p_expected), btrim(p_actual), btrim(p_steps), p_severity, nullif(btrim(coalesce(p_device, '')), ''),
    nullif(btrim(coalesce(p_os, '')), ''), v_version)
  returning id into v_id;
  insert into bug_triage (bug_id) values (v_id);
  update test_sessions set last_activity_at = now() where id = s.id;
  perform public._notify(public._round_creator(s.round_id), 'bug.reported', 'New ' || p_severity || ' issue reported',
    btrim(p_title), jsonb_build_object('screen', 'creator_bug', 'id', v_id));
  perform public._activity(s.round_id, s.id, 'bug.reported', jsonb_build_object('bug_id', v_id, 'severity', p_severity));
  return v_id;
end $$;

-- Creator triage. The tester's report row is never touched: state lives in bug_triage and every
-- action is appended to bug_report_events.
create or replace function public.triage_bug(p_bug uuid, p_action text, p_note text default null, p_category text default null,
  p_assignee uuid default null, p_duplicate_of uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare b bug_reports; t bug_triage; v_to text;
begin
  select * into b from bug_reports where id = p_bug;
  if not found then raise exception 'Issue not found' using errcode = '22023'; end if;
  perform public._require_round_creator(b.round_id);
  select * into t from bug_triage where bug_id = p_bug for update;
  v_to := case p_action
    when 'review' then 'reviewed' when 'categorise' then t.status when 'assign' then 'in_progress'
    when 'mark_duplicate' then 'duplicate' when 'mark_fixed' then 'fixed' when 'request_info' then 'needs_info'
    when 'close' then 'closed' when 'reopen' then 'reviewed' when 'note' then t.status else null end;
  if v_to is null then raise exception 'Unknown action' using errcode = '22023'; end if;
  if p_action = 'mark_duplicate' then
    if p_duplicate_of is null or p_duplicate_of = p_bug
       or not exists (select 1 from bug_reports where id = p_duplicate_of and product_id = b.product_id) then
      raise exception 'Choose the original issue this one duplicates' using errcode = '22023';
    end if;
  end if;
  if p_action in ('request_info','note') and coalesce(btrim(p_note), '') = '' then
    raise exception 'Write a note' using errcode = '22023';
  end if;
  if p_action = 'categorise' and coalesce(btrim(p_category), '') = '' then
    raise exception 'Choose a category' using errcode = '22023';
  end if;
  update bug_triage set status = v_to,
    category = case when p_action = 'categorise' then btrim(p_category) else category end,
    assignee_id = case when p_action = 'assign' then coalesce(p_assignee, auth.uid()) else assignee_id end,
    duplicate_of = case when p_action = 'mark_duplicate' then p_duplicate_of when p_action = 'reopen' then null else duplicate_of end,
    updated_at = now()
  where bug_id = p_bug;
  insert into bug_report_events (bug_id, actor_id, actor_role, event_type, from_status, to_status, note)
  values (p_bug, auth.uid(), 'creator', p_action, t.status, v_to,
    coalesce(nullif(btrim(coalesce(p_note, '')), ''), case when p_action = 'categorise' then 'Category: ' || btrim(p_category) end));
  if p_action = 'request_info' then
    perform public._notify(b.tester_id, 'bug.info_requested', 'A question about your issue report', btrim(p_note),
      jsonb_build_object('screen', 'bug', 'id', p_bug));
  end if;
end $$;

create or replace function public.reply_to_bug(p_bug uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare b bug_reports; t bug_triage;
begin
  select * into b from bug_reports where id = p_bug and tester_id = public.app_uid();
  if not found then raise exception 'Issue not found' using errcode = '22023'; end if;
  if coalesce(btrim(p_note), '') = '' then raise exception 'Write a reply' using errcode = '22023'; end if;
  select * into t from bug_triage where bug_id = p_bug for update;
  insert into bug_report_events (bug_id, actor_id, actor_role, event_type, from_status, to_status, note)
  values (p_bug, auth.uid(), 'tester', 'tester_reply', t.status,
          case when t.status = 'needs_info' then 'reviewed' else t.status end, btrim(p_note));
  update bug_triage set status = case when status = 'needs_info' then 'reviewed' else status end, updated_at = now() where bug_id = p_bug;
  perform public._notify(public._round_creator(b.round_id), 'bug.reply', 'A tester replied on an issue', btrim(p_note),
    jsonb_build_object('screen', 'creator_bug', 'id', p_bug));
end $$;

-- ================================================================ final verdict
create or replace function public.submit_verdict(p_session uuid, p_rating int, p_would_use text, p_biggest_improvement text,
  p_verdict text, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare s test_sessions; v_open int; v_id uuid;
begin
  s := public._own_session(p_session, true);
  select count(*) into v_open from task_completions
  where session_id = s.id and is_required and status not in ('completed','blocked')
    and not (allow_skip and status = 'skipped');          -- a skippable task that was skipped never traps the tester
  if v_open > 0 then
    raise exception '% required task(s) still need to be finished before the final review', v_open using errcode = '22023';
  end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Please explain the reason for your verdict' using errcode = '22023'; end if;
  begin
    insert into tester_verdicts (session_id, round_id, release_id, tester_id, rating, would_use, biggest_improvement, verdict, reason)
    values (s.id, s.round_id, s.release_id, s.tester_id, p_rating, p_would_use, btrim(coalesce(p_biggest_improvement, '')),
            p_verdict, btrim(p_reason))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'A verdict was already submitted. Record a correction as an amendment instead.' using errcode = '23505';
  end;
  update test_sessions set status = 'completed', completed_at = now(), last_activity_at = now() where id = s.id;
  update tester_assignments set status = 'completed' where id = s.assignment_id;
  perform public._notify(public._round_creator(s.round_id), 'verdict.submitted', 'A tester finished testing',
    'Their feedback and verdict are ready to review.', jsonb_build_object('screen', 'creator_round', 'id', s.round_id));
  perform public._activity(s.round_id, s.id, 'verdict.submitted', jsonb_build_object('verdict_id', v_id));
  perform public._audit('verdict.submit', 'tester_verdict', v_id, null);
  return v_id;
end $$;

-- Corrections never overwrite the original verdict; they are appended with a timestamp.
create or replace function public.amend_verdict(p_verdict uuid, p_reason text, p_rating int default null,
  p_would_use text default null, p_biggest_improvement text default null, p_new_verdict text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v tester_verdicts; v_id uuid;
begin
  select * into v from tester_verdicts where id = p_verdict and tester_id = public.app_uid();
  if not found then raise exception 'Verdict not found' using errcode = '22023'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Explain why you are amending your verdict' using errcode = '22023'; end if;
  if p_rating is null and p_would_use is null and p_biggest_improvement is null and p_new_verdict is null then
    raise exception 'Nothing to amend' using errcode = '22023';
  end if;
  insert into verdict_amendments (verdict_id, tester_id, rating, would_use, biggest_improvement, verdict, reason)
  values (v.id, v.tester_id, p_rating, p_would_use, nullif(btrim(coalesce(p_biggest_improvement, '')), ''), p_new_verdict, btrim(p_reason))
  returning id into v_id;
  perform public._activity(v.round_id, v.session_id, 'verdict.amended', jsonb_build_object('amendment_id', v_id));
  perform public._audit('verdict.amend', 'tester_verdict', v.id, jsonb_build_object('amendment_id', v_id));
  return v_id;
end $$;

-- ================================================================ validation reports & improvements
-- Queues a report. The server-side job (edge function) then fills it in with the service role.
create or replace function public.request_validation_report(p_round uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare r testing_rounds; v_id uuid;
begin
  perform public._require_round_creator(p_round);
  select * into r from testing_rounds where id = p_round;
  insert into validation_reports (round_id, product_id, release_id, generated_by)
  values (r.id, r.product_id, r.release_id, auth.uid()) returning id into v_id;
  perform public._audit('report.request', 'validation_report', v_id, null);
  return v_id;
end $$;

create or replace function public.review_finding(p_finding uuid, p_status text, p_title text default null, p_body text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_product uuid;
begin
  select r.product_id into v_product from validation_report_findings f join validation_reports r on r.id = f.report_id where f.id = p_finding;
  if v_product is null or not public.is_product_creator(v_product) then
    raise exception 'Finding not found' using errcode = '22023';
  end if;
  if p_status not in ('pending','approved','rejected') then raise exception 'Invalid status' using errcode = '22023'; end if;
  update validation_report_findings set review_status = p_status,
    edited_title = nullif(btrim(coalesce(p_title, '')), ''), edited_body = nullif(btrim(coalesce(p_body, '')), ''),
    reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_finding;
  perform public._audit('finding.' || p_status, 'validation_report_finding', p_finding, null);
end $$;

create or replace function public.create_project_task_from_finding(p_finding uuid, p_title text, p_description text default null,
  p_owner uuid default null, p_owner_name text default null, p_priority text default 'medium', p_due date default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare f validation_report_findings; r validation_reports; v_id uuid;
begin
  select * into f from validation_report_findings where id = p_finding;
  if found then select * into r from validation_reports where id = f.report_id; end if;
  if r.id is null or not public.is_product_creator(r.product_id) then raise exception 'Finding not found' using errcode = '22023'; end if;
  if f.review_status <> 'approved' then
    raise exception 'Approve the finding before turning it into a project task' using errcode = '22023';
  end if;
  insert into project_tasks (product_id, round_id, finding_id, title, description, owner_id, owner_name, priority, due_date, created_by)
  values (r.product_id, r.round_id, f.id, btrim(p_title), p_description, p_owner, nullif(btrim(coalesce(p_owner_name, '')), ''),
          coalesce(p_priority, 'medium'), p_due, auth.uid())
  returning id into v_id;
  perform public._audit('project_task.create', 'project_task', v_id, jsonb_build_object('finding_id', f.id));
  return v_id;
end $$;

-- ================================================================ privacy: deletion & retention
-- Removes the caller's private data immediately and queues the account + stored files for purge
-- by a privileged job. Submitted feedback stays, anonymised, so creators' reports remain intact.
create or replace function public.request_account_deletion() returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := public.app_uid();
begin
  if exists (select 1 from products p join testing_rounds r on r.product_id = p.id
             where p.creator_id = u and r.status = 'published') then
    raise exception 'Close your published testing rounds before deleting your account' using errcode = '22023';
  end if;
  update tester_assignments set status = 'removed' where tester_id = u and status in ('invited','accepted');
  update tester_applications set status = 'withdrawn', answers = '{}'::jsonb, available_days = '{}', creator_message = null
  where tester_id = u;
  update test_sessions set status = 'abandoned' where tester_id = u and status in ('active','paused');
  update profiles set display_name = 'Deleted user', bio = null, country = null, devices = '{}', skills = '{}', deleted_at = now()
  where id = u;
  delete from notifications where user_id = u;
  insert into deletion_requests (user_id) values (u);
  perform public._audit('account.deletion_requested', 'profile', u, null);
end $$;

-- For a scheduled job (service role): drops evidence rows past the round's retention window and
-- returns the storage paths that must then be removed through the Storage API.
create or replace function public.purge_expired_evidence() returns table (storage_path text)
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('fstb.retention_purge', 'on', true);
  return query
    with gone as (
      delete from evidence_files e using test_sessions s, testing_rounds r
      where s.id = e.session_id and r.id = s.round_id and e.created_at < now() - make_interval(days => r.evidence_retention_days)
      returning e.storage_path),
    gone_bugs as (
      delete from bug_attachments e using test_sessions s, testing_rounds r
      where s.id = e.session_id and r.id = s.round_id and e.created_at < now() - make_interval(days => r.evidence_retention_days)
      returning e.storage_path)
    select g.storage_path from gone g union all select g.storage_path from gone_bugs g;
  perform set_config('fstb.retention_purge', 'off', true);
end $$;

-- ================================================================ execute privileges
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.purge_expired_evidence() from authenticated;
revoke execute on function public._notify(uuid, text, text, text, jsonb) from authenticated;
revoke execute on function public._activity(uuid, uuid, text, jsonb) from authenticated;
revoke execute on function public._audit(text, text, uuid, jsonb) from authenticated;
revoke execute on function public._insert_task_version(uuid, jsonb) from authenticated;
grant execute on function public.listing_stats(uuid), public.listing_task_outline(uuid) to anon;
grant execute on function public.is_product_creator(uuid), public.is_round_creator(uuid), public.has_round_access(uuid),
  public.is_round_participant(uuid), public.round_is_public(uuid), public.product_is_visible(uuid),
  public.profile_is_visible(uuid) to anon;

-- ================================================================ private evidence storage
insert into storage.buckets (id, name, public, file_size_limit)
values ('evidence', 'evidence', false, 52428800)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit)
values ('product-assets', 'product-assets', true, 10485760)
on conflict (id) do nothing;

-- Object path convention:  evidence/<session_id>/<file>  — readable only by the session's tester
-- and the product creator, always through short-lived signed URLs.
create policy evidence_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence' and public.owns_session(((storage.foldername(name))[1])::uuid));
create policy evidence_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'evidence' and (public.owns_session(((storage.foldername(name))[1])::uuid)
         or public.creator_of_session(((storage.foldername(name))[1])::uuid)));
create policy product_assets_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-assets' and public.is_product_creator(((storage.foldername(name))[1])::uuid));
create policy product_assets_objects_select on storage.objects for select
  using (bucket_id = 'product-assets');
