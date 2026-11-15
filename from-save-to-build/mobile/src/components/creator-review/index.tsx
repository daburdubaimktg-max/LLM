// Small helpers shared by the creator review & results screens (applications, assignments, bugs,
// feedback, sessions, validation reports). Display-only: every number shown comes from the read models.
import { useQuery } from '@tanstack/react-query';
import { router, useIsFocused } from 'expo-router';
import type { ReactNode } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { api } from '@/lib/api';
import * as L from '@/lib/labels';
import { keys, queryClient } from '@/lib/query';
import type { ApplicationForm, ApplicationStatus, Assignment, CreatorRoundData, EvidenceFile, Finding, FormQuestion, Session, Verdict } from '@/lib/types';
import { Badge, Button, Divider, Empty, ErrorNote, KeyValue, Muted, P, Row, Screen, Stack2, theme, useAction, type Option, type Tone } from '@/ui';

// ---------------------------------------------------------------- navigation & auth
export const go = (path: string) => router.push(path as never);
/** Route params can arrive as string[]; screens always want one id. */
export const param = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? '' : v ?? '');

export function SignInPrompt({ title }: { title: string }) {
  return (
    <Screen title={title}>
      <Empty title="Sign in to continue" body="This area is only available to the product team running the testing round."
        action={<Button title="Sign in" onPress={() => go('/sign-in')} testID="go-sign-in" />} />
    </Screen>
  );
}

// ---------------------------------------------------------------- data
/** The creator's read model for one round. `live` re-reads every 15 s while the screen is in front. */
export function useCreatorRound(roundId: string, live = false) {
  const focused = useIsFocused();
  return useQuery({ queryKey: keys.creatorRound(roundId), queryFn: () => api.creatorRoundData(roundId), enabled: !!roundId,
    refetchInterval: live && focused ? 15_000 : false });
}
/** Everything a change to applications / assignments can affect. */
export async function invalidateRound(roundId: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.creatorRound(roundId) }),
    queryClient.invalidateQueries({ queryKey: keys.creatorHome }),
    queryClient.invalidateQueries({ queryKey: keys.marketplace }),
  ]);
}

// ---------------------------------------------------------------- labels
const sentence = (s: string) => { const t = s.replace(/[._]+/g, ' ').trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : '—'; };
/** "task.completed" → "Task completed". */
export const humanise = (eventType: string | null | undefined) => sentence(eventType ?? '');

const BUG_EVENTS: Record<string, string> = { review: 'Marked as reviewed', categorise: 'Categorised', assign: 'Assigned', mark_duplicate: 'Marked as duplicate',
  mark_fixed: 'Marked as fixed', request_info: 'More information requested', close: 'Closed', reopen: 'Reopened', note: 'Internal note', tester_reply: 'Tester reply' };
export const bugEventLabel = (eventType: string) => BUG_EVENTS[eventType] ?? humanise(eventType);

export const isAiGenerator = (generator: string | null | undefined) => !!generator && generator.startsWith('openai:');
export function generatorLabel(generator: string | null | undefined): string {
  if (!generator) return '—';
  if (generator.startsWith('openai:')) return `AI model (${generator.slice('openai:'.length)})`;
  if (generator === 'dev_heuristic') return 'Rule-based analysis (no AI model connected)';
  return generator;
}
export const REPORT_STATUS: Record<string, { label: string; tone: Tone }> = { queued: { label: 'Queued', tone: 'info' }, processing: { label: 'Building', tone: 'info' },
  completed: { label: 'Ready', tone: 'good' }, failed: { label: 'Failed', tone: 'bad' } };

/** The four finding classes must never blur into each other, so each gets its own tag. */
export function kindTag(kind: Finding['kind'], generator: string | null | undefined): { label: string; tone: Tone } {
  const ai = isAiGenerator(generator);
  switch (kind) {
    case 'tester_statement': return { label: 'Tester said', tone: 'info' };
    case 'aggregated_observation': return { label: 'Counted from the data', tone: 'neutral' };
    case 'interpretation': return { label: ai ? 'AI interpretation' : 'Rule-based interpretation', tone: 'warn' };
    default: return { label: ai ? 'AI recommendation' : 'Rule-based recommendation', tone: 'warn' };
  }
}
export const CONFIDENCE: Record<string, { label: string; tone: Tone }> = { low: { label: 'Low confidence', tone: 'warn' },
  medium: { label: 'Medium confidence', tone: 'neutral' }, high: { label: 'High confidence', tone: 'good' } };
export const REVIEW_STATUS: Record<string, { label: string; tone: Tone }> = { pending: { label: 'Awaiting your review', tone: 'neutral' },
  approved: { label: 'Approved by you', tone: 'good' }, rejected: { label: 'Rejected by you', tone: 'bad' } };
export const SOURCE_TYPES: Record<string, string> = { task_feedback: 'Task feedback', bug_report: 'Bug report', verdict: 'Final review', task_completion: 'Task record' };

export const AWAITING: ApplicationStatus[] = ['submitted', 'under_review', 'info_requested'];
export const ASSIGNMENT_STATUS: Record<Assignment['status'], { label: string; tone: Tone }> = {
  invited: { label: 'Invited', tone: 'info' }, accepted: { label: 'Accepted', tone: 'good' }, declined: { label: 'Declined by tester', tone: 'bad' },
  in_progress: { label: 'Testing in progress', tone: 'info' }, completed: { label: 'Testing completed', tone: 'good' }, removed: { label: 'Invitation withdrawn', tone: 'neutral' } };
export const SESSION_STATUS: Record<Session['status'], { label: string; tone: Tone }> = { active: { label: 'Active', tone: 'info' }, paused: { label: 'Paused', tone: 'warn' },
  completed: { label: 'Completed', tone: 'good' }, abandoned: { label: 'Abandoned', tone: 'bad' } };
export const severityTone = (severity: string): Tone => (severity === 'critical' ? 'bad' : severity === 'major' ? 'warn' : 'neutral');
export const triageTone = (status: string): Tone => (status === 'new' ? 'info' : status === 'needs_info' ? 'warn' : status === 'fixed' ? 'good' : 'neutral');
export const yesNo = (v: boolean | null | undefined) => (v === true ? 'Yes' : v === false ? 'No' : '—');
export const testerRef = (sessionId: string) => `Tester ${sessionId.slice(0, 6)}`;

// ---------------------------------------------------------------- application answers
export const isBlank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.length === 0);
export const formQuestions = (form: ApplicationForm | null | undefined): FormQuestion[] => (form?.steps ?? []).flatMap((s) => s.questions);
/** A stored answer shown the way the tester saw it: option values become option labels. */
export function formatAnswer(q: Pick<FormQuestion, 'type' | 'options'>, value: unknown): string {
  if (isBlank(value)) return 'Not answered';
  const label = (v: unknown) => (q.type === 'country' ? L.country(String(v)) : q.options?.find((o) => o.value === v)?.label ?? String(v));
  return Array.isArray(value) ? value.map(label).join(', ') : label(value);
}
/** Free-form answers (task feedback questions) with no form definition to hand. */
export const plainValue = (v: unknown): string => (isBlank(v) ? 'Not answered' : Array.isArray(v) ? v.map(String).join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v));

// ---------------------------------------------------------------- round look-ups
/** Assignments that hold a cohort place (the server uses the same rule). */
export const isActiveAssignment = (a: Assignment) => a.status !== 'declined' && a.status !== 'removed';
export const activeAssignmentFor = (d: CreatorRoundData, applicationId: string) => d.assignments.find((a) => a.application_id === applicationId && isActiveAssignment(a));
export const sessionForAssignment = (d: CreatorRoundData, assignmentId: string) => d.sessions.find((s) => s.assignment_id === assignmentId);
/** Task titles by task id: the current builder title, else the title of the version a tester ran. */
export function taskTitles(d: CreatorRoundData): Map<string, string> {
  const m = new Map<string, string>();
  d.completions.forEach((c) => { if (c.title && !m.has(c.task_id)) m.set(c.task_id, c.title); });
  d.tasks.forEach((t) => m.set(t.id, t.version.title));
  return m;
}
export function taskOptions(d: CreatorRoundData): Option[] {
  const titles = taskTitles(d);
  const position = new Map<string, number>();
  d.completions.forEach((c) => position.set(c.task_id, c.position));
  d.tasks.forEach((t) => position.set(t.id, t.position));
  return [...titles.entries()].sort((a, b) => (position.get(a[0]) ?? 0) - (position.get(b[0]) ?? 0)).map(([value, label]) => ({ value, label }));
}
export const matchesSegments = (answers: Record<string, unknown> | null | undefined, segments: Record<string, string>) =>
  Object.entries(segments).every(([k, v]) => !v || answers?.[k] === v);

// ---------------------------------------------------------------- shared pieces
/** A quiet tappable list row with a trailing chevron. */
export function NavRow({ title, detail, onPress, testID, right }: { title: string; detail?: string; onPress: () => void; testID?: string; right?: ReactNode }) {
  return (
    <Pressable testID={testID} accessibilityRole="link" onPress={onPress}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: theme.space.md, paddingVertical: theme.space.md, minHeight: 48 }, pressed && { opacity: 0.6 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: theme.font.body, fontWeight: '600', color: theme.color.ink }}>{title}</Text>
        {!!detail && <Muted style={{ fontSize: theme.font.small }}>{detail}</Muted>}
      </View>
      {right}
      <Text style={{ fontSize: 20, color: theme.color.muted }}>›</Text>
    </Pressable>
  );
}
export function Quote({ children }: { children: string }) {
  return (
    <View style={{ borderLeftWidth: 3, borderLeftColor: theme.color.line, paddingLeft: theme.space.md }}>
      <P style={{ fontStyle: 'italic' }}>“{children}”</P>
    </View>
  );
}

function EvidenceRow({ file }: { file: EvidenceFile }) {
  const open = useAction(async () => { await Linking.openURL(await api.evidenceUrl(file.storage_path)); });
  return (
    <View style={{ gap: 6 }}>
      <Row style={{ justifyContent: 'space-between' }} gap={theme.space.md}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: theme.font.small, fontWeight: '600', color: theme.color.ink }}>{L.EVIDENCE[file.kind] ?? humanise(file.kind)}</Text>
          <Muted style={{ fontSize: theme.font.small }} numberOfLines={1}>{file.file_name ?? 'Unnamed file'}</Muted>
        </View>
        <Button small variant="secondary" title="View" loading={open.loading} onPress={() => open.run()} testID={`view-evidence-${file.id}`} />
      </Row>
      <ErrorNote error={open.error} />
    </View>
  );
}
/** Private evidence files. Each "View" asks for a fresh signed link that works for 60 seconds. */
export function EvidenceList({ files, emptyText }: { files: EvidenceFile[]; emptyText?: string }) {
  if (!files.length) return emptyText ? <Muted style={{ fontSize: theme.font.small }}>{emptyText}</Muted> : null;
  return (
    <Stack2 gap={theme.space.sm}>
      {files.map((f) => <EvidenceRow key={f.id} file={f} />)}
      <Muted style={{ fontSize: theme.font.tiny }}>Files are private. “View” opens a secure link that is valid for 60 seconds.</Muted>
    </Stack2>
  );
}

/** A tester's final review. Later corrections are listed underneath; the original is never rewritten. */
export function VerdictBlock({ verdict }: { verdict: Verdict }) {
  return (
    <Stack2 gap={theme.space.sm}>
      <Row wrap><Badge label={L.verdictLabel(verdict.verdict)} tone="info" /><Badge label={`Rating ${verdict.rating} of 5`} /></Row>
      <KeyValue k="Would use it" v={L.wouldUseLabel(verdict.would_use)} />
      <KeyValue k="Submitted" v={L.dateTime(verdict.submitted_at)} />
      <Muted style={{ fontSize: theme.font.small }}>Reason for the verdict</Muted>
      <Quote>{verdict.reason}</Quote>
      <Muted style={{ fontSize: theme.font.small }}>Biggest improvement</Muted>
      <Quote>{verdict.biggest_improvement}</Quote>
      {verdict.amendments.length > 0 && (
        <>
          <Divider />
          <Muted style={{ fontSize: theme.font.small }}>
            {verdict.amendments.length === 1 ? '1 later correction' : `${verdict.amendments.length} later corrections`} from the tester. The original above is unchanged.
          </Muted>
          {verdict.amendments.map((am) => (
            <View key={am.id} style={{ backgroundColor: theme.color.soft, borderRadius: theme.radius.md, padding: theme.space.md, gap: 4 }}>
              <Muted style={{ fontSize: theme.font.tiny }}>Correction · {L.dateTime(am.created_at)}</Muted>
              {am.rating !== null && <P style={{ fontSize: theme.font.small }}>Rating changed to {am.rating} of 5</P>}
              {am.verdict !== null && <P style={{ fontSize: theme.font.small }}>Verdict changed to {L.verdictLabel(am.verdict)}</P>}
              {am.would_use !== null && <P style={{ fontSize: theme.font.small }}>Would use it: {L.wouldUseLabel(am.would_use)}</P>}
              {am.biggest_improvement !== null && <P style={{ fontSize: theme.font.small }}>Biggest improvement: “{am.biggest_improvement}”</P>}
              <P style={{ fontSize: theme.font.small }}>Why: “{am.reason}”</P>
            </View>
          ))}
        </>
      )}
    </Stack2>
  );
}
