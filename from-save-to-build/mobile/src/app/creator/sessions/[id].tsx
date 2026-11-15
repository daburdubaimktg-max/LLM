// One tester's session, creator view: every task at the version the tester actually ran.
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { EvidenceList, NavRow, Quote, SESSION_STATUS, SignInPrompt, VerdictBlock, go, param, plainValue, severityTone, yesNo } from '@/components/creator-review';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import * as L from '@/lib/labels';
import { keys } from '@/lib/query';
import type { SessionDetail, SessionTask } from '@/lib/types';
import { Badge, Card, Divider, Eyebrow, H1, H3, KeyValue, Loading, Muted, QueryView, Row, Screen, Section, theme, type Tone } from '@/ui';

const TASK_TONE: Record<string, Tone> = { completed: 'good', blocked: 'bad', skipped: 'warn', in_progress: 'info', not_started: 'neutral' };

export default function CreatorSessionScreen() {
  const { userId } = useAuth();
  const id = param(useLocalSearchParams<{ id: string }>().id);
  if (!userId) return <SignInPrompt title="Testing session" />;
  return <SessionView sessionId={id} />;
}

function SessionView({ sessionId }: { sessionId: string }) {
  const query = useQuery({ queryKey: keys.session(sessionId), queryFn: () => api.sessionDetail(sessionId), enabled: !!sessionId });
  const isTester = query.data?.viewer_role === 'tester';
  useEffect(() => { if (isTester) router.replace(`/sessions/${sessionId}` as never); }, [isTester, sessionId]);
  return (
    <Screen title="Testing session">
      {isTester ? <Loading /> : <QueryView query={query}>{(d) => <Body d={d} />}</QueryView>}
    </Screen>
  );
}

function Body({ d }: { d: SessionDetail }) {
  const st = SESSION_STATUS[d.session.status];
  const done = d.tasks.filter((t) => t.status === 'completed').length;
  return (
    <>
      <Eyebrow>{d.product.name} · {d.round.title}</Eyebrow>
      <H1>Tester session</H1>
      <Row wrap><Badge label={st.label} tone={st.tone} /></Row>

      <Card>
        <KeyValue k="Release tested" v={d.release.version} />
        <KeyValue k="Started" v={L.dateTime(d.session.started_at)} />
        <KeyValue k="Completed" v={d.session.completed_at ? L.dateTime(d.session.completed_at) : 'Not completed'} />
        <KeyValue k="Last activity" v={L.dateTime(d.session.last_activity_at)} />
        <KeyValue k="Tasks completed" v={`${done} of ${d.tasks.length}`} />
      </Card>

      <Section title="Consent given">
        <Card>
          {d.consent ? (
            <>
              <KeyValue k="Screenshots" v={yesNo(d.consent.screenshots)} />
              <KeyValue k="Screen recordings" v={yesNo(d.consent.recordings)} />
              <KeyValue k="Voice notes" v={yesNo(d.consent.voice)} />
              <Muted style={{ fontSize: theme.font.tiny }}>Recorded {L.dateTime(d.consent.granted_at)}. Evidence of a kind the tester did not consent to cannot be uploaded.</Muted>
            </>
          ) : <Muted>No consent record.</Muted>}
        </Card>
      </Section>

      <Section title="Tasks">
        {d.tasks.length === 0 ? <Muted>This session has no tasks.</Muted> : d.tasks.map((t) => <TaskCard key={t.id} t={t} />)}
      </Section>

      <Section title="Issues reported">
        {d.bugs.length === 0 ? <Muted>This tester reported no issues.</Muted> : (
          <Card>
            {d.bugs.map((b, i) => (
              <View key={b.id}>
                {i > 0 && <Divider />}
                <NavRow title={b.title} onPress={() => go(`/bugs/${b.id}`)} testID={`bug-${b.id}`}
                  detail={`${L.TRIAGE[b.triage_status] ?? b.triage_status} · ${b.attachments.length === 1 ? '1 attachment' : `${b.attachments.length} attachments`} · ${L.dateTime(b.created_at)}`}
                  right={<Badge label={L.SEVERITY[b.severity] ?? b.severity} tone={severityTone(b.severity)} />} />
              </View>
            ))}
          </Card>
        )}
      </Section>

      <Section title="Final review">
        {d.verdict ? (
          <Card>
            <VerdictBlock verdict={d.verdict} />
            {!!d.verdict.evidence?.length && <><Divider /><EvidenceList files={d.verdict.evidence} /></>}
          </Card>
        ) : <Muted>No final review submitted yet.</Muted>}
      </Section>
    </>
  );
}

function TaskCard({ t }: { t: SessionTask }) {
  const labels = new Map((t.version.feedback_questions ?? []).map((q) => [q.key, q]));
  return (
    <Card>
      <H3>{t.position}. {t.version.title}</H3>
      <Row wrap>
        <Badge label={L.TASK_STATUS[t.status] ?? t.status} tone={TASK_TONE[t.status] ?? 'neutral'} />
        <Badge label={`Task version ${t.version.version_number}`} />
        {!t.is_required && <Badge label="Optional" />}
      </Row>
      <KeyValue k="Difficulty" v={L.difficultyLabel(t.difficulty)} />
      <KeyValue k="Help requested" v={yesNo(t.help_requested)} />
      <KeyValue k="Ran into a problem" v={yesNo(t.had_problem)} />
      <KeyValue k="Active time" v={t.started_at ? L.duration(t.active_seconds) : '—'} />
      {t.feedback.map((f) => (
        <View key={f.id} style={{ gap: 6 }}>
          {f.comment?.trim() ? <Quote>{f.comment}</Quote> : null}
          {Object.entries(f.answers ?? {}).map(([k, v]) => {
            const q = labels.get(k);
            const shown = q?.options?.find((o) => o.value === v)?.label ?? plainValue(v);
            return <Muted key={k} style={{ fontSize: theme.font.small }}>{q?.label ?? k}: {shown}</Muted>;
          })}
        </View>
      ))}
      {t.feedback.every((f) => !f.comment?.trim()) && <Muted style={{ fontSize: theme.font.small }}>No written comment.</Muted>}
      {t.evidence.length > 0 && <><Divider /><EvidenceList files={t.evidence} /></>}
    </Card>
  );
}
