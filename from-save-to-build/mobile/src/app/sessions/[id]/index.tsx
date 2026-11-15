import { useQuery } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { SignInScreen, blockingTask, go, isFinished, requiredRemaining, sortedTasks, taskTitle } from '@/components/tester';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { SEVERITY, TASK_STATUS, TRIAGE, date, verdictLabel } from '@/lib/labels';
import { keys, queryClient } from '@/lib/query';
import type { SessionDetail, SessionTask } from '@/lib/types';
import { Badge, Button, Card, ErrorNote, H1, H3, Muted, Notice, P, Progress, QueryView, Row, Screen, Section, confirm, theme, useAction, type Tone } from '@/ui';

const STATUS_TONE: Record<string, Tone> = { not_started: 'neutral', in_progress: 'info', completed: 'good', blocked: 'warn', skipped: 'neutral' };
const SEVERITY_TONE: Record<string, Tone> = { minor: 'neutral', major: 'warn', critical: 'bad' };

function TaskRow({ task, tasks, sessionId }: { task: SessionTask; tasks: SessionTask[]; sessionId: string }) {
  const waitingOn = task.status === 'not_started' ? blockingTask(task, tasks) : null;
  const minutes = task.version?.estimated_minutes;
  return (
    <Card testID={`task-${task.position}`} onPress={waitingOn ? undefined : () => go(`/sessions/${sessionId}/task/${task.id}`)} style={waitingOn ? { opacity: 0.6 } : undefined}>
      <Row style={{ alignItems: 'flex-start' }} gap={theme.space.md}>
        <Text style={{ width: 22, fontSize: theme.font.body, fontWeight: '700', color: theme.color.accent, lineHeight: 23 }}>{task.position}</Text>
        <View style={{ flex: 1, gap: 4 }}>
          <H3>{taskTitle(task)}</H3>
          <Row wrap>
            <Badge label={waitingOn ? 'Locked' : TASK_STATUS[task.status] ?? task.status} tone={waitingOn ? 'neutral' : STATUS_TONE[task.status] ?? 'neutral'} />
            {!task.is_required && <Badge label="Optional" />}
            {!!minutes && <Muted style={{ fontSize: theme.font.small }}>about {minutes} min</Muted>}
          </Row>
          {waitingOn && <Muted style={{ fontSize: theme.font.small }}>Finish “{taskTitle(waitingOn)}” first</Muted>}
        </View>
      </Row>
    </Card>
  );
}

function Overview({ d }: { d: SessionDetail }) {
  const { session, round, product, release } = d;
  const id = session.id;
  const tasks = sortedTasks(d.tasks);
  const finished = tasks.filter(isFinished).length;
  const remaining = requiredRemaining(tasks);
  const [justPaused, setJustPaused] = useState(false);
  const refresh = () => Promise.all([keys.session(id), keys.myTesting].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  const pause = useAction(async () => { await api.pauseSession(id); setJustPaused(true); await refresh(); });
  const resume = useAction(async () => { await api.resumeSession(id); setJustPaused(false); await refresh(); });
  const leave = useAction(async () => {
    if (!(await confirm('Leave this test?', 'You will not be able to continue it afterwards. What you already sent stays with the team.'))) return;
    await api.leaveSession(id);
    await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: keys.assignment(session.assignment_id) }), queryClient.invalidateQueries({ queryKey: keys.round(session.round_id) })]);
  });
  const open = session.status === 'active' || session.status === 'paused';

  return (
    <>
      <H1>{product.name}</H1>
      <Muted>Version {release.version}{round.testing_deadline ? ` · finish by ${date(round.testing_deadline)}` : ''}</Muted>
      <Progress value={finished} total={tasks.length} label="Tasks finished" />

      {session.status === 'completed' && (
        <>
          <Notice tone="good" title="You finished this test">
            {d.verdict ? `Your verdict: ${verdictLabel(d.verdict.verdict)} · rated ${d.verdict.rating} out of 5 · sent ${date(d.verdict.submitted_at)}` : 'Thank you for taking part.'}
          </Notice>
          <Button title="View your submission" testID="view-submission" onPress={() => go(`/sessions/${id}/done`)} />
        </>
      )}
      {session.status === 'abandoned' && (
        <Notice tone="neutral" title="You left this test">This test is closed, so the tasks can no longer be changed. Anything you had already sent stays with the team.</Notice>
      )}
      {session.status === 'paused' && (
        <>
          <Notice tone="warn" title="This test is paused">{justPaused ? 'Your progress is saved. Come back whenever you are ready.' : 'Your progress is saved. Resume to carry on where you left off.'}</Notice>
          <ErrorNote error={resume.error} />
          <Button title="Resume testing" testID="resume-testing" loading={resume.loading} onPress={() => resume.run()} />
        </>
      )}
      {session.status === 'active' && (remaining.length === 0 ? (
        <>
          <Notice tone="good" title="All the required tasks are done">One last step: tell the team what you thought overall.</Notice>
          <Button title="Go to final review" testID="go-final-review" onPress={() => go(`/sessions/${id}/review`)} />
        </>
      ) : (
        <Muted>{remaining.length === 1 ? '1 required task left' : `${remaining.length} required tasks left`} before the final review.</Muted>
      ))}

      <Section title="Tasks">
        {tasks.map((t) => <TaskRow key={t.id} task={t} tasks={tasks} sessionId={id} />)}
      </Section>

      <Section title="Issues you reported">
        {d.bugs.length === 0 && <Muted>None so far. If something breaks or looks wrong, tell the team here.</Muted>}
        {d.bugs.map((b) => (
          <Card key={b.id} onPress={() => go(`/bugs/${b.id}`)}>
            <H3>{b.title}</H3>
            <Row wrap><Badge label={SEVERITY[b.severity] ?? b.severity} tone={SEVERITY_TONE[b.severity] ?? 'neutral'} /><Badge label={TRIAGE[b.triage_status] ?? b.triage_status} /></Row>
          </Card>
        ))}
        {open && <Button variant="secondary" title="Report a problem" testID="report-problem" onPress={() => go(`/sessions/${id}/bug`)} />}
      </Section>

      {(!!round.access_instructions || !!round.support_contact) && (
        <Section title="Need a reminder?">
          {!!round.access_instructions && <P>{round.access_instructions}</P>}
          {!!round.support_contact && <Text selectable style={{ fontSize: theme.font.small, color: theme.color.muted }}>Help: {round.support_contact}</Text>}
        </Section>
      )}

      {session.status === 'active' && (
        <View style={{ marginTop: theme.space.xl, gap: theme.space.sm }}>
          <ErrorNote error={pause.error} />
          <Button small variant="secondary" title="Pause for now" testID="pause-testing" loading={pause.loading} onPress={() => pause.run()} />
        </View>
      )}
      {open && (
        <View style={{ marginTop: theme.space.xl, gap: theme.space.sm }}>
          <ErrorNote error={leave.error} />
          <Button small variant="ghost" title="Leave this test" testID="leave-test" loading={leave.loading} onPress={() => leave.run()} />
        </View>
      )}
    </>
  );
}

export default function SessionOverview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId, ready } = useAuth();
  const q = useQuery({ queryKey: keys.session(id), queryFn: () => api.sessionDetail(id), enabled: !!userId });
  if (ready && !userId) return <SignInScreen title="Your test" message="Sign in to continue your test." next={`/sessions/${id}`} />;
  if (q.data?.viewer_role === 'creator') return <Redirect href={`/creator/sessions/${id}` as never} />;
  return (
    <Screen title="Your test">
      <QueryView query={q}>{(d) => <Overview d={d} />}</QueryView>
    </Screen>
  );
}
