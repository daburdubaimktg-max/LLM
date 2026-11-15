// Unit tests for the report engine's integrity guarantees (no database needed).
import { describe, expect, it } from 'vitest';
import { buildSources, computeStats, generateReport, type LlmCall, type RawData } from '../supabase/functions/_shared/report/engine.ts';

const raw = (): RawData => {
  const sessions = ['s1', 's2', 's3', 's4', 's5'].map((id, i) => ({ id, status: 'completed', segments: { device: i < 3 ? 'iphone' : 'android' } }));
  const diff = ['very_easy', 'easy', 'difficult', 'could_not_complete', 'difficult'] as const;
  return {
    round: { id: 'r', title: 'Round', cohort_size: 20 }, release: { id: 'rel', version: 'v1' },
    counts: { applications: 9, approved: 6, assigned: 5 },
    tasks: [{ task_id: 't1', title: 'Add an expense', position: 1, is_required: true }, { task_id: 't2', title: 'Edit an expense', position: 2, is_required: true }],
    sessions,
    completions: sessions.flatMap((s, i) => [
      { id: `c1-${s.id}`, session_id: s.id, task_id: 't1', status: 'completed', difficulty: 'easy' as const, help_requested: false, had_problem: false, active_seconds: 60 + i },
      { id: `c2-${s.id}`, session_id: s.id, task_id: 't2', status: diff[i] === 'could_not_complete' ? 'blocked' : 'completed', difficulty: diff[i], help_requested: i === 2, had_problem: i > 1, active_seconds: 100 + i * 10 },
    ]),
    feedback: sessions.flatMap((s, i) => [
      { id: `f1-${s.id}`, session_id: s.id, task_id: 't1', kind: 'task', difficulty: 'easy' as const, comment: null, answers: {} },
      { id: `f2-${s.id}`, session_id: s.id, task_id: 't2', kind: 'task', difficulty: diff[i], comment: i === 2 ? 'Could not see an edit button.' : null, answers: {} },
    ]),
    bugs: [{ id: 'b1', session_id: 's4', task_id: 't2', title: 'Save button does nothing', severity: 'critical', actual_result: 'Nothing happens', triage_status: 'new' }],
    verdicts: sessions.map((s, i) => ({ id: `v-${s.id}`, session_id: s.id, rating: 3 + (i % 2), would_use: 'maybe_with_improvements',
      biggest_improvement: 'Easier editing', verdict: i === 0 ? 'good_to_go' : i === 3 ? 'needs_major_redevelopment' : 'good_needs_improvements', reason: 'Because.' })),
  };
};

describe('report engine', () => {
  it('computes task statistics from rows, never from a model', () => {
    const stats = computeStats(raw());
    expect(stats.tasks[1]).toMatchObject({ attempted: 5, completed: 4, blocked: 1, help_requested: 1, completion_rate: 0.8 });
    expect(stats.rating).toEqual({ count: 5, average: 3.4 });
    expect(stats.segments.device).toEqual({ iphone: 3, android: 2 });
    expect(stats).toMatchObject({ cohort_size: 20, applications: 9, approved: 6, assigned: 5, sessions_completed: 5 });
  });

  it('produces evidence-backed sections without a model, and flags that no AI was used', async () => {
    const report = await generateReport(raw());
    expect(report.generator).toBe('dev_heuristic');
    const sections = new Set(report.findings.map((f) => f.section));
    for (const s of ['worked_well', 'usability_problems', 'technical_problems', 'feature_requests', 'task_analysis',
      'segment_differences', 'conflicting_opinions', 'priorities', 'next_steps']) expect(sections.has(s as never), s).toBe(true);
    expect(report.findings.every((f) => f.evidence.length > 0)).toBe(true);
    const struggle = report.findings.find((f) => f.section === 'usability_problems' && f.kind === 'aggregated_observation')!;
    expect(struggle).toMatchObject({ supporting_tester_count: 3, total_testers: 5, confidence: 'high' });
    expect(report.findings.filter((f) => f.section === 'priorities')[0].title).toMatch(/Save button does nothing/);  // critical first
    expect(report.limitations.join(' ')).toMatch(/No AI model is connected/);
  });

  it('discards model findings with invented references and recomputes tester counts', async () => {
    const data = raw();
    const refs = buildSources(data).filter((s) => s.type === 'task_feedback' && s.task_id === 't2').map((s) => s.ref);
    const llm: LlmCall = async () => ({
      executive_summary: 'Editing is the main obstacle.',
      findings: [
        { section: 'usability_problems', kind: 'interpretation', title: 'Editing is hard to discover', body: 'The edit affordance appears hidden.', task_ref: 'T2', evidence_refs: [refs[2], 'F999'], limitations: null },
        { section: 'priorities', kind: 'recommendation', title: 'Invented consensus', body: '90% of testers demand dark mode.', task_ref: null, evidence_refs: ['Z1', 'F12345'], limitations: null },
        { section: 'usability_problems', kind: 'tester_statement', title: 'Fake quote', body: '“I love it”', task_ref: null, evidence_refs: [refs[0]], limitations: null },
      ],
    });
    const report = await generateReport(data, llm, 'openai:test');
    expect(report.generator).toBe('openai:test');
    const kept = report.findings.find((f) => f.title === 'Editing is hard to discover')!;
    expect(kept.evidence).toHaveLength(1);                        // the invented ref F999 was stripped
    expect(kept.supporting_tester_count).toBe(1);                 // recomputed, not claimed
    expect(kept.task_id).toBe('t2');
    expect(report.findings.some((f) => f.title === 'Invented consensus')).toBe(false);
    expect(report.findings.some((f) => f.title === 'Fake quote')).toBe(false);   // models cannot author tester statements
    expect(report.limitations.join(' ')).toMatch(/1 generated finding discarded/);
    expect(report.executive_summary).toMatch(/AI summary \(interpretation\)/);
  });

  it('falls back to rule-based analysis, and says so, when the model call fails', async () => {
    const report = await generateReport(raw(), async () => { throw new Error('OpenAI responded 500'); }, 'openai:test');
    expect(report.generator).toBe('dev_heuristic');
    expect(report.limitations.join(' ')).toMatch(/AI model call failed/);
  });
});
