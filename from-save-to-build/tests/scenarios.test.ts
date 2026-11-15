// End-to-end acceptance scenarios A–J, run against a real PostgreSQL database with the real
// migrations, RLS policies and workflow functions (see helpers.ts for how callers are simulated).
import { afterAll, describe, expect, it } from 'vitest';
import { processReport, type Rpc } from '../supabase/functions/_shared/report/run.ts';
import { DEMO, admin, anon, as, completeAnswers, createUser, pool, query, rpc, service, step4, submittedApplication, user } from './helpers.ts';

const serviceRpc: Rpc = (fn, args) => rpc(service, fn, args);
const creator = user(DEMO.creator);
const state: Record<string, any> = {};
afterAll(() => pool.end());

describe('Scenario A — a new tester discovers Pocket Budget, applies, saves and submits', () => {
  it('lists Pocket Budget publicly with places distinguished from unreviewed applications', async () => {
    const listings = await rpc(anon, 'marketplace');
    const pocket = listings.find((l: any) => l.product.name === 'Pocket Budget');
    expect(pocket.release.version).toBe('v0.8.2');
    expect(pocket.round.cohort_size).toBe(20);
    expect(pocket.stats).toMatchObject({ approved_testers: 0, remaining_places: 20, pending_applications: 0, task_count: 5 });
    expect(pocket.outline.map((t: any) => t.title)).toEqual(['Explore the dashboard', 'Create a monthly budget',
      'Add and categorise expenses', 'Understand spending insights', 'Find and fix a mistake']);
    expect(listings.some((l: any) => l.product.category === 'productivity')).toBe(true); // a second, differently configured product
  });

  it('saves a draft, lets the tester come back to it, and refuses an incomplete submission', async () => {
    state.t1 = await createUser('Amal Tester');
    const t1 = user(state.t1);
    const [app] = await query(t1, `insert into tester_applications (round_id, tester_id, answers, current_step)
      values ($1, $2, $3, 2) returning id, status`, [DEMO.pocketRound, state.t1, JSON.stringify({ experience_level: 'beginner', used_budget_apps: 'no' })]);
    expect(app.status).toBe('draft');
    state.app1 = app.id;
    const detail = await rpc(t1, 'round_detail', { p_round: DEMO.pocketRound });           // "return later"
    expect(detail.my_application).toMatchObject({ id: app.id, current_step: 2, answers: { experience_level: 'beginner' } });
    await expect(rpc(t1, 'submit_application', { p_application: app.id })).rejects.toThrow(/Please answer/);
    await query(t1, `update tester_applications set answers = $2, current_step = 4 where id = $1`, [app.id, JSON.stringify(completeAnswers)]);
    await expect(rpc(t1, 'submit_application', { p_application: app.id })).rejects.toThrow(/days you are available/);
  });

  it('never lets the client change the status itself', async () => {
    await expect(query(user(state.t1), `update tester_applications set status = 'approved' where id = $1`, [state.app1]))
      .rejects.toThrow(/review workflow/);
  });

  it('submits without any optional recording consent', async () => {
    const t1 = user(state.t1);
    await query(t1, `update tester_applications set ${step4} where id = $1`, [state.app1]);
    await rpc(t1, 'submit_application', { p_application: state.app1 });
    const [row] = await query(t1, `select status, consent_screenshots, consent_recordings, consent_voice, submitted_at from tester_applications where id = $1`, [state.app1]);
    expect(row).toMatchObject({ status: 'submitted', consent_screenshots: false, consent_recordings: false, consent_voice: false });
    expect(row.submitted_at).toBeTruthy();
    const stats = await rpc(anon, 'listing_stats', { p_round: DEMO.pocketRound });
    expect(stats).toBeTruthy();
    const [s] = await query(anon, `select * from listing_stats($1)`, [DEMO.pocketRound]);
    expect(s).toMatchObject({ pending_applications: 1, approved_testers: 0, remaining_places: 20 });   // an application is not a place taken
  });

  it('keeps the seeded demo profile as an unsubmitted draft with step 4 unanswered', async () => {
    const [demo] = await query(user(DEMO.tester), `select * from tester_applications where tester_id = $1`, [DEMO.tester]);
    expect(demo).toMatchObject({ status: 'draft', is_demo: true, accept_terms: false, confirm_device_access: false, available_days: [] });
    expect(demo.answers).toMatchObject({ experience_level: 'beginner', used_budget_apps: 'no', tracking_frequency: 'check_occasionally',
      device: 'iphone', country: 'AE', desired_help: ['easy_expense_tracking', 'understanding_spending', 'monthly_budgeting'] });
  });
});

describe('Scenario B — the creator reviews and approves', () => {
  it('shows the application to the creator and approves it without creating an assignment', async () => {
    const data = await rpc(creator, 'creator_round_data', { p_round: DEMO.pocketRound });
    const app = data.applications.find((a: any) => a.id === state.app1);
    expect(app.profile.display_name).toBe('Amal Tester');
    expect(data.applications.some((a: any) => a.status === 'draft')).toBe(false);          // drafts stay private to the tester
    await rpc(creator, 'review_application', { p_application: state.app1, p_decision: 'under_review' });
    await rpc(creator, 'review_application', { p_application: state.app1, p_decision: 'approved' });
    const [{ count }] = await admin(`select count(*)::int from tester_assignments where application_id = $1`, [state.app1]);
    expect(count).toBe(0);                                                                 // approval is not assignment
    const [note] = await query(user(state.t1), `select type, title from notifications where type = 'application.approved'`);
    expect(note.title).toMatch(/approved/i);
  });

  it('refuses decisions from anyone who is not the creator', async () => {
    await expect(rpc(user(state.t1), 'review_application', { p_application: state.app1, p_decision: 'approved' })).rejects.toThrow(/Only the product creator/);
  });

  it('cannot overbook a cohort, even with simultaneous approvals', async () => {
    // A separate one-place round configured entirely through the API a creator would use.
    const [rel] = await query(creator, `insert into product_releases (product_id, version) values ($1, 'v0.8.3-cap') returning id`, [DEMO.pocketProduct]);
    const [round] = await query(creator, `insert into testing_rounds (product_id, release_id, round_number, title, summary, cohort_size, expected_minutes_min, expected_minutes_max)
      values ($1, $2, 90, 'Capacity check', 'Try one thing.', 1, 5, 10) returning id`, [DEMO.pocketProduct, rel.id]);
    await expect(rpc(creator, 'publish_round', { p_round: round.id })).rejects.toThrow(/at least one testing task/);
    await rpc(creator, 'save_task', { p_round: round.id, p_task: null, p_def: { title: 'Only task', task_type: 'open_exploration' } });
    await query(creator, `insert into testing_objectives (round_id, objective) values ($1, 'Check capacity')`, [round.id]);
    await rpc(creator, 'publish_round', { p_round: round.id });
    const [a, b] = await Promise.all([createUser('Cap One'), createUser('Cap Two')]);
    const [appA, appB] = [await submittedApplication(a, round.id, {}), await submittedApplication(b, round.id, {})];
    const results = await Promise.allSettled([
      rpc(creator, 'review_application', { p_application: appA, p_decision: 'approved' }),
      rpc(creator, 'review_application', { p_application: appB, p_decision: 'approved' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason.message).toMatch(/cohort is full/);
    const loser = results[0].status === 'rejected' ? appA : appB;
    await rpc(creator, 'review_application', { p_application: loser, p_decision: 'waitlisted' });
    await expect(rpc(creator, 'assign_tester', { p_application: loser })).rejects.toThrow(/Only an approved tester/);
  });
});

describe('Scenario C — the tester gets the right assignment and release', () => {
  it('assigns only approved testers, exactly once', async () => {
    state.assignment = await rpc(creator, 'assign_tester', { p_application: state.app1 });
    await expect(rpc(creator, 'assign_tester', { p_application: state.app1 })).rejects.toThrow(/already has an assignment/);
    const [row] = await query(user(state.t1), `select release_id, status from tester_assignments where id = $1`, [state.assignment]);
    expect(row).toEqual({ release_id: DEMO.pocketRelease, status: 'invited' });
  });

  it('onboards the tester with the exact product version and requires acknowledgement', async () => {
    const t1 = user(state.t1);
    const onboarding = await rpc(t1, 'assignment_detail', { p_assignment: state.assignment });
    expect(onboarding.release.version).toBe('v0.8.2');
    expect(onboarding.round.id).toBe(DEMO.pocketRound);
    expect(onboarding.outline).toHaveLength(5);
    await expect(rpc(t1, 'start_session', { p_assignment: state.assignment, p_acknowledge_instructions: true })).rejects.toThrow(/Accept the invitation/);
    await rpc(t1, 'respond_to_assignment', { p_assignment: state.assignment, p_accept: true });
    await expect(rpc(t1, 'start_session', { p_assignment: state.assignment, p_acknowledge_instructions: false })).rejects.toThrow(/read the testing instructions/);
    state.session = await rpc(t1, 'start_session', { p_assignment: state.assignment, p_acknowledge_instructions: true, p_consent_screenshots: true });
    expect(await rpc(t1, 'start_session', { p_assignment: state.assignment, p_acknowledge_instructions: true })).toBe(state.session); // idempotent
    const s = await rpc(t1, 'session_detail', { p_session: state.session });
    expect(s.session).toMatchObject({ tester_id: state.t1, assignment_id: state.assignment, product_id: DEMO.pocketProduct,
      release_id: DEMO.pocketRelease, round_id: DEMO.pocketRound, status: 'active' });
    expect(s.session.started_at).toBeTruthy();
    expect(s.consent).toMatchObject({ screenshots: true, recordings: false, voice: false, instructions_acknowledged: true });
    expect(s.tasks).toHaveLength(5);
    expect(s.tasks.every((t: any) => t.status === 'not_started' && t.version.version_number === 1)).toBe(true);
    state.tasks = s.tasks;
  });
});

describe('Scenario D — the tester completes all five tasks, gives feedback and reports a bug', () => {
  const done = (i: number, difficulty: string, extra: Record<string, unknown> = {}) =>
    rpc(user(state.t1), 'complete_task', { p_completion: state.tasks[i].id, p_difficulty: difficulty, p_help_requested: false, p_had_problem: false, ...extra });

  it('enforces task order dependencies and required feedback', async () => {
    const t1 = user(state.t1);
    await expect(rpc(t1, 'start_task', { p_completion: state.tasks[4].id })).rejects.toThrow(/earlier task/);   // task 5 builds on task 3
    await expect(done(0, 'easy')).rejects.toThrow(/Start the task/);
    await rpc(t1, 'start_task', { p_completion: state.tasks[0].id });
    await expect(done(0, 'great')).rejects.toThrow(/how the task went/);
    await done(0, 'very_easy', { p_comment: 'Found everything straight away.' });
  });

  it('supports pause and resume without losing progress', async () => {
    const t1 = user(state.t1);
    await rpc(t1, 'start_task', { p_completion: state.tasks[1].id });
    await rpc(t1, 'pause_session', { p_session: state.session });
    await expect(done(1, 'easy')).rejects.toThrow(/paused/);
    await rpc(t1, 'resume_session', { p_session: state.session });
    const s = await rpc(t1, 'session_detail', { p_session: state.session });
    expect(s.tasks.map((t: any) => t.status)).toEqual(['completed', 'in_progress', 'not_started', 'not_started', 'not_started']);
    await done(1, 'easy', { p_answers: { period_clear: 'not_sure' } });
  });

  it('records honest negative feedback and a bug linked to session, task and release', async () => {
    const t1 = user(state.t1);
    for (const i of [2, 3]) {
      await rpc(t1, 'start_task', { p_completion: state.tasks[i].id });
      await done(i, i === 3 ? 'somewhat_difficult' : 'easy', { p_comment: i === 3 ? 'The chart colours were hard to tell apart.' : null });
    }
    await expect(rpc(t1, 'submit_verdict', { p_session: state.session, p_rating: 4, p_would_use: 'maybe_with_improvements',
      p_biggest_improvement: 'x', p_verdict: 'good_needs_improvements', p_reason: 'x' })).rejects.toThrow(/1 required task/);
    await rpc(t1, 'start_task', { p_completion: state.tasks[4].id });
    state.bug = await rpc(t1, 'report_bug', { p_session: state.session, p_completion: state.tasks[4].id,
      p_title: 'Edit option is hidden behind a long-press', p_expected: 'An obvious edit button on the transaction.',
      p_actual: 'I only found editing by accident after long-pressing the row.', p_steps: '1. Open transactions 2. Tap the AED 300 row',
      p_severity: 'major', p_device: 'iPhone 14', p_os: 'iOS 18' });
    await done(4, 'difficult', { p_had_problem: true, p_comment: 'I could not find where to edit the amount at first.' });
    const [bug] = await query(t1, `select * from bug_reports where id = $1`, [state.bug]);
    expect(bug).toMatchObject({ session_id: state.session, release_id: DEMO.pocketRelease, product_version: 'v0.8.2',
      task_completion_id: state.tasks[4].id, task_id: state.tasks[4].task_id, round_id: DEMO.pocketRound, severity: 'major' });
  });

  it('only stores evidence the tester consented to', async () => {
    const t1 = user(state.t1);
    const attach = (kind: string) => query(t1, `insert into bug_attachments (bug_id, session_id, uploader_id, kind, storage_path, file_name)
      values ($1, $2, $3, $4, $5, 'shot.png') returning id`, [state.bug, state.session, state.t1, kind, `${state.session}/shot-${kind}.png`]);
    await attach('screenshot');                                                            // consent given at onboarding
    await expect(attach('recording')).rejects.toThrow(/No consent on record for recording/);
    await query(t1, `insert into storage.objects (bucket_id, name, owner) values ('evidence', $1, $2)`, [`${state.session}/shot-screenshot.png`, state.t1]);
  });

  it('keeps the original bug report immutable — even for a privileged connection', async () => {
    await expect(admin(`update bug_reports set title = 'edited' where id = $1`, [state.bug])).rejects.toThrow(/immutable/);
    await expect(admin(`delete from bug_reports where id = $1`, [state.bug])).rejects.toThrow(/immutable/);
    const untouched = await query(user(state.t1), `update bug_reports set title = 'edited' where id = $1 returning id`, [state.bug]);
    expect(untouched).toHaveLength(0);                                                     // RLS: no update policy at all
  });
});

describe('Scenario E — the tester submits a final verdict', () => {
  it('requires a written reason, stores the verdict once and completes the session', async () => {
    const t1 = user(state.t1);
    const args = { p_session: state.session, p_rating: 3, p_would_use: 'maybe_with_improvements',
      p_biggest_improvement: 'Make editing a transaction obvious.', p_verdict: 'good_needs_improvements', p_reason: '   ' };
    await expect(rpc(t1, 'submit_verdict', args)).rejects.toThrow(/reason/);
    state.verdict = await rpc(t1, 'submit_verdict', { ...args, p_reason: 'Budgeting was easy but fixing a mistake was confusing.' });
    const [s] = await query(t1, `select status, completed_at from test_sessions where id = $1`, [state.session]);
    expect(s.status).toBe('completed');
    const [a] = await query(t1, `select status from tester_assignments where id = $1`, [state.assignment]);
    expect(a.status).toBe('completed');
  });

  it('cannot be overwritten; corrections are timestamped amendments', async () => {
    const t1 = user(state.t1);
    await expect(admin(`update tester_verdicts set rating = 5 where id = $1`, [state.verdict])).rejects.toThrow(/immutable/);
    expect(await query(t1, `update tester_verdicts set rating = 5 where id = $1 returning id`, [state.verdict])).toHaveLength(0);
    const amendment = await rpc(t1, 'amend_verdict', { p_verdict: state.verdict, p_reason: 'On reflection the insights screen deserves more credit.', p_rating: 4 });
    const s = await rpc(t1, 'session_detail', { p_session: state.session });
    expect(s.verdict.rating).toBe(3);                                                      // original untouched
    expect(s.verdict.amendments).toHaveLength(1);
    expect(s.verdict.amendments[0]).toMatchObject({ id: amendment, rating: 4 });
    expect(s.verdict.amendments[0].created_at).toBeTruthy();
    const [log] = await admin(`select action from audit_logs where entity_id = $1 and action = 'verdict.amend'`, [state.verdict]);
    expect(log).toBeTruthy();
  });
});

describe('Scenario F — the creator sees completion and evidence', () => {
  it('reports applications, assignments and completed tests as different numbers', async () => {
    const d = await rpc(creator, 'creator_round_data', { p_round: DEMO.pocketRound });
    expect(d.round.cohort_size).toBe(20);
    expect(d.applications).toHaveLength(1);
    expect(d.assignments).toHaveLength(1);
    expect(d.sessions.filter((s: any) => s.status === 'completed')).toHaveLength(1);       // 1 completed ≠ cohort of 20
    expect(d.completions).toHaveLength(5);
    expect(d.completions.filter((c: any) => c.status === 'completed')).toHaveLength(5);
    expect(d.bugs[0]).toMatchObject({ id: state.bug, attachment_count: 1, triage: { status: 'new' } });
    expect(d.verdicts[0]).toMatchObject({ verdict: 'good_needs_improvements', rating: 3 });
    expect(d.sessions[0].answers.device).toBe('iphone');                                   // segment data for filters
    const s = await rpc(creator, 'session_detail', { p_session: state.session });
    expect(s.viewer_role).toBe('creator');
    expect(s.bugs[0].attachments[0].storage_path).toContain(state.session);
  });

  it('triages the bug through separate records, leaving the report as written', async () => {
    const [before] = await admin(`select to_jsonb(b) as j from bug_reports b where id = $1`, [state.bug]);
    await rpc(creator, 'triage_bug', { p_bug: state.bug, p_action: 'categorise', p_category: 'Usability' });
    await rpc(creator, 'triage_bug', { p_bug: state.bug, p_action: 'request_info', p_note: 'Which screen were you on?' });
    await rpc(user(state.t1), 'reply_to_bug', { p_bug: state.bug, p_note: 'The transactions list.' });
    await rpc(creator, 'triage_bug', { p_bug: state.bug, p_action: 'mark_fixed', p_note: 'Fixed in v0.9.0' });
    const detail = await rpc(creator, 'bug_detail', { p_bug: state.bug });
    expect(detail.triage).toMatchObject({ status: 'fixed', category: 'Usability' });
    expect(detail.events.map((e: any) => e.event_type)).toEqual(['categorise', 'request_info', 'tester_reply', 'mark_fixed']);
    const [after] = await admin(`select to_jsonb(b) as j from bug_reports b where id = $1`, [state.bug]);
    expect(after.j).toEqual(before.j);
    const testerView = await rpc(user(state.t1), 'bug_detail', { p_bug: state.bug });
    expect(testerView.events.map((e: any) => e.event_type)).toEqual(['request_info', 'tester_reply', 'mark_fixed']); // internal notes hidden
  });
});

describe('Scenario G — a validation report whose every finding links to source feedback', () => {
  it('queues, generates and stores a report with verifiable evidence', async () => {
    await expect(rpc(user(state.t1), 'request_validation_report', { p_round: DEMO.pocketRound })).rejects.toThrow(/Only the product creator/);
    await expect(rpc(creator, 'report_dataset', { p_round: DEMO.pocketRound })).rejects.toThrow(/permission denied/);
    state.report = await rpc(creator, 'request_validation_report', { p_round: DEMO.pocketRound });
    await processReport(serviceRpc, state.report);                                         // no AI key -> labelled rule-based engine
    const report = await rpc(creator, 'report_detail', { p_report: state.report });
    expect(report.status).toBe('completed');
    expect(report.generator).toBe('dev_heuristic');
    expect(report.release_id).toBe(DEMO.pocketRelease);
    expect(report.stats).toMatchObject({ cohort_size: 20, sessions_started: 1, sessions_completed: 1, bugs: { total: 1, major: 1 } });
    expect(report.limitations.join(' ')).toMatch(/Only 1 tester completed/);
    expect(report.limitations.join(' ')).toMatch(/No AI model is connected/);
    expect(report.findings.length).toBeGreaterThan(5);
    for (const f of report.findings) {
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(f.supporting_tester_count).toBe(new Set(f.evidence.map((e: any) => e.session_id)).size);
      expect(f.supporting_tester_count).toBeLessThanOrEqual(1);                            // only one tester exists: no inflated consensus
      expect(f.confidence).toBe('low');
      for (const e of f.evidence) {
        const table = { task_feedback: 'tester_feedback', bug_report: 'bug_reports', verdict: 'tester_verdicts', task_completion: 'task_completions' }[e.source_type as string];
        const [src] = await admin(`select 1 as ok from ${table} where id = $1`, [e.source_id]);
        expect(src?.ok).toBe(1);
      }
    }
    const editing = report.findings.find((f: any) => f.section === 'usability_problems' && f.kind === 'aggregated_observation' && /Find and fix a mistake/.test(f.title));
    expect(editing.task_id).toBe(state.tasks[4].task_id);
    const quote = report.findings.find((f: any) => f.kind === 'tester_statement' && f.section === 'usability_problems' && /Find and fix/.test(f.title));
    expect(quote.body).toBe('I could not find where to edit the amount at first.');         // verbatim, not paraphrased
    expect(report.findings.some((f: any) => f.section === 'priorities' && f.kind === 'recommendation')).toBe(true);
    state.reportSnapshot = report;
  });

  it('rejects a stored result that cites evidence which does not exist', async () => {
    const id = await rpc(creator, 'request_validation_report', { p_round: DEMO.pocketRound });
    await rpc(service, 'claim_validation_report', { p_report: id });
    const fake = { generator: 'x', stats: {}, executive_summary: 'x', limitations: [], findings: [{ section: 'priorities', kind: 'recommendation',
      title: 'Invented', body: 'Invented', task_id: null, total_testers: 12, confidence: 'high', limitations: null,
      evidence: [{ source_type: 'verdict', source_id: '99999999-9999-4999-a999-999999999999', excerpt: 'made up' }] }] };
    await expect(rpc(service, 'store_validation_report', { p_report: id, p_result: fake })).rejects.toThrow(/does not exist in this testing round/);
    await rpc(service, 'fail_validation_report', { p_report: id, p_error: 'test' });
  });

  it('says so explicitly when there is nothing to analyse', async () => {
    const [focus] = await admin(`select id from testing_rounds where title = 'FocusFlow prototype test'`);
    const id = await rpc(creator, 'request_validation_report', { p_round: focus.id });
    await processReport(serviceRpc, id);
    const report = await rpc(creator, 'report_detail', { p_report: id });
    expect(report.findings).toHaveLength(0);
    expect(report.executive_summary).toMatch(/nothing to analyse/);
    expect(report.limitations[0]).toMatch(/no evidence to analyse/i);
  });
});

describe('Scenario H — an approved finding becomes a project task', () => {
  it('requires approval first, then creates a tracked task', async () => {
    const finding = state.reportSnapshot.findings.find((f: any) => f.section === 'priorities');
    const args = { p_finding: finding.id, p_title: 'Improve transaction editing discoverability', p_owner: DEMO.creator, p_priority: 'high', p_due: '2026-12-15' };
    await expect(rpc(creator, 'create_project_task_from_finding', args)).rejects.toThrow(/Approve the finding/);
    await rpc(creator, 'review_finding', { p_finding: finding.id, p_status: 'approved', p_title: 'Make editing a transaction obvious' });
    state.projectTask = await rpc(creator, 'create_project_task_from_finding', args);
    const [task] = await query(creator, `select * from project_tasks where id = $1`, [state.projectTask]);
    expect(task).toMatchObject({ finding_id: finding.id, product_id: DEMO.pocketProduct, priority: 'high', status: 'open', owner_id: DEMO.creator });
    await query(creator, `update project_tasks set status = 'resolved', resolved_at = now() where id = $1`, [state.projectTask]);
    const report = await rpc(creator, 'report_detail', { p_report: state.report });
    const reviewed = report.findings.find((f: any) => f.id === finding.id);
    expect(reviewed.title).toBe(finding.title);                                            // generated text kept
    expect(reviewed.edited_title).toBe('Make editing a transaction obvious');              // creator edit stored alongside
    expect(reviewed.project_tasks[0].status).toBe('resolved');
    await expect(rpc(user(state.t1), 'review_finding', { p_finding: finding.id, p_status: 'rejected' })).rejects.toThrow(/Finding not found/);
  });
});

describe('Scenario I — a new round for a newer release leaves history untouched', () => {
  it('clones the round onto v0.9.0 and versions task edits', async () => {
    const before = await rpc(creator, 'session_detail', { p_session: state.session });
    const [rel] = await query(creator, `insert into product_releases (product_id, version, notes) values ($1, 'v0.9.0', 'Editing is now a visible button') returning id`, [DEMO.pocketProduct]);
    const newRound = await rpc(creator, 'create_followup_round', { p_source_round: DEMO.pocketRound, p_release: rel.id });
    const next = await rpc(creator, 'creator_round_data', { p_round: newRound });
    expect(next.round).toMatchObject({ status: 'draft', release_id: rel.id, previous_round_id: DEMO.pocketRound });
    expect(next.tasks).toHaveLength(5);
    expect(next.tasks[4].depends_on_task_id).toBe(next.tasks[2].id);                       // dependency re-mapped to the new round's own task
    expect(next.sessions).toHaveLength(0);

    // Edit a task in the new round AND in the old round: both create new versions only.
    await rpc(creator, 'save_task', { p_round: newRound, p_task: next.tasks[4].id, p_def: { ...next.tasks[4].version, title: 'Fix a mistake with the new edit button' } });
    await rpc(creator, 'save_task', { p_round: DEMO.pocketRound, p_task: state.tasks[4].task_id, p_def: { ...state.tasks[4].version, title: 'Reworded for future testers' } });
    await expect(admin(`update testing_task_versions set title = 'x' where id = $1`, [state.tasks[4].task_version_id])).rejects.toThrow(/immutable/);

    const after = await rpc(creator, 'session_detail', { p_session: state.session });
    expect(after).toEqual(before);                                                         // the finished session still shows what was tested
    expect(after.tasks[4].version.title).toBe('Find and fix a mistake');
    const current = await rpc(creator, 'creator_round_data', { p_round: DEMO.pocketRound });
    expect(current.tasks[4].version).toMatchObject({ title: 'Reworded for future testers', version_number: 2 });

    const report = await rpc(creator, 'report_detail', { p_report: state.report });
    const strip = (r: any) => ({ ...r, findings: r.findings.map((f: any) => ({ ...f, review_status: 0, edited_title: 0, reviewed_by: 0, reviewed_at: 0, project_tasks: 0, task_title: 0 })) });
    expect(strip(report)).toEqual(strip(state.reportSnapshot));
    await expect(admin(`update validation_reports set executive_summary = 'rewritten' where id = $1`, [state.report])).rejects.toThrow(/immutable/);
    await expect(admin(`update validation_report_findings set body = 'rewritten' where report_id = $1`, [state.report])).rejects.toThrow(/immutable/);
  });
});

describe('Scenario J — a second tester cannot reach the first tester’s private data', () => {
  it('sees nothing through tables, read models or storage, and cannot act on the session', async () => {
    const t2 = user(DEMO.tester2);
    for (const table of ['tester_applications', 'tester_assignments', 'test_sessions', 'task_completions', 'tester_feedback', 'bug_reports',
      'bug_attachments', 'bug_triage', 'bug_report_events', 'tester_verdicts', 'verdict_amendments', 'testing_consents', 'evidence_files',
      'validation_reports', 'validation_report_findings', 'validation_report_evidence', 'project_tasks', 'testing_tasks', 'testing_task_versions']) {
      expect(await query(t2, `select * from ${table}`), table).toHaveLength(0);
    }
    expect(await query(t2, `select * from storage.objects`)).toHaveLength(0);
    expect(await query(t2, `select * from notifications`)).toHaveLength(0);
    expect(await query(t2, `select * from profiles where id = $1`, [state.t1])).toHaveLength(0);
    await expect(rpc(t2, 'session_detail', { p_session: state.session })).rejects.toThrow(/Session not found/);
    await expect(rpc(t2, 'assignment_detail', { p_assignment: state.assignment })).rejects.toThrow(/Assignment not found/);
    await expect(rpc(t2, 'bug_detail', { p_bug: state.bug })).rejects.toThrow(/Issue not found/);
    await expect(rpc(t2, 'creator_round_data', { p_round: DEMO.pocketRound })).rejects.toThrow(/Only the product creator/);
    await expect(rpc(t2, 'report_detail', { p_report: state.report })).rejects.toThrow(/Report not found/);
    await expect(rpc(t2, 'complete_task', { p_completion: state.tasks[0].id, p_difficulty: 'easy', p_help_requested: false, p_had_problem: false })).rejects.toThrow(/Session not found/);
    await expect(rpc(t2, 'amend_verdict', { p_verdict: state.verdict, p_reason: 'x', p_rating: 1 })).rejects.toThrow(/Verdict not found/);
    await expect(rpc(t2, 'withdraw_application', { p_application: state.app1 })).rejects.toThrow(/Application not found/);
    await expect(query(t2, `insert into tester_applications (round_id, tester_id) values ($1, $2)`, [DEMO.pocketRound, state.t1])).rejects.toThrow(/row-level security/);
    await expect(query(t2, `insert into storage.objects (bucket_id, name, owner) values ('evidence', $1, $2)`, [`${state.session}/x.png`, DEMO.tester2])).rejects.toThrow(/row-level security/);
  });

  it('gives anonymous visitors public listings only', async () => {
    expect((await query(anon, `select id from testing_rounds`)).length).toBeGreaterThan(0);
    expect(await query(anon, `select id from testing_rounds where status <> 'published'`)).toHaveLength(0);
    await expect(query(anon, `select * from tester_applications`)).rejects.toThrow(/permission denied/);
    await expect(rpc(anon, 'my_testing')).rejects.toThrow(/permission denied/);
  });
});

describe('Privacy controls', () => {
  it('strips private application data on account deletion and keeps anonymised history', async () => {
    const t = await createUser('Leaving Tester');
    const [focus] = await admin(`select id from testing_rounds where title = 'FocusFlow prototype test'`);
    const appId = await submittedApplication(t, focus.id, { current_tool: 'paper', device: 'web', motivation: 'Too many tabs.' });
    await rpc(user(t), 'request_account_deletion');
    const [app] = await admin(`select status, answers from tester_applications where id = $1`, [appId]);
    expect(app).toEqual({ status: 'withdrawn', answers: {} });
    const [profile] = await admin(`select display_name, deleted_at from profiles where id = $1`, [t]);
    expect(profile.display_name).toBe('Deleted user');
    expect((await admin(`select 1 from deletion_requests where user_id = $1 and status = 'pending'`, [t])).length).toBe(1);
  });

  it('purges evidence past the retention window (service role only)', async () => {
    await expect(rpc(creator, 'purge_expired_evidence')).rejects.toThrow(/permission denied/);
    await admin(`update testing_rounds set evidence_retention_days = 1 where id = $1`, [DEMO.pocketRound]);
    await admin(`alter table bug_attachments disable trigger bug_attachments_immutable`);
    await admin(`update bug_attachments set created_at = now() - interval '3 days' where session_id = $1`, [state.session]);
    await admin(`alter table bug_attachments enable trigger bug_attachments_immutable`);
    const purged = await as(service, (q) => q(`select * from purge_expired_evidence()`));
    expect(purged.map((p: any) => p.storage_path)).toEqual([`${state.session}/shot-screenshot.png`]);
  });
});
