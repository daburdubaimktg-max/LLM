-- Read models (one authorised JSON document per screen) and the report job's data functions.
-- Each read function checks the caller itself, so no screen can receive another user's private rows.

create or replace function public._stats(p_round uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(s) - 'round_id' from public.listing_stats(p_round) s
$$;

create or replace function public._outline(p_round uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(o) order by o.position), '[]'::jsonb) from public.listing_task_outline(p_round) o
$$;

create or replace function public._listing(p_round uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'round', to_jsonb(r) - array['application_form','instructions','access_instructions','evidence_retention_days'],
    'product', to_jsonb(p) - array['deleted_at','creator_id'],
    'release', jsonb_build_object('id', rel.id, 'version', rel.version, 'notes', rel.notes),
    'creator', (select jsonb_build_object('id', pr.id, 'display_name', pr.display_name, 'bio', pr.bio, 'is_demo', pr.is_demo)
                from profiles pr where pr.id = p.creator_id),
    'assets', (select coalesce(jsonb_agg(to_jsonb(a) order by a.sort_order), '[]'::jsonb) from product_assets a where a.product_id = p.id),
    'objectives', (select coalesce(jsonb_agg(o.objective order by o.sort_order), '[]'::jsonb) from testing_objectives o where o.round_id = r.id),
    'stats', public._stats(r.id),
    'outline', public._outline(r.id))
  from testing_rounds r join products p on p.id = r.product_id join product_releases rel on rel.id = r.release_id
  where r.id = p_round
$$;

-- Public marketplace.
create or replace function public.marketplace() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public._listing(r.id) order by r.published_at desc), '[]'::jsonb)
  from testing_rounds r join products p on p.id = r.product_id
  where r.status = 'published' and p.deleted_at is null
$$;

-- One listing, plus the application form and the caller's own application (if any).
create or replace function public.round_detail(p_round uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r testing_rounds;
begin
  select * into r from testing_rounds where id = p_round;
  if not found or not (r.status = 'published' or public.is_product_creator(r.product_id) or public.is_round_participant(r.id)) then
    raise exception 'Testing round not found' using errcode = '22023';
  end if;
  return public._listing(p_round) || jsonb_build_object(
    'application_form', r.application_form,
    'is_creator', public.is_product_creator(r.product_id),
    'my_application', (select to_jsonb(a) from tester_applications a where a.round_id = p_round and a.tester_id = auth.uid()),
    'my_assignment', (select jsonb_build_object('id', s.id, 'status', s.status) from tester_assignments s
                      where s.round_id = p_round and s.tester_id = auth.uid()));
end $$;

-- Everything the signed-in tester has applied to / is testing / has finished.
create or replace function public.my_testing() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'application', to_jsonb(a) - 'answers',
    'round', jsonb_build_object('id', r.id, 'title', r.title, 'status', r.status, 'testing_deadline', r.testing_deadline,
      'expected_minutes_min', r.expected_minutes_min, 'expected_minutes_max', r.expected_minutes_max),
    'product', jsonb_build_object('id', p.id, 'name', p.name, 'category', p.category),
    'release', jsonb_build_object('version', rel.version),
    'assignment', (select to_jsonb(s) from tester_assignments s where s.application_id = a.id),
    'session', (select jsonb_build_object('id', ts.id, 'status', ts.status, 'started_at', ts.started_at, 'completed_at', ts.completed_at,
        'tasks_total', (select count(*) from task_completions c where c.session_id = ts.id),
        'tasks_done', (select count(*) from task_completions c where c.session_id = ts.id and c.status in ('completed','blocked','skipped')))
      from test_sessions ts join tester_assignments s on s.id = ts.assignment_id where s.application_id = a.id),
    'verdict', (select jsonb_build_object('id', v.id, 'verdict', v.verdict, 'rating', v.rating, 'submitted_at', v.submitted_at)
      from tester_verdicts v join test_sessions ts on ts.id = v.session_id join tester_assignments s on s.id = ts.assignment_id
      where s.application_id = a.id)
  ) order by a.updated_at desc), '[]'::jsonb)
  from tester_applications a join testing_rounds r on r.id = a.round_id join products p on p.id = r.product_id
  join product_releases rel on rel.id = r.release_id
  where a.tester_id = public.app_uid()
$$;

-- Onboarding bundle for one assignment (the tester it belongs to, or the creator).
create or replace function public.assignment_detail(p_assignment uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s tester_assignments; r testing_rounds;
begin
  select * into s from tester_assignments where id = p_assignment;
  if not found or not (s.tester_id = auth.uid() or public.is_round_creator(s.round_id)) then
    raise exception 'Assignment not found' using errcode = '22023';
  end if;
  select * into r from testing_rounds where id = s.round_id;
  return jsonb_build_object(
    'assignment', to_jsonb(s),
    'round', to_jsonb(r) - 'application_form',
    'product', (select to_jsonb(p) - array['deleted_at','creator_id'] from products p where p.id = r.product_id),
    'release', (select to_jsonb(rel) from product_releases rel where rel.id = s.release_id),
    'objectives', (select coalesce(jsonb_agg(o.objective order by o.sort_order), '[]'::jsonb) from testing_objectives o where o.round_id = r.id),
    'outline', public._outline(r.id),
    'application_consents', (select jsonb_build_object('screenshots', a.consent_screenshots, 'recordings', a.consent_recordings, 'voice', a.consent_voice)
                             from tester_applications a where a.id = s.application_id),
    'session_id', (select ts.id from test_sessions ts where ts.assignment_id = s.id));
end $$;

-- A full testing session: tasks at their pinned versions, feedback, evidence, issues, verdict.
create or replace function public.session_detail(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s test_sessions; v_creator boolean;
begin
  select * into s from test_sessions where id = p_session;
  v_creator := found and public.is_round_creator(s.round_id);
  if s.id is null or not (s.tester_id = auth.uid() or v_creator) then
    raise exception 'Session not found' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'session', to_jsonb(s),
    'viewer_role', case when s.tester_id = auth.uid() then 'tester' else 'creator' end,
    'round', (select jsonb_build_object('id', r.id, 'title', r.title, 'testing_deadline', r.testing_deadline, 'support_contact', r.support_contact,
        'access_instructions', r.access_instructions, 'instructions', r.instructions, 'expected_minutes_min', r.expected_minutes_min,
        'expected_minutes_max', r.expected_minutes_max) from testing_rounds r where r.id = s.round_id),
    'product', (select jsonb_build_object('id', p.id, 'name', p.name) from products p where p.id = s.product_id),
    'release', (select jsonb_build_object('id', rel.id, 'version', rel.version, 'access_url', rel.access_url) from product_releases rel where rel.id = s.release_id),
    'consent', (select to_jsonb(c) from testing_consents c where c.id = s.consent_id),
    'tasks', (select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object(
          'version', to_jsonb(v) - array['created_by','created_at'],
          'feedback', (select coalesce(jsonb_agg(to_jsonb(f) order by f.created_at), '[]'::jsonb) from tester_feedback f where f.task_completion_id = c.id),
          'evidence', (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at), '[]'::jsonb) from evidence_files e where e.task_completion_id = c.id)
        ) order by c.position), '[]'::jsonb)
      from task_completions c join testing_task_versions v on v.id = c.task_version_id where c.session_id = s.id),
    'bugs', (select coalesce(jsonb_agg(to_jsonb(b) || jsonb_build_object(
          'triage_status', (select t.status from bug_triage t where t.bug_id = b.id),
          'attachments', (select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at), '[]'::jsonb) from bug_attachments a where a.bug_id = b.id)
        ) order by b.created_at), '[]'::jsonb) from bug_reports b where b.session_id = s.id),
    'verdict', (select to_jsonb(v) || jsonb_build_object(
          'amendments', (select coalesce(jsonb_agg(to_jsonb(am) order by am.created_at), '[]'::jsonb) from verdict_amendments am where am.verdict_id = v.id),
          'evidence', (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at), '[]'::jsonb) from evidence_files e where e.verdict_id = v.id))
      from tester_verdicts v where v.session_id = s.id));
end $$;

create or replace function public.bug_detail(p_bug uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b bug_reports; v_creator boolean;
begin
  select * into b from bug_reports where id = p_bug;
  v_creator := found and public.is_product_creator(b.product_id);
  if b.id is null or not (b.tester_id = auth.uid() or v_creator) then
    raise exception 'Issue not found' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'bug', to_jsonb(b),
    'viewer_role', case when v_creator then 'creator' else 'tester' end,
    'triage', (select to_jsonb(t) from bug_triage t where t.bug_id = b.id),
    'task_title', (select v.title from task_completions c join testing_task_versions v on v.id = c.task_version_id where c.id = b.task_completion_id),
    'reporter', case when v_creator then (select p.display_name from profiles p where p.id = b.tester_id) end,
    'attachments', (select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at), '[]'::jsonb) from bug_attachments a where a.bug_id = b.id),
    'events', (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at), '[]'::jsonb) from bug_report_events e
               where e.bug_id = b.id and (v_creator or e.event_type in ('request_info','tester_reply','mark_fixed','close'))),
    'other_bugs', case when v_creator then (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title) order by o.created_at), '[]'::jsonb)
                   from bug_reports o where o.product_id = b.product_id and o.id <> b.id) else '[]'::jsonb end);
end $$;

create or replace function public._product_bundle(p_product uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(p) || jsonb_build_object(
    'releases', (select coalesce(jsonb_agg(to_jsonb(rel) order by rel.released_at desc, rel.created_at desc), '[]'::jsonb) from product_releases rel where rel.product_id = p.id),
    'assets', (select coalesce(jsonb_agg(to_jsonb(a) order by a.sort_order), '[]'::jsonb) from product_assets a where a.product_id = p.id),
    'rounds', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'title', r.title, 'status', r.status, 'round_number', r.round_number, 'release_id', r.release_id,
        'version', (select rel.version from product_releases rel where rel.id = r.release_id),
        'previous_round_id', r.previous_round_id, 'created_at', r.created_at, 'published_at', r.published_at,
        'stats', public._stats(r.id),
        'sessions_started', (select count(*) from test_sessions s where s.round_id = r.id),
        'sessions_completed', (select count(*) from test_sessions s where s.round_id = r.id and s.status = 'completed'),
        'bugs', (select count(*) from bug_reports b where b.round_id = r.id),
        'reports', (select count(*) from validation_reports v where v.round_id = r.id and v.status = 'completed')
      ) order by r.round_number desc), '[]'::jsonb) from testing_rounds r where r.product_id = p.id),
    'project_tasks', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb) from project_tasks t where t.product_id = p.id))
  from products p where p.id = p_product
$$;

-- Creator home: products with releases, rounds and counters.
create or replace function public.creator_home() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(public._product_bundle(p.id) order by p.created_at), '[]'::jsonb)
  from products p where p.creator_id = public.app_uid() and p.deleted_at is null
$$;

create or replace function public.product_detail(p_product uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_product_creator(p_product) then raise exception 'Product not found' using errcode = '22023'; end if;
  return public._product_bundle(p_product);
end $$;

-- Everything a creator needs to run one round. Counting/filtering happens on these rows, so
-- applications, assignments and completed tests can never be confused with one another.
create or replace function public.creator_round_data(p_round uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r testing_rounds;
begin
  perform public._require_round_creator(p_round);
  select * into r from testing_rounds where id = p_round;
  return jsonb_build_object(
    'round', to_jsonb(r),
    'product', (select to_jsonb(p) from products p where p.id = r.product_id),
    'release', (select to_jsonb(rel) from product_releases rel where rel.id = r.release_id),
    'releases', (select coalesce(jsonb_agg(to_jsonb(rel) order by rel.released_at desc), '[]'::jsonb) from product_releases rel where rel.product_id = r.product_id),
    'objectives', (select coalesce(jsonb_agg(to_jsonb(o) order by o.sort_order), '[]'::jsonb) from testing_objectives o where o.round_id = r.id),
    'stats', public._stats(r.id),
    'tasks', (select coalesce(jsonb_agg(to_jsonb(t) || jsonb_build_object(
          'version', (select to_jsonb(v) from testing_task_versions v where v.id = t.current_version_id),
          'version_count', (select count(*) from testing_task_versions v where v.task_id = t.id)
        ) order by t.position), '[]'::jsonb) from testing_tasks t where t.round_id = r.id and t.archived_at is null),
    'applications', (select coalesce(jsonb_agg(to_jsonb(a) || jsonb_build_object(
          'profile', (select jsonb_build_object('display_name', p.display_name, 'bio', p.bio, 'country', p.country, 'devices', p.devices,
                        'skills', p.skills, 'is_demo', p.is_demo) from profiles p where p.id = a.tester_id),
          'completed_tests', (select count(*) from test_sessions s where s.tester_id = a.tester_id and s.status = 'completed'),
          'issues_reported', (select count(*) from bug_reports b where b.tester_id = a.tester_id)
        ) order by a.submitted_at), '[]'::jsonb) from tester_applications a where a.round_id = r.id and a.status <> 'draft'),
    'assignments', (select coalesce(jsonb_agg(to_jsonb(s) order by s.assigned_at), '[]'::jsonb) from tester_assignments s where s.round_id = r.id),
    'sessions', (select coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object(
          'tester_name', (select p.display_name from profiles p where p.id = s.tester_id),
          'answers', (select a.answers from tester_assignments ta join tester_applications a on a.id = ta.application_id where ta.id = s.assignment_id)
        ) order by s.started_at), '[]'::jsonb) from test_sessions s where s.round_id = r.id),
    'completions', (select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object('title', v.title)), '[]'::jsonb)
        from task_completions c join test_sessions s on s.id = c.session_id join testing_task_versions v on v.id = c.task_version_id
        where s.round_id = r.id),
    'feedback', (select coalesce(jsonb_agg(to_jsonb(f) || jsonb_build_object('task_id', c.task_id) order by f.created_at), '[]'::jsonb)
        from tester_feedback f join test_sessions s on s.id = f.session_id left join task_completions c on c.id = f.task_completion_id
        where s.round_id = r.id),
    'bugs', (select coalesce(jsonb_agg(to_jsonb(b) || jsonb_build_object(
          'triage', (select to_jsonb(t) from bug_triage t where t.bug_id = b.id),
          'attachment_count', (select count(*) from bug_attachments a where a.bug_id = b.id)
        ) order by b.created_at desc), '[]'::jsonb) from bug_reports b where b.round_id = r.id),
    'verdicts', (select coalesce(jsonb_agg(to_jsonb(v) || jsonb_build_object(
          'amendments', (select coalesce(jsonb_agg(to_jsonb(am) order by am.created_at), '[]'::jsonb) from verdict_amendments am where am.verdict_id = v.id)
        ) order by v.submitted_at), '[]'::jsonb) from tester_verdicts v where v.round_id = r.id),
    'reports', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'status', v.status, 'generator', v.generator,
          'created_at', v.created_at, 'completed_at', v.completed_at, 'error', v.error) order by v.created_at desc), '[]'::jsonb)
        from validation_reports v where v.round_id = r.id),
    'activity', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
        from (select * from testing_activity a where a.round_id = r.id order by a.created_at desc limit 40) x));
end $$;

create or replace function public.report_detail(p_report uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rep validation_reports;
begin
  select * into rep from validation_reports where id = p_report;
  if not found or not public.is_product_creator(rep.product_id) then raise exception 'Report not found' using errcode = '22023'; end if;
  return to_jsonb(rep) || jsonb_build_object(
    'round_title', (select r.title from testing_rounds r where r.id = rep.round_id),
    'version', (select rel.version from product_releases rel where rel.id = rep.release_id),
    'findings', (select coalesce(jsonb_agg(to_jsonb(f) || jsonb_build_object(
          'task_title', (select v.title from testing_tasks t join testing_task_versions v on v.id = t.current_version_id where t.id = f.task_id),
          'evidence', (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at, e.id), '[]'::jsonb) from validation_report_evidence e where e.finding_id = f.id),
          'project_tasks', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'status', t.status)), '[]'::jsonb) from project_tasks t where t.finding_id = f.id)
        ) order by f.position), '[]'::jsonb) from validation_report_findings f where f.report_id = rep.id));
end $$;

-- ================================================================ report job (service role only)
create or replace function public.claim_validation_report(p_report uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_round uuid;
begin
  update validation_reports set status = 'processing' where id = p_report and status = 'queued' returning round_id into v_round;
  if v_round is null then raise exception 'Report is not queued' using errcode = '22023'; end if;
  return v_round;
end $$;

-- The dataset handed to the report engine. Tester identities are reduced to session ids.
create or replace function public.report_dataset(p_round uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with r as (select * from testing_rounds where id = p_round),
  seg as (select q ->> 'key' as key from r, jsonb_array_elements(coalesce(r.application_form -> 'steps', '[]'::jsonb)) st,
          jsonb_array_elements(coalesce(st -> 'questions', '[]'::jsonb)) q where coalesce((q ->> 'segment')::boolean, false)),
  sess as (select s.*, a.answers from test_sessions s join tester_assignments ta on ta.id = s.assignment_id
           join tester_applications a on a.id = ta.application_id where s.round_id = p_round)
  select jsonb_build_object(
    'round', (select jsonb_build_object('id', id, 'title', title, 'cohort_size', cohort_size) from r),
    'release', (select jsonb_build_object('id', rel.id, 'version', rel.version) from product_releases rel, r where rel.id = r.release_id),
    'counts', jsonb_build_object(
      'applications', (select count(*) from tester_applications where round_id = p_round and status <> 'draft'),
      'approved', (select count(*) from tester_applications where round_id = p_round and status = 'approved'),
      'assigned', (select count(*) from tester_assignments where round_id = p_round and status not in ('declined','removed'))),
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object('task_id', t.id, 'position', t.position, 'is_required', t.is_required,
        'title', coalesce((select v.title from task_completions c join sess on sess.id = c.session_id
                           join testing_task_versions v on v.id = c.task_version_id where c.task_id = t.id
                           order by v.version_number desc limit 1),
                          (select v.title from testing_task_versions v where v.id = t.current_version_id), 'Untitled task'))), '[]'::jsonb)
      from testing_tasks t where t.round_id = p_round
        and (exists (select 1 from task_completions c join sess on sess.id = c.session_id where c.task_id = t.id)
             or (t.archived_at is null and not exists (select 1 from sess)))),
    'sessions', (select coalesce(jsonb_agg(jsonb_build_object('id', sess.id, 'status', sess.status,
        'segments', (select coalesce(jsonb_object_agg(seg.key, sess.answers ->> seg.key), '{}'::jsonb) from seg
                     where jsonb_typeof(sess.answers -> seg.key) = 'string'))), '[]'::jsonb) from sess),
    'completions', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'session_id', c.session_id, 'task_id', c.task_id, 'status', c.status,
        'difficulty', c.difficulty, 'help_requested', c.help_requested, 'had_problem', c.had_problem, 'active_seconds', c.active_seconds)), '[]'::jsonb)
      from task_completions c join sess on sess.id = c.session_id),
    'feedback', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'session_id', f.session_id, 'task_id', c.task_id, 'kind', f.kind,
        'difficulty', f.difficulty, 'comment', f.comment, 'answers', f.answers) order by f.created_at), '[]'::jsonb)
      from tester_feedback f join sess on sess.id = f.session_id left join task_completions c on c.id = f.task_completion_id),
    'bugs', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'session_id', b.session_id, 'task_id', b.task_id, 'title', b.title,
        'severity', b.severity, 'actual_result', b.actual_result,
        'triage_status', (select t.status from bug_triage t where t.bug_id = b.id)) order by b.created_at), '[]'::jsonb)
      from bug_reports b where b.round_id = p_round),
    'verdicts', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'session_id', v.session_id, 'rating', v.rating, 'would_use', v.would_use,
        'biggest_improvement', v.biggest_improvement, 'verdict', v.verdict, 'reason', v.reason) order by v.submitted_at), '[]'::jsonb)
      from tester_verdicts v where v.round_id = p_round))
$$;

-- Stores a finished report atomically. Evidence rows are re-checked against the database: a
-- source id that does not belong to this round is rejected, and the supporting-tester count is
-- recomputed from the stored evidence rather than trusted from the caller.
create or replace function public.store_validation_report(p_report uuid, p_result jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare rep validation_reports; f jsonb; e jsonb; v_finding uuid; v_pos int := 0; v_session uuid; v_n int;
begin
  select * into rep from validation_reports where id = p_report for update;
  if not found or rep.status <> 'processing' then raise exception 'Report is not being processed' using errcode = '22023'; end if;
  for f in select * from jsonb_array_elements(coalesce(p_result -> 'findings', '[]'::jsonb)) loop
    if jsonb_array_length(coalesce(f -> 'evidence', '[]'::jsonb)) = 0 then
      raise exception 'Finding "%" has no evidence', f ->> 'title' using errcode = '22023';
    end if;
    insert into validation_report_findings (report_id, position, section, kind, title, body, task_id, supporting_tester_count,
      total_testers, confidence, limitations)
    values (p_report, v_pos, f ->> 'section', f ->> 'kind', f ->> 'title', f ->> 'body', nullif(f ->> 'task_id', '')::uuid, 0,
      (f ->> 'total_testers')::int, f ->> 'confidence', f ->> 'limitations')
    returning id into v_finding;
    v_pos := v_pos + 1;
    for e in select * from jsonb_array_elements(f -> 'evidence') loop
      v_session := case e ->> 'source_type'
        when 'task_feedback' then (select x.session_id from tester_feedback x join test_sessions s on s.id = x.session_id
                                   where x.id = (e ->> 'source_id')::uuid and s.round_id = rep.round_id)
        when 'bug_report' then (select x.session_id from bug_reports x where x.id = (e ->> 'source_id')::uuid and x.round_id = rep.round_id)
        when 'verdict' then (select x.session_id from tester_verdicts x where x.id = (e ->> 'source_id')::uuid and x.round_id = rep.round_id)
        when 'task_completion' then (select x.session_id from task_completions x join test_sessions s on s.id = x.session_id
                                     where x.id = (e ->> 'source_id')::uuid and s.round_id = rep.round_id)
      end;
      if v_session is null then
        raise exception 'Evidence % (%) does not exist in this testing round', e ->> 'source_id', e ->> 'source_type' using errcode = '22023';
      end if;
      insert into validation_report_evidence (report_id, finding_id, source_type, source_id, session_id, excerpt)
      values (p_report, v_finding, e ->> 'source_type', (e ->> 'source_id')::uuid, v_session, e ->> 'excerpt');
    end loop;
    select count(distinct session_id) into v_n from validation_report_evidence where finding_id = v_finding;
    perform set_config('fstb.report_writer', 'on', true);
    update validation_report_findings set supporting_tester_count = v_n, total_testers = greatest(total_testers, v_n) where id = v_finding;
    perform set_config('fstb.report_writer', 'off', true);
  end loop;
  update validation_reports set status = 'completed', generator = p_result ->> 'generator', stats = p_result -> 'stats',
    executive_summary = p_result ->> 'executive_summary', limitations = coalesce(p_result -> 'limitations', '[]'::jsonb),
    completed_at = now()
  where id = p_report;
end $$;

create or replace function public.fail_validation_report(p_report uuid, p_error text) returns void
language sql security definer set search_path = public as $$
  update validation_reports set status = 'failed', error = left(p_error, 2000), completed_at = now()
  where id = p_report and status in ('queued','processing')
$$;

-- store_validation_report finalises counts on its own freshly inserted findings.
create or replace function public.guard_finding_update() returns trigger language plpgsql as $$
declare review_cols text[] := array['review_status','edited_title','edited_body','reviewed_by','reviewed_at'];
begin
  if tg_op = 'UPDATE' and current_setting('fstb.report_writer', true) = 'on' then return new; end if;
  if tg_op = 'DELETE' or (to_jsonb(new) - review_cols) <> (to_jsonb(old) - review_cols) then
    raise exception 'generated finding content is immutable' using errcode = '42501';
  end if;
  return new;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.marketplace(), public.round_detail(uuid), public.listing_stats(uuid), public.listing_task_outline(uuid) to anon;
grant execute on function public.is_product_creator(uuid), public.is_round_creator(uuid), public.has_round_access(uuid),
  public.is_round_participant(uuid), public.round_is_public(uuid), public.product_is_visible(uuid),
  public.profile_is_visible(uuid), public._stats(uuid), public._outline(uuid) to anon;
grant execute on function public.marketplace(), public.round_detail(uuid), public.my_testing(), public.assignment_detail(uuid),
  public.session_detail(uuid), public.bug_detail(uuid), public.creator_home(), public.product_detail(uuid),
  public.creator_round_data(uuid), public.report_detail(uuid) to authenticated, service_role;
revoke execute on function public.claim_validation_report(uuid), public.report_dataset(uuid),
  public.store_validation_report(uuid, jsonb), public.fail_validation_report(uuid, text), public._product_bundle(uuid),
  public._listing(uuid) from authenticated;
grant execute on function public.claim_validation_report(uuid), public.report_dataset(uuid),
  public.store_validation_report(uuid, jsonb), public.fail_validation_report(uuid, text) to service_role;
