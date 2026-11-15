// Validation-report engine. Pure, dependency-free TypeScript so the same code runs in the
// Supabase Edge Function (Deno), the local dev gateway (Node) and the unit tests.
//
// Integrity rules enforced here, in code, regardless of what a language model returns:
//   * Tester statements and aggregated observations are produced ONLY by deterministic code
//     from stored rows. A model can never add a "quote" or a count.
//   * A model may contribute interpretations and recommendations, and each one must cite source
//     references that exist in the dataset. Unknown references are stripped; a finding left with
//     no evidence is discarded and the discard is disclosed in the report limitations.
//   * "N testers support this" is always recomputed from the cited rows.

export type Difficulty = 'very_easy' | 'easy' | 'somewhat_difficult' | 'difficult' | 'could_not_complete';
export type Section =
  | 'worked_well' | 'usability_problems' | 'technical_problems' | 'feature_requests' | 'task_analysis'
  | 'segment_differences' | 'conflicting_opinions' | 'priorities' | 'next_steps';
export type Kind = 'tester_statement' | 'aggregated_observation' | 'interpretation' | 'recommendation';
export type SourceType = 'task_feedback' | 'bug_report' | 'verdict' | 'task_completion';

export const SECTIONS: Section[] = ['worked_well', 'usability_problems', 'technical_problems', 'feature_requests',
  'task_analysis', 'segment_differences', 'conflicting_opinions', 'priorities', 'next_steps'];

export interface RawData {
  round: { id: string; title: string; cohort_size: number };
  release: { id: string; version: string };
  counts: { applications: number; approved: number; assigned: number };
  tasks: { task_id: string; title: string; position: number; is_required: boolean }[];
  sessions: { id: string; status: string; segments: Record<string, string> }[];
  completions: { id: string; session_id: string; task_id: string; status: string; difficulty: Difficulty | null;
    help_requested: boolean | null; had_problem: boolean | null; active_seconds: number }[];
  feedback: { id: string; session_id: string; task_id: string | null; kind: string; difficulty: Difficulty | null;
    comment: string | null; answers: Record<string, unknown> }[];
  bugs: { id: string; session_id: string; task_id: string | null; title: string; severity: 'minor' | 'major' | 'critical';
    actual_result: string; triage_status: string }[];
  verdicts: { id: string; session_id: string; rating: number; would_use: string; biggest_improvement: string;
    verdict: string; reason: string }[];
}

export interface Source { ref: string; type: SourceType; id: string; session_id: string; task_id: string | null; text: string }

export interface DraftFinding {
  section: Section; kind: Kind; title: string; body: string; task_id?: string | null;
  evidence_refs: string[]; limitations?: string | null;
  /** denominator for "x of y testers"; defaults to all sessions */
  total_testers?: number;
}
export interface FinalFinding {
  section: Section; kind: Kind; title: string; body: string; task_id: string | null;
  supporting_tester_count: number; total_testers: number; confidence: 'low' | 'medium' | 'high';
  limitations: string | null;
  evidence: { source_type: SourceType; source_id: string; session_id: string; excerpt: string }[];
}
export interface TaskStat {
  task_id: string; title: string; position: number; is_required: boolean; attempted: number; completed: number;
  blocked: number; skipped: number; not_reached: number; completion_rate: number | null; help_requested: number;
  median_seconds: number | null; difficulty: Record<Difficulty, number>;
}
export interface Stats {
  cohort_size: number; applications: number; approved: number; assigned: number;
  sessions_started: number; sessions_completed: number; sessions_abandoned: number;
  tasks: TaskStat[];
  bugs: { total: number; minor: number; major: number; critical: number };
  rating: { count: number; average: number | null };
  verdicts: Record<string, number>; would_use: Record<string, number>;
  segments: Record<string, Record<string, number>>;
}
export interface ReportResult {
  generator: string; stats: Stats; executive_summary: string; limitations: string[]; findings: FinalFinding[];
}
export interface LlmOutput {
  executive_summary: string;
  findings: { section: string; kind: string; title: string; body: string; task_ref: string | null;
    evidence_refs: string[]; limitations: string | null }[];
}
export type LlmCall = (prompt: { system: string; user: string; schema: unknown }) => Promise<LlmOutput>;

const HARD: Difficulty[] = ['somewhat_difficult', 'difficult', 'could_not_complete'];
const EASY: Difficulty[] = ['very_easy', 'easy'];
const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  very_easy: 'Very easy', easy: 'Easy', somewhat_difficult: 'Somewhat difficult', difficult: 'Difficult',
  could_not_complete: 'Could not complete',
};
const clip = (s: string, n = 600) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------- sources
export function buildSources(raw: RawData): Source[] {
  const out: Source[] = [];
  raw.feedback.forEach((f, i) => {
    const parts: string[] = [];
    if (f.difficulty) parts.push(`[Rated: ${DIFFICULTY_LABEL[f.difficulty]}]`);
    if (f.comment && f.comment.trim()) parts.push(f.comment.trim());
    for (const [k, v] of Object.entries(f.answers ?? {})) {
      if (v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)) parts.push(`(${k}: ${Array.isArray(v) ? v.join(', ') : String(v)})`);
    }
    if (parts.length) out.push({ ref: `F${i + 1}`, type: 'task_feedback', id: f.id, session_id: f.session_id, task_id: f.task_id, text: clip(parts.join(' ')) });
  });
  raw.bugs.forEach((b, i) => out.push({ ref: `B${i + 1}`, type: 'bug_report', id: b.id, session_id: b.session_id, task_id: b.task_id,
    text: clip(`[${b.severity}] ${b.title} — ${b.actual_result}`) }));
  raw.verdicts.forEach((v, i) => out.push({ ref: `V${i + 1}`, type: 'verdict', id: v.id, session_id: v.session_id, task_id: null,
    text: clip(`[${v.verdict}; rating ${v.rating}/5; would use: ${v.would_use}] ${v.reason} | Biggest improvement: ${v.biggest_improvement}`) }));
  raw.completions.forEach((c, i) => {
    if (c.status === 'not_started') return;
    out.push({ ref: `C${i + 1}`, type: 'task_completion', id: c.id, session_id: c.session_id, task_id: c.task_id,
      text: `Task status: ${c.status}${c.help_requested ? '; asked for help' : ''}; active time ${c.active_seconds}s` });
  });
  return out;
}

// ---------------------------------------------------------------- deterministic statistics
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const tally = (xs: string[]) => xs.reduce<Record<string, number>>((a, x) => ((a[x] = (a[x] ?? 0) + 1), a), {});

export function computeStats(raw: RawData): Stats {
  const tasks: TaskStat[] = [...raw.tasks].sort((a, b) => a.position - b.position).map((t) => {
    const cs = raw.completions.filter((c) => c.task_id === t.task_id);
    const attempted = cs.filter((c) => c.status !== 'not_started' && c.status !== 'skipped');
    const completed = cs.filter((c) => c.status === 'completed');
    const difficulty = { very_easy: 0, easy: 0, somewhat_difficult: 0, difficult: 0, could_not_complete: 0 } as Record<Difficulty, number>;
    cs.forEach((c) => { if (c.difficulty) difficulty[c.difficulty] += 1; });
    return {
      task_id: t.task_id, title: t.title, position: t.position, is_required: t.is_required,
      attempted: attempted.length, completed: completed.length,
      blocked: cs.filter((c) => c.status === 'blocked').length, skipped: cs.filter((c) => c.status === 'skipped').length,
      not_reached: cs.filter((c) => c.status === 'not_started').length,
      completion_rate: attempted.length ? completed.length / attempted.length : null,
      help_requested: cs.filter((c) => c.help_requested).length,
      median_seconds: median(completed.map((c) => c.active_seconds)), difficulty,
    };
  });
  const segments: Record<string, Record<string, number>> = {};
  raw.sessions.forEach((s) => Object.entries(s.segments ?? {}).forEach(([k, v]) => {
    if (!v) return; (segments[k] ??= {})[v] = (segments[k][v] ?? 0) + 1;
  }));
  const ratings = raw.verdicts.map((v) => v.rating);
  return {
    cohort_size: raw.round.cohort_size, applications: raw.counts.applications, approved: raw.counts.approved,
    assigned: raw.counts.assigned, sessions_started: raw.sessions.length,
    sessions_completed: raw.sessions.filter((s) => s.status === 'completed').length,
    sessions_abandoned: raw.sessions.filter((s) => s.status === 'abandoned').length,
    tasks,
    bugs: { total: raw.bugs.length, minor: raw.bugs.filter((b) => b.severity === 'minor').length,
      major: raw.bugs.filter((b) => b.severity === 'major').length, critical: raw.bugs.filter((b) => b.severity === 'critical').length },
    rating: { count: ratings.length, average: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100 : null },
    verdicts: tally(raw.verdicts.map((v) => v.verdict)), would_use: tally(raw.verdicts.map((v) => v.would_use)), segments,
  };
}

// ---------------------------------------------------------------- code-generated findings
/** Statements + aggregated observations (always), plus rule-based recommendations when requested. */
export function codeFindings(raw: RawData, sources: Source[], stats: Stats, withRuleRecommendations: boolean): DraftFinding[] {
  const out: DraftFinding[] = [];
  const bySource = (type: SourceType, id: string) => sources.find((s) => s.type === type && s.id === id)?.ref;
  const refs = (xs: (string | undefined)[]) => xs.filter((x): x is string => !!x);
  const taskFeedback = (taskId: string) => raw.feedback.filter((f) => f.task_id === taskId && f.kind === 'task' && f.difficulty);
  const problems: { title: string; body: string; refs: string[]; task_id: string | null; weight: number; total: number }[] = [];

  for (const t of stats.tasks) {
    const fb = taskFeedback(t.task_id);
    const hard = fb.filter((f) => HARD.includes(f.difficulty!));
    const easy = fb.filter((f) => EASY.includes(f.difficulty!));
    const taskBugs = raw.bugs.filter((b) => b.task_id === t.task_id);
    const compRefs = refs(raw.completions.filter((c) => c.task_id === t.task_id && c.status !== 'not_started').map((c) => bySource('task_completion', c.id)));

    if (compRefs.length) {
      out.push({ section: 'task_analysis', kind: 'aggregated_observation', task_id: t.task_id, total_testers: stats.sessions_started,
        title: `Task ${t.position}: ${t.title}`,
        body: `${t.completed} of ${plural(t.attempted, 'tester')} who attempted this task completed it` +
          `${t.blocked ? `; ${t.blocked} could not complete it` : ''}${t.skipped ? `; ${t.skipped} skipped it` : ''}` +
          `${t.not_reached ? `; ${t.not_reached} had not reached it` : ''}. ` +
          `${t.help_requested} asked for help.` + (t.median_seconds !== null ? ` Median active time: ${t.median_seconds}s.` : ''),
        evidence_refs: compRefs });
    }
    if (fb.length && !hard.length && !taskBugs.length) {
      out.push({ section: 'worked_well', kind: 'aggregated_observation', task_id: t.task_id, total_testers: fb.length,
        title: `“${t.title}” went smoothly`,
        body: `All ${plural(fb.length, 'tester')} who rated this task called it easy or very easy, and nobody reported a problem on it.`,
        evidence_refs: refs(fb.map((f) => bySource('task_feedback', f.id))) });
    }
    if (hard.length) {
      const hardRefs = refs(hard.map((f) => bySource('task_feedback', f.id)));
      const body = `${hard.length} of ${plural(fb.length, 'tester')} who rated this task found it somewhat difficult, difficult, or could not complete it.`;
      out.push({ section: 'usability_problems', kind: 'aggregated_observation', task_id: t.task_id, total_testers: fb.length,
        title: `Testers struggled with “${t.title}”`, body, evidence_refs: hardRefs });
      hard.filter((f) => f.comment && f.comment.trim()).slice(0, 5).forEach((f) => out.push({
        section: 'usability_problems', kind: 'tester_statement', task_id: t.task_id, total_testers: fb.length,
        title: `Tester comment on “${t.title}”`, body: clip(f.comment!.trim()), evidence_refs: refs([bySource('task_feedback', f.id)]) }));
      problems.push({ title: `Improve “${t.title}”`, body, refs: hardRefs, task_id: t.task_id, weight: hard.length * 2 + t.blocked * 3, total: fb.length });
    }
    if (easy.length && hard.length) {
      out.push({ section: 'conflicting_opinions', kind: 'aggregated_observation', task_id: t.task_id, total_testers: fb.length,
        title: `Mixed experience on “${t.title}”`,
        body: `${plural(easy.length, 'tester')} rated this task easy or very easy while ${hard.length} found it difficult or could not complete it.`,
        evidence_refs: refs(fb.map((f) => bySource('task_feedback', f.id))) });
    }
  }

  for (const b of raw.bugs.filter((x) => x.severity !== 'minor')) {
    const r = refs([bySource('bug_report', b.id)]);
    out.push({ section: 'technical_problems', kind: 'tester_statement', task_id: b.task_id,
      title: `${b.severity === 'critical' ? 'Critical' : 'Major'} issue: ${clip(b.title, 120)}`, body: clip(b.actual_result), evidence_refs: r });
    problems.push({ title: `Fix: ${clip(b.title, 120)}`, body: `Reported as a ${b.severity} issue by a tester.`, refs: r, task_id: b.task_id,
      weight: b.severity === 'critical' ? 100 : 20, total: stats.sessions_started });
  }
  const minor = raw.bugs.filter((b) => b.severity === 'minor');
  if (minor.length) {
    out.push({ section: 'technical_problems', kind: 'aggregated_observation',
      title: `${plural(minor.length, 'minor issue')} reported`, body: minor.map((b) => `• ${clip(b.title, 120)}`).join('\n'),
      evidence_refs: refs(minor.map((b) => bySource('bug_report', b.id))) });
  }

  raw.feedback.filter((f) => f.kind === 'feature_request' && f.comment?.trim()).forEach((f) => out.push({
    section: 'feature_requests', kind: 'tester_statement', title: 'Feature request', body: clip(f.comment!.trim()),
    evidence_refs: refs([bySource('task_feedback', f.id)]) }));
  raw.verdicts.filter((v) => v.biggest_improvement.trim()).forEach((v) => out.push({
    section: 'feature_requests', kind: 'tester_statement', total_testers: raw.verdicts.length,
    title: 'Biggest improvement requested in a final review', body: clip(v.biggest_improvement.trim()),
    evidence_refs: refs([bySource('verdict', v.id)]) }));

  // Segment comparison: only when at least two groups have >= 2 testers each.
  for (const [key, groups] of Object.entries(stats.segments)) {
    const usable = Object.entries(groups).filter(([, n]) => n >= 2);
    if (usable.length < 2) continue;
    const lines: string[] = []; const ev: string[] = [];
    for (const [value] of usable) {
      const sessionIds = new Set(raw.sessions.filter((s) => s.segments[key] === value).map((s) => s.id));
      const fb = raw.feedback.filter((f) => sessionIds.has(f.session_id) && f.kind === 'task' && f.difficulty);
      const hard = fb.filter((f) => HARD.includes(f.difficulty!));
      lines.push(`${key} = ${value} (${plural(sessionIds.size, 'tester')}): ${hard.length} of ${plural(fb.length, 'task rating')} were difficult or not completed.`);
      ev.push(...refs(fb.map((f) => bySource('task_feedback', f.id))));
    }
    if (ev.length) out.push({ section: 'segment_differences', kind: 'aggregated_observation', title: `Difficulty by ${key}`,
      body: lines.join('\n'), evidence_refs: ev, limitations: 'Small groups; differences may be down to chance.' });
  }

  const vKinds = Object.keys(stats.verdicts);
  if (vKinds.includes('good_to_go') && vKinds.includes('needs_major_redevelopment')) {
    out.push({ section: 'conflicting_opinions', kind: 'aggregated_observation', total_testers: raw.verdicts.length,
      title: 'Testers disagree on overall readiness',
      body: `${stats.verdicts.good_to_go} said “good to go” while ${stats.verdicts.needs_major_redevelopment} said “needs major redevelopment”.`,
      evidence_refs: refs(raw.verdicts.filter((v) => v.verdict === 'good_to_go' || v.verdict === 'needs_major_redevelopment').map((v) => bySource('verdict', v.id))) });
  }

  if (withRuleRecommendations) {
    problems.sort((a, b) => b.weight - a.weight).slice(0, 8).forEach((p, i) => out.push({
      section: 'priorities', kind: 'recommendation', task_id: p.task_id, total_testers: p.total,
      title: `${i + 1}. ${p.title}`, body: `${p.body} Ranked by a fixed rule (critical issues first, then number of testers affected) — not by an AI model.`,
      evidence_refs: p.refs }));
    const done = refs(raw.verdicts.map((v) => bySource('verdict', v.id)));
    if (done.length && stats.sessions_completed < stats.cohort_size) {
      out.push({ section: 'next_steps', kind: 'recommendation', total_testers: stats.cohort_size,
        title: 'Keep the round open until more of the cohort has finished',
        body: `${stats.sessions_completed} of a target cohort of ${stats.cohort_size} have submitted a final review so far.`,
        evidence_refs: done });
    }
    if (problems.length) {
      out.push({ section: 'next_steps', kind: 'recommendation',
        title: 'Retest the affected tasks on the next release',
        body: 'After addressing the priorities above, create a follow-up round on the new release that repeats the same tasks so results can be compared.',
        evidence_refs: [...new Set(problems.flatMap((p) => p.refs))] });
    }
  }
  return out;
}

// ---------------------------------------------------------------- validation (the anti-fabrication gate)
export function validateFindings(drafts: DraftFinding[], sources: Source[], raw: RawData): { findings: FinalFinding[]; discarded: number } {
  const byRef = new Map(sources.map((s) => [s.ref, s]));
  const taskIds = new Set(raw.tasks.map((t) => t.task_id));
  const kinds: Kind[] = ['tester_statement', 'aggregated_observation', 'interpretation', 'recommendation'];
  let discarded = 0; const findings: FinalFinding[] = [];
  for (const d of drafts) {
    const cited = [...new Set(d.evidence_refs ?? [])].map((r) => byRef.get(r)).filter((s): s is Source => !!s);
    if (!cited.length || !SECTIONS.includes(d.section) || !kinds.includes(d.kind) || !d.title?.trim() || !d.body?.trim()) { discarded += 1; continue; }
    const supporting = new Set(cited.map((s) => s.session_id)).size;
    const total = Math.max(d.total_testers ?? raw.sessions.length, supporting);
    // One or two voices are never more than anecdote, however large the cohort.
    const confidence = supporting < 3 || total < 3 ? 'low' : supporting / total >= 0.5 && total >= 5 ? 'high' : 'medium';
    const smallSample = total < 5 ? `Based on ${plural(total, 'tester')} — treat as anecdotal, not as a trend.` : null;
    findings.push({
      section: d.section, kind: d.kind, title: d.title.trim(), body: d.body.trim(),
      task_id: d.task_id && taskIds.has(d.task_id) ? d.task_id : null,
      supporting_tester_count: supporting, total_testers: total, confidence,
      limitations: [d.limitations, smallSample].filter(Boolean).join(' ') || null,
      evidence: cited.map((s) => ({ source_type: s.type, source_id: s.id, session_id: s.session_id, excerpt: s.text })),
    });
  }
  return { findings, discarded };
}

// ---------------------------------------------------------------- model prompt (structured output)
export const LLM_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['executive_summary', 'findings'],
  properties: {
    executive_summary: { type: 'string' },
    findings: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['section', 'kind', 'title', 'body', 'task_ref', 'evidence_refs', 'limitations'],
      properties: {
        section: { type: 'string', enum: SECTIONS },
        kind: { type: 'string', enum: ['interpretation', 'recommendation'] },
        title: { type: 'string' }, body: { type: 'string' },
        task_ref: { type: ['string', 'null'] },
        evidence_refs: { type: 'array', items: { type: 'string' } },
        limitations: { type: ['string', 'null'] },
      } } },
  },
} as const;

export function buildPrompt(raw: RawData, sources: Source[], stats: Stats) {
  const system = [
    'You analyse structured product-testing results for a product creator.',
    'Use ONLY the supplied data. Never invent feedback, testers, counts, percentages or consensus.',
    'Every finding must cite evidence_refs taken from the SOURCES list; findings without valid refs are discarded.',
    'Do not restate counts as facts of your own — the platform computes all numbers. Do not quote testers; the platform shows quotes itself.',
    'kind "interpretation" = your reading of why something happened; kind "recommendation" = what to do next (sections "priorities" or "next_steps").',
    'If the evidence is thin or contradictory, say so in "limitations". If there is not enough evidence for a section, return nothing for it.',
    'task_ref is one of the TASKS refs (e.g. "T2") or null.',
  ].join('\n');
  const tasks = stats.tasks.map((t) => ({ ref: `T${t.position}`, title: t.title, attempted: t.attempted, completed: t.completed,
    blocked: t.blocked, help_requested: t.help_requested, difficulty: t.difficulty }));
  const user = JSON.stringify({
    product_release: raw.release.version, round: raw.round.title,
    STATS: { ...stats, tasks: undefined }, TASKS: tasks,
    SOURCES: sources.map((s) => ({ ref: s.ref, type: s.type, tester: `tester-${shortId(s.session_id)}`,
      task: s.task_id ? `T${raw.tasks.find((t) => t.task_id === s.task_id)?.position ?? '?'}` : null, text: s.text })),
  });
  return { system, user, schema: LLM_SCHEMA };
}
const shortId = (id: string) => id.replace(/-/g, '').slice(0, 6);

// ---------------------------------------------------------------- orchestration
export function summarise(stats: Stats): string {
  if (!stats.sessions_started) return 'No testing sessions have started yet, so there is nothing to analyse.';
  const parts = [
    `${stats.sessions_completed} of ${plural(stats.sessions_started, 'started session')} reached a final review (target cohort: ${stats.cohort_size}).`,
    stats.rating.average !== null ? `Average rating ${stats.rating.average}/5 from ${plural(stats.rating.count, 'tester')}.` : 'No final ratings yet.',
    `${plural(stats.bugs.total, 'issue')} reported (${stats.bugs.critical} critical, ${stats.bugs.major} major, ${stats.bugs.minor} minor).`,
  ];
  const weakest = stats.tasks.filter((t) => t.attempted > 0).sort((a, b) => (a.completion_rate ?? 1) - (b.completion_rate ?? 1))[0];
  if (weakest && (weakest.completion_rate ?? 1) < 1) parts.push(`Lowest completion: “${weakest.title}” (${weakest.completed} of ${weakest.attempted}).`);
  return parts.join(' ');
}

export async function generateReport(raw: RawData, llm?: LlmCall, llmName?: string): Promise<ReportResult> {
  const sources = buildSources(raw);
  const stats = computeStats(raw);
  const limitations: string[] = [];
  if (!stats.sessions_started) limitations.push('No testing sessions have started. There is no evidence to analyse yet.');
  else if (stats.sessions_completed < 3) limitations.push(`Only ${plural(stats.sessions_completed, 'tester')} completed the test. Every finding is anecdotal; do not read it as a pattern.`);
  if (stats.sessions_started && stats.sessions_completed < stats.cohort_size) {
    limitations.push(`The target cohort is ${stats.cohort_size}; ${stats.sessions_completed} completed. Results may change as more testers finish.`);
  }
  const comparable = Object.values(stats.segments).some((g) => Object.values(g).filter((n) => n >= 2).length >= 2);
  if (stats.sessions_started && !comparable) limitations.push('Not enough testers per segment (device, country, experience) to compare groups — at least two groups of two are needed.');

  let generator = 'dev_heuristic'; let summary = summarise(stats); let drafts: DraftFinding[];
  if (llm && sources.length) {
    try {
      const prompt = buildPrompt(raw, sources, stats);
      const output = await llm(prompt);
      const taskByRef = new Map(stats.tasks.map((t) => [`T${t.position}`, t.task_id]));
      const modelDrafts: DraftFinding[] = (output.findings ?? [])
        .filter((f) => f.kind === 'interpretation' || f.kind === 'recommendation')        // a model may not add statements or counts
        .map((f) => ({ section: f.section as Section, kind: f.kind as Kind, title: f.title, body: f.body,
          task_id: f.task_ref ? taskByRef.get(f.task_ref) ?? null : null, evidence_refs: f.evidence_refs ?? [], limitations: f.limitations }));
      drafts = [...codeFindings(raw, sources, stats, false), ...modelDrafts];
      generator = llmName ?? 'llm';
      if (output.executive_summary?.trim()) summary = `${summary}\n\nAI summary (interpretation): ${output.executive_summary.trim()}`;
    } catch (e) {
      limitations.push(`The AI model call failed (${e instanceof Error ? e.message : 'unknown error'}); this report uses rule-based analysis only.`);
      drafts = codeFindings(raw, sources, stats, true);
    }
  } else {
    drafts = codeFindings(raw, sources, stats, true);
    if (!llm) limitations.push('No AI model is connected in this environment. Observations are computed directly from the data and recommendations follow fixed rules.');
  }
  const { findings, discarded } = validateFindings(drafts, sources, raw);
  if (discarded) limitations.push(`${plural(discarded, 'generated finding')} discarded because no verifiable evidence was cited.`);
  return { generator, stats, executive_summary: summary, limitations, findings };
}
