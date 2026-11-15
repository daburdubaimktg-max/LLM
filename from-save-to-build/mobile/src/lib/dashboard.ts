// Creator dashboard maths. Pure functions over the creator_round_data read model, so the numbers
// on screen are always derived from real rows and can be unit-tested.
import type { CreatorRoundData } from './types';

export interface DashboardFilters { segments?: Record<string, string>; taskId?: string; severity?: string; sessionStatus?: string }
export interface Dashboard {
  targetCohort: number; applicationsReceived: number; approved: number; waitlisted: number; assigned: number;
  activeSessions: number; completedSessions: number; abandonedSessions: number;
  taskCompletionRate: number | null; tasksAttempted: number; tasksCompleted: number;
  bugs: number; bySeverity: { minor: number; major: number; critical: number };
  averageRating: number | null; ratings: number; verdicts: Record<string, number>;
  perTask: { taskId: string; title: string; position: number; attempted: number; completed: number; blocked: number; skipped: number; helpRequested: number; medianSeconds: number | null }[];
  filteredTesters: number; isFiltered: boolean;
}
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const matches = (answers: Record<string, any> | null | undefined, segments?: Record<string, string>) =>
  !segments || Object.entries(segments).every(([k, v]) => !v || answers?.[k] === v);

/** Segment questions (marked `segment` in the round's application form) with the values testers actually gave. */
export function segmentOptions(d: CreatorRoundData) {
  const qs = (d.round.application_form?.steps ?? []).flatMap((s) => s.questions).filter((q) => q.segment);
  return qs.map((q) => ({ key: q.key, label: q.label,
    values: [...new Set(d.applications.map((a) => a.answers?.[q.key]).filter((v): v is string => typeof v === 'string' && !!v))]
      .map((v) => ({ value: v, label: q.options?.find((o) => o.value === v)?.label ?? v })) }));
}

export function computeDashboard(d: CreatorRoundData, f: DashboardFilters = {}): Dashboard {
  const apps = d.applications.filter((a) => matches(a.answers, f.segments));
  const appIds = new Set(apps.map((a) => a.id));
  const assignments = d.assignments.filter((a) => appIds.has(a.application_id) && !['declined', 'removed'].includes(a.status));
  const overdue = !!d.round.testing_deadline && new Date(d.round.testing_deadline) < new Date();
  const statusOf = (s: { status: string }) => (s.status !== 'completed' && s.status !== 'abandoned' && overdue ? 'abandoned' : s.status);
  let sessions = d.sessions.filter((s) => matches(s.answers, f.segments));
  if (f.sessionStatus) sessions = sessions.filter((s) => (f.sessionStatus === 'active' ? ['active', 'paused'].includes(statusOf(s)) : statusOf(s) === f.sessionStatus));
  const sessionIds = new Set(sessions.map((s) => s.id));
  const completions = d.completions.filter((c) => sessionIds.has(c.session_id) && (!f.taskId || c.task_id === f.taskId));
  const attempted = completions.filter((c) => c.status !== 'not_started' && c.status !== 'skipped');
  const done = completions.filter((c) => c.status === 'completed');
  const bugs = d.bugs.filter((b) => sessionIds.has(b.session_id) && (!f.taskId || b.task_id === f.taskId) && (!f.severity || b.severity === f.severity));
  const verdicts = d.verdicts.filter((v) => sessionIds.has(v.session_id));
  const taskIds = [...new Set(d.completions.map((c) => c.task_id))];
  return {
    targetCohort: d.round.cohort_size, applicationsReceived: apps.length,
    approved: apps.filter((a) => a.status === 'approved').length, waitlisted: apps.filter((a) => a.status === 'waitlisted').length,
    assigned: assignments.length,
    activeSessions: sessions.filter((s) => ['active', 'paused'].includes(statusOf(s))).length,
    completedSessions: sessions.filter((s) => s.status === 'completed').length,
    abandonedSessions: sessions.filter((s) => statusOf(s) === 'abandoned').length,
    taskCompletionRate: attempted.length ? done.length / attempted.length : null, tasksAttempted: attempted.length, tasksCompleted: done.length,
    bugs: bugs.length, bySeverity: { minor: bugs.filter((b) => b.severity === 'minor').length, major: bugs.filter((b) => b.severity === 'major').length,
      critical: bugs.filter((b) => b.severity === 'critical').length },
    averageRating: verdicts.length ? Math.round((verdicts.reduce((a, v) => a + v.rating, 0) / verdicts.length) * 10) / 10 : null, ratings: verdicts.length,
    verdicts: verdicts.reduce<Record<string, number>>((a, v) => ((a[v.verdict] = (a[v.verdict] ?? 0) + 1), a), {}),
    perTask: taskIds.filter((id) => !f.taskId || id === f.taskId).map((id) => {
      const cs = d.completions.filter((c) => c.task_id === id && sessionIds.has(c.session_id));
      return { taskId: id, title: cs[0]?.title ?? 'Task', position: cs[0]?.position ?? 0,
        attempted: cs.filter((c) => c.status !== 'not_started' && c.status !== 'skipped').length,
        completed: cs.filter((c) => c.status === 'completed').length, blocked: cs.filter((c) => c.status === 'blocked').length,
        skipped: cs.filter((c) => c.status === 'skipped').length, helpRequested: cs.filter((c) => c.help_requested).length,
        medianSeconds: median(cs.filter((c) => c.status === 'completed').map((c) => c.active_seconds)) };
    }).sort((a, b) => a.position - b.position),
    filteredTesters: sessions.length,
    isFiltered: !!(f.taskId || f.severity || f.sessionStatus || Object.values(f.segments ?? {}).some(Boolean)),
  };
}
