// Unit tests for client-side logic that decides what numbers and validation errors people see.
import { describe, expect, it } from 'vitest';
import { computeDashboard, segmentOptions } from '../mobile/src/lib/dashboard.ts';
import { availabilitySchema, bugSchema, fieldErrors, firstIncompleteStep, validateStep, verdictSchema } from '../mobile/src/lib/schemas.ts';
import type { CreatorRoundData } from '../mobile/src/lib/types.ts';

const form = { steps: [{ id: 'a', title: 'A', questions: [
  { key: 'device', label: 'Device', type: 'single' as const, required: true, segment: true, options: [{ value: 'iphone', label: 'iPhone' }, { value: 'android', label: 'Android' }] },
  { key: 'why', label: 'Why', type: 'text' as const, required: true },
  { key: 'extras', label: 'Extras', type: 'multi' as const, options: [{ value: 'x', label: 'X' }] }] }] };

function data(): CreatorRoundData {
  const app = (id: string, status: string, device: string) => ({ id, status, answers: { device } }) as any;
  const session = (id: string, status: string, device: string) => ({ id, status, answers: { device } }) as any;
  const comp = (session_id: string, task_id: string, status: string, secs = 60, help = false) =>
    ({ id: `${session_id}-${task_id}`, session_id, task_id, status, active_seconds: secs, help_requested: help, title: task_id, position: task_id === 't1' ? 1 : 2 }) as any;
  return {
    round: { cohort_size: 20, testing_deadline: null, application_form: form } as any, product: {} as any, release: {} as any, releases: [], objectives: [], stats: {} as any, tasks: [],
    applications: [app('a1', 'approved', 'iphone'), app('a2', 'approved', 'android'), app('a3', 'waitlisted', 'android'), app('a4', 'submitted', 'iphone'), app('a5', 'declined', 'iphone')],
    assignments: [{ application_id: 'a1', status: 'completed' }, { application_id: 'a2', status: 'in_progress' }, { application_id: 'a3', status: 'removed' }] as any,
    sessions: [session('s1', 'completed', 'iphone'), session('s2', 'active', 'android')],
    completions: [comp('s1', 't1', 'completed', 40), comp('s1', 't2', 'blocked', 0, true), comp('s2', 't1', 'completed', 80), comp('s2', 't2', 'not_started')],
    feedback: [], reports: [], activity: [],
    bugs: [{ session_id: 's1', task_id: 't2', severity: 'critical' }, { session_id: 's2', task_id: 't1', severity: 'minor' }] as any,
    verdicts: [{ session_id: 's1', rating: 3, verdict: 'good_needs_improvements' }] as any,
  };
}

describe('creator dashboard maths', () => {
  it('keeps cohort target, applications, approvals, assignments and completed tests as separate numbers', () => {
    const d = computeDashboard(data());
    expect(d).toMatchObject({ targetCohort: 20, applicationsReceived: 5, approved: 2, waitlisted: 1, assigned: 2,
      activeSessions: 1, completedSessions: 1, abandonedSessions: 0, bugs: 2, averageRating: 3, ratings: 1 });
    expect(d.bySeverity).toEqual({ minor: 1, major: 0, critical: 1 });
    expect(d.tasksAttempted).toBe(3);                       // not_started is not an attempt
    expect(d.taskCompletionRate).toBeCloseTo(2 / 3);
    expect(d.perTask.map((t) => [t.title, t.completed, t.blocked, t.medianSeconds])).toEqual([['t1', 2, 0, 60], ['t2', 0, 1, null]]);
    expect(d.verdicts).toEqual({ good_needs_improvements: 1 });
  });

  it('filters by tester segment, task, severity and completion status', () => {
    const android = computeDashboard(data(), { segments: { device: 'android' } });
    expect(android).toMatchObject({ applicationsReceived: 2, approved: 1, assigned: 1, completedSessions: 0, activeSessions: 1, bugs: 1, averageRating: null, isFiltered: true });
    expect(computeDashboard(data(), { severity: 'critical' }).bugs).toBe(1);
    expect(computeDashboard(data(), { taskId: 't2' })).toMatchObject({ tasksAttempted: 1, tasksCompleted: 0, taskCompletionRate: 0 });
    expect(computeDashboard(data(), { sessionStatus: 'completed' }).filteredTesters).toBe(1);
  });

  it('treats unfinished sessions as abandoned once the testing deadline has passed', () => {
    const d = data(); d.round.testing_deadline = '2020-01-01T00:00:00Z';
    expect(computeDashboard(d)).toMatchObject({ activeSessions: 0, abandonedSessions: 1, completedSessions: 1 });
  });

  it('reports no rate rather than 0% or 100% when nothing was attempted', () => {
    const d = data(); d.sessions = []; d.completions = [];
    expect(computeDashboard(d)).toMatchObject({ taskCompletionRate: null, averageRating: null, completedSessions: 0 });
  });

  it('derives segment filters from the round’s own form', () => {
    expect(segmentOptions(data())).toEqual([{ key: 'device', label: 'Device', values: [{ value: 'iphone', label: 'iPhone' }, { value: 'android', label: 'Android' }] }]);
  });
});

describe('form validation', () => {
  it('validates configurable application steps and never treats a blank as an answer', () => {
    expect(validateStep(form.steps[0], {})).toEqual({ device: 'Please answer this question', why: 'Please answer this question' });
    expect(validateStep(form.steps[0], { device: 'windows', why: '   ' })).toMatchObject({ device: 'Choose one of the options', why: 'Please answer this question' });
    expect(validateStep(form.steps[0], { device: 'iphone', why: 'Curious' })).toEqual({});
    expect(firstIncompleteStep(form, { device: 'iphone' })).toBe(0);
    expect(firstIncompleteStep(form, { device: 'iphone', why: 'x' })).toBe(-1);
  });

  it('requires the participation confirmations but has no notion of recording consent', () => {
    const base = { available_days: ['sat'], confirm_device_access: true, confirm_time_commitment: true, confirm_instructions: true, accept_terms: true };
    expect(availabilitySchema.safeParse(base).success).toBe(true);
    expect(fieldErrors(availabilitySchema.safeParse({ ...base, accept_terms: false, available_days: [] }))).toMatchObject({
      accept_terms: 'Please accept the privacy and participation terms', available_days: 'Choose at least one day' });
    expect(Object.keys(availabilitySchema.shape)).not.toContain('consent_recordings');
  });

  it('requires a written reason for a verdict and the core fields of a bug report', () => {
    const v = { rating: 4, wouldUse: 'no', biggestImprovement: 'Editing', verdict: 'good_to_go', reason: '  ' };
    expect(fieldErrors(verdictSchema.safeParse(v))).toEqual({ reason: 'The reason for your verdict is required' });
    expect(verdictSchema.safeParse({ ...v, reason: 'Clear and quick.' }).success).toBe(true);
    expect(Object.keys(fieldErrors(bugSchema.safeParse({ title: 'x', expected: '', actual: '', steps: '', severity: 'blocker' }))).sort())
      .toEqual(['actual', 'expected', 'severity', 'steps', 'title']);
  });
});
