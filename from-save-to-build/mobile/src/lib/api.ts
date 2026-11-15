// The app's only gateway to the backend. Reads are authorised JSON read models; every state
// change is a transactional database function. Nothing here holds privileged credentials.
import { supabase } from './supabase';
import type * as T from './types';

function fail(error: { message?: string } | null): never {
  const msg = error?.message ?? 'Something went wrong';
  throw new Error(/row-level security|permission denied/i.test(msg) ? 'You do not have access to do that.' : msg);
}
async function call<R>(fn: string, args?: Record<string, unknown>): Promise<R> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) fail(error);
  return data as R;
}
async function uid(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Please sign in first.');
  return data.session.user.id;
}
async function one<R>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<R> {
  const { data, error } = await q;
  if (error) fail(error);
  return data as R;
}

export type DraftPatch = Partial<Pick<T.Application, 'answers' | 'current_step' | 'available_days' | 'confirm_device_access' | 'confirm_time_commitment'
  | 'confirm_instructions' | 'accept_terms' | 'consent_screenshots' | 'consent_recordings' | 'consent_voice'>>;
export interface PickedFile { name: string; mimeType?: string | null; size?: number | null; uri: string; file?: File }
export type EvidenceTarget = { bugId: string } | { completionId: string } | { verdictId: string };

export const api = {
  // ---------------------------------------------------------------- read models
  marketplace: () => call<T.Listing[]>('marketplace'),
  roundDetail: (roundId: string) => call<T.RoundDetail>('round_detail', { p_round: roundId }),
  myTesting: () => call<T.MyTestingItem[]>('my_testing'),
  assignmentDetail: (id: string) => call<T.AssignmentDetail>('assignment_detail', { p_assignment: id }),
  sessionDetail: (id: string) => call<T.SessionDetail>('session_detail', { p_session: id }),
  bugDetail: (id: string) => call<T.BugDetail>('bug_detail', { p_bug: id }),
  creatorHome: () => call<T.ProductBundle[]>('creator_home'),
  productDetail: (id: string) => call<T.ProductBundle>('product_detail', { p_product: id }),
  creatorRoundData: (roundId: string) => call<T.CreatorRoundData>('creator_round_data', { p_round: roundId }),
  reportDetail: (id: string) => call<T.ReportDetail>('report_detail', { p_report: id }),

  // ---------------------------------------------------------------- profile & notifications
  profile: async () => one<T.Profile>(supabase.from('profiles').select('*').eq('id', await uid()).single()),
  updateProfile: async (patch: Partial<Pick<T.Profile, 'display_name' | 'bio' | 'country' | 'devices' | 'skills'>>) =>
    one<T.Profile>(supabase.from('profiles').update(patch).eq('id', await uid()).select('*').single()),
  notifications: () => one<T.Notification[]>(supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50)),
  markNotificationRead: (id: string) => one<unknown>(supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)),
  requestAccountDeletion: () => call<void>('request_account_deletion'),

  // ---------------------------------------------------------------- tester: application
  createDraft: async (roundId: string, patch: DraftPatch = {}) =>
    one<T.Application>(supabase.from('tester_applications').insert({ round_id: roundId, tester_id: await uid(), ...patch }).select('*').single()),
  saveDraft: (id: string, patch: DraftPatch) => one<T.Application>(supabase.from('tester_applications').update(patch).eq('id', id).select('*').single()),
  deleteDraft: (id: string) => one<unknown>(supabase.from('tester_applications').delete().eq('id', id)),
  submitApplication: (id: string) => call<void>('submit_application', { p_application: id }),
  withdrawApplication: (id: string) => call<void>('withdraw_application', { p_application: id }),

  // ---------------------------------------------------------------- tester: assignment, session, tasks
  respondToAssignment: (id: string, accept: boolean) => call<void>('respond_to_assignment', { p_assignment: id, p_accept: accept }),
  startSession: (assignmentId: string, c: { acknowledged: boolean; screenshots: boolean; recordings: boolean; voice: boolean }) =>
    call<string>('start_session', { p_assignment: assignmentId, p_acknowledge_instructions: c.acknowledged,
      p_consent_screenshots: c.screenshots, p_consent_recordings: c.recordings, p_consent_voice: c.voice }),
  pauseSession: (id: string) => call<void>('pause_session', { p_session: id }),
  resumeSession: (id: string) => call<void>('resume_session', { p_session: id }),
  leaveSession: (id: string) => call<void>('leave_session', { p_session: id }),
  startTask: (completionId: string) => call<void>('start_task', { p_completion: completionId }),
  completeTask: (completionId: string, v: { difficulty: T.Difficulty; helpRequested: boolean; hadProblem: boolean; comment?: string; answers?: Record<string, unknown> }) =>
    call<string>('complete_task', { p_completion: completionId, p_difficulty: v.difficulty, p_help_requested: v.helpRequested,
      p_had_problem: v.hadProblem, p_comment: v.comment ?? null, p_answers: v.answers ?? {} }),
  skipTask: (completionId: string, reason?: string) => call<void>('skip_task', { p_completion: completionId, p_reason: reason ?? null }),
  addFeedback: async (sessionId: string, kind: 'general' | 'feature_request', comment: string) =>
    one<unknown>(supabase.from('tester_feedback').insert({ session_id: sessionId, tester_id: await uid(), kind, comment })),

  // ---------------------------------------------------------------- bugs & evidence
  reportBug: (v: { sessionId: string; completionId: string | null; title: string; expected: string; actual: string; steps: string;
    severity: T.Severity; device?: string; os?: string }) =>
    call<string>('report_bug', { p_session: v.sessionId, p_completion: v.completionId, p_title: v.title, p_expected: v.expected,
      p_actual: v.actual, p_steps: v.steps, p_severity: v.severity, p_device: v.device ?? null, p_os: v.os ?? null }),
  replyToBug: (bugId: string, note: string) => call<void>('reply_to_bug', { p_bug: bugId, p_note: note }),
  triageBug: (bugId: string, action: 'review' | 'categorise' | 'assign' | 'mark_duplicate' | 'mark_fixed' | 'request_info' | 'close' | 'reopen' | 'note',
    extra: { note?: string; category?: string; duplicateOf?: string } = {}) =>
    call<void>('triage_bug', { p_bug: bugId, p_action: action, p_note: extra.note ?? null, p_category: extra.category ?? null,
      p_assignee: null, p_duplicate_of: extra.duplicateOf ?? null }),
  /** Uploads to the private evidence bucket, then records the file. The database rejects kinds the tester did not consent to. */
  uploadEvidence: async (sessionId: string, target: EvidenceTarget, kind: T.EvidenceKind, picked: PickedFile) => {
    const me = await uid();
    const safe = picked.name.replace(/[^\w.\-]+/g, '_').slice(-80);
    const path = `${sessionId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
    const body = picked.file ?? (await (await fetch(picked.uri)).arrayBuffer());
    const { error } = await supabase.storage.from('evidence').upload(path, body, { contentType: picked.mimeType ?? 'application/octet-stream' });
    if (error) fail(error);
    const base = { session_id: sessionId, uploader_id: me, kind, storage_path: path, file_name: picked.name, mime_type: picked.mimeType ?? null, size_bytes: picked.size ?? null };
    if ('bugId' in target) return one<unknown>(supabase.from('bug_attachments').insert({ ...base, bug_id: target.bugId }));
    return one<unknown>(supabase.from('evidence_files').insert({ ...base,
      task_completion_id: 'completionId' in target ? target.completionId : null, verdict_id: 'verdictId' in target ? target.verdictId : null }));
  },
  /** Short-lived signed URL (60 s) for a private evidence file. */
  evidenceUrl: async (storagePath: string) => {
    const { data, error } = await supabase.storage.from('evidence').createSignedUrl(storagePath, 60);
    if (error) fail(error);
    return data!.signedUrl;
  },

  // ---------------------------------------------------------------- verdict
  submitVerdict: (sessionId: string, v: { rating: number; wouldUse: string; biggestImprovement: string; verdict: string; reason: string }) =>
    call<string>('submit_verdict', { p_session: sessionId, p_rating: v.rating, p_would_use: v.wouldUse,
      p_biggest_improvement: v.biggestImprovement, p_verdict: v.verdict, p_reason: v.reason }),
  amendVerdict: (verdictId: string, v: { reason: string; rating?: number | null; wouldUse?: string | null; biggestImprovement?: string | null; verdict?: string | null }) =>
    call<string>('amend_verdict', { p_verdict: verdictId, p_reason: v.reason, p_rating: v.rating ?? null, p_would_use: v.wouldUse ?? null,
      p_biggest_improvement: v.biggestImprovement ?? null, p_new_verdict: v.verdict ?? null }),

  // ---------------------------------------------------------------- creator: products, releases, rounds
  createProduct: async (v: Pick<T.Product, 'name' | 'description' | 'category' | 'stage'> & Partial<Pick<T.Product, 'stage_label' | 'target_audience' | 'demo_url'>>) =>
    one<T.Product>(supabase.from('products').insert({ ...v, creator_id: await uid() }).select('*').single()),
  updateProduct: (id: string, patch: Partial<Pick<T.Product, 'name' | 'description' | 'category' | 'stage' | 'stage_label' | 'target_audience' | 'demo_url'>>) =>
    one<T.Product>(supabase.from('products').update(patch).eq('id', id).select('*').single()),
  createRelease: (productId: string, v: { version: string; notes?: string; access_url?: string; access_instructions?: string }) =>
    one<T.Release>(supabase.from('product_releases').insert({ product_id: productId, ...v }).select('*').single()),
  addAsset: (productId: string, v: { kind: T.Asset['kind']; url: string; caption?: string }) =>
    one<T.Asset>(supabase.from('product_assets').insert({ product_id: productId, ...v }).select('*').single()),
  removeAsset: (id: string) => one<unknown>(supabase.from('product_assets').delete().eq('id', id)),
  createRound: (v: Pick<T.Round, 'product_id' | 'release_id' | 'round_number' | 'title' | 'summary' | 'cohort_size' | 'expected_minutes_min' | 'expected_minutes_max'>
    & Partial<Omit<T.Round, 'id' | 'status' | 'published_at' | 'created_at'>>) =>
    one<T.Round>(supabase.from('testing_rounds').insert(v).select('*').single()),
  updateRound: (id: string, patch: Partial<Omit<T.Round, 'id' | 'status' | 'product_id' | 'published_at' | 'created_at'>>) =>
    one<T.Round>(supabase.from('testing_rounds').update(patch).eq('id', id).select('*').single()),
  setObjectives: async (roundId: string, objectives: string[]) => {
    await one<unknown>(supabase.from('testing_objectives').delete().eq('round_id', roundId));
    const rows = objectives.map((o) => o.trim()).filter(Boolean).map((objective, i) => ({ round_id: roundId, objective, sort_order: i + 1 }));
    if (rows.length) await one<unknown>(supabase.from('testing_objectives').insert(rows));
  },
  publishRound: (roundId: string) => call<void>('publish_round', { p_round: roundId }),
  closeRound: (roundId: string, status: 'closed' | 'completed' | 'archived' = 'closed') => call<void>('close_round', { p_round: roundId, p_status: status }),
  createFollowupRound: (sourceRoundId: string, releaseId: string) => call<string>('create_followup_round', { p_source_round: sourceRoundId, p_release: releaseId }),

  // ---------------------------------------------------------------- creator: task engine
  saveTask: (roundId: string, taskId: string | null, def: T.TaskDefinition, opts: { isRequired?: boolean; dependsOn?: string | null } = {}) =>
    call<string>('save_task', { p_round: roundId, p_task: taskId, p_def: def, p_is_required: opts.isRequired ?? true, p_depends_on: opts.dependsOn ?? null }),
  reorderTasks: (roundId: string, taskIds: string[]) => call<void>('reorder_tasks', { p_round: roundId, p_task_ids: taskIds }),
  archiveTask: (taskId: string) => call<void>('archive_task', { p_task: taskId }),
  saveTaskAsTemplate: (taskId: string) => call<string>('save_task_as_template', { p_task: taskId }),
  addTaskFromTemplate: (roundId: string, templateId: string) => call<string>('add_task_from_template', { p_round: roundId, p_template: templateId }),
  templates: () => one<T.TaskTemplate[]>(supabase.from('task_templates').select('*').order('title')),
  deleteTemplate: (id: string) => one<unknown>(supabase.from('task_templates').delete().eq('id', id)),

  // ---------------------------------------------------------------- creator: applications & assignments
  reviewApplication: (id: string, decision: 'under_review' | 'approved' | 'waitlisted' | 'declined' | 'info_requested', message?: string) =>
    call<void>('review_application', { p_application: id, p_decision: decision, p_message: message ?? null }),
  assignTester: (applicationId: string) => call<string>('assign_tester', { p_application: applicationId }),
  removeAssignment: (assignmentId: string) => call<void>('remove_assignment', { p_assignment: assignmentId }),

  // ---------------------------------------------------------------- creator: reports & improvements
  /** Asks the server-side report job to build a report; returns its id immediately (poll reportDetail). */
  requestReport: async (roundId: string) => {
    const { data, error } = await supabase.functions.invoke('generate-validation-report', { body: { round_id: roundId } });
    if (error) {
      let message = error.message;
      try { message = (await (error as any).context?.json())?.message ?? message; } catch { /* keep default */ }
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data.report_id as string;
  },
  reviewFinding: (findingId: string, status: 'pending' | 'approved' | 'rejected', edited?: { title?: string | null; body?: string | null }) =>
    call<void>('review_finding', { p_finding: findingId, p_status: status, p_title: edited?.title ?? null, p_body: edited?.body ?? null }),
  createProjectTaskFromFinding: (findingId: string, v: { title: string; description?: string; ownerName?: string; assignToMe?: boolean; priority: T.ProjectTask['priority']; due?: string | null }) =>
    uid().then((me) => call<string>('create_project_task_from_finding', { p_finding: findingId, p_title: v.title, p_description: v.description ?? null,
      p_owner: v.assignToMe ? me : null, p_owner_name: v.ownerName ?? null, p_priority: v.priority, p_due: v.due || null })),
  updateProjectTask: (id: string, patch: Partial<Pick<T.ProjectTask, 'title' | 'description' | 'owner_name' | 'priority' | 'due_date' | 'status' | 'resolved_in_release_id'>>) =>
    one<T.ProjectTask>(supabase.from('project_tasks').update({ ...patch,
      ...(patch.status ? { resolved_at: patch.status === 'resolved' ? new Date().toISOString() : null } : {}) }).eq('id', id).select('*').single()),
};
