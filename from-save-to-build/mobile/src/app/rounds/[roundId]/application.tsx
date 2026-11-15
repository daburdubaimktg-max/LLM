import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { AnswersSummary, Collapsible, SignInScreen, go, minutesRange } from '@/components/tester';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { APPLICATION_STATUS, date } from '@/lib/labels';
import { keys, queryClient } from '@/lib/query';
import type { Application, RoundDetail } from '@/lib/types';
import { Badge, Button, Card, Empty, ErrorNote, H1, KeyValue, Muted, Notice, P, QueryView, Row, Screen, Section, confirm, theme, useAction } from '@/ui';

const STEPS = [
  { title: 'Submitted', body: 'Your application reaches the product team.' },
  { title: 'Under review', body: 'The team reads your answers. They may ask you a question.' },
  { title: 'Decision', body: 'You are approved, waitlisted or declined. Approved means you have a place — it is not yet an invitation to start.' },
  { title: 'Invitation', body: 'The team sends your testing invitation with instructions. Testing starts only after you accept it.' },
];
/** How many timeline steps have been reached (0–4). */
function reached(app: Application, hasAssignment: boolean) {
  if (hasAssignment) return 4;
  if (app.status === 'approved' || app.status === 'waitlisted' || app.status === 'declined') return 3;
  if (app.status === 'under_review' || app.status === 'info_requested') return 2;
  if (app.status === 'submitted' || (app.status === 'withdrawn' && app.submitted_at)) return 1;
  return 0;
}

function Timeline({ done }: { done: number }) {
  return (
    <View>
      {STEPS.map((s, i) => {
        const isDone = i < done;
        const isNext = i === done;
        return (
          <Row key={s.title} style={{ alignItems: 'stretch' }} gap={theme.space.md}>
            <View style={{ alignItems: 'center', width: 24 }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2,
                borderColor: isDone || isNext ? theme.color.accent : theme.color.line, backgroundColor: isDone ? theme.color.accent : theme.color.surface }}>
                {isDone && <Text style={{ color: theme.color.onAccent, fontSize: 12, fontWeight: '700' }}>✓</Text>}
              </View>
              {i < STEPS.length - 1 && <View style={{ flex: 1, width: 2, minHeight: 16, backgroundColor: isDone ? theme.color.accent : theme.color.line }} />}
            </View>
            <View style={{ flex: 1, paddingBottom: theme.space.lg, gap: 2 }}>
              <P style={{ color: isDone || isNext ? theme.color.ink : theme.color.muted, fontWeight: '600' }}>{s.title}</P>
              <Muted style={{ fontSize: theme.font.small }}>{s.body}</Muted>
            </View>
          </Row>
        );
      })}
    </View>
  );
}

function Status({ d, justSubmitted }: { d: RoundDetail; justSubmitted: boolean }) {
  const roundId = d.round.id;
  const app = d.my_application;
  const asg = d.my_assignment;
  const [showAnswers, setShowAnswers] = useState(false);
  const withdraw = useAction(async () => {
    if (!app) return;
    if (!(await confirm('Withdraw your application?', 'The product team will no longer consider you for this testing round.'))) return;
    await api.withdrawApplication(app.id);
    await Promise.all([keys.round(roundId), keys.myTesting, keys.marketplace, keys.notifications].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  });

  if (!app) {
    return <Empty title="No application yet" body="You have not applied to this testing round."
      action={<Button title="See the testing round" onPress={() => go(`/rounds/${roundId}`)} />} />;
  }
  const status = APPLICATION_STATUS[app.status];
  const canWithdraw = ['submitted', 'under_review', 'info_requested', 'approved', 'waitlisted'].includes(app.status);
  return (
    <>
      {justSubmitted && app.status !== 'draft' ? (
        <>
          <H1>Application sent</H1>
          <P>Thank you for offering your time. The {d.product.name} team will read your answers and you will get a message in your inbox as soon as they decide. There is nothing more to do for now.</P>
        </>
      ) : (
        <H1>Your application</H1>
      )}
      <Muted>{d.product.name} · Version {d.release.version}</Muted>

      <Card>
        <Row><Badge label={status.label} tone={status.tone} />{app.is_demo && <Badge tone="warn" label="Demonstration data" />}</Row>
        <P>{status.help}</P>
        {app.submitted_at && <KeyValue k="Submitted" v={date(app.submitted_at)} />}
        {app.decided_at && <KeyValue k="Decision" v={date(app.decided_at)} />}
      </Card>

      {app.status === 'draft' && <Button title="Continue your application" testID="continue-application" onPress={() => go(`/rounds/${roundId}/apply`)} />}

      {app.status === 'info_requested' && (
        <>
          <Notice tone="warn" title="The team asked you a question">{app.creator_message ?? 'Please update your application and send it again.'}</Notice>
          <Button title="Update my application" testID="update-application" onPress={() => go(`/rounds/${roundId}/apply`)} />
        </>
      )}
      {app.status !== 'info_requested' && !!app.creator_message && <Notice tone="neutral" title="Message from the team">{app.creator_message}</Notice>}

      {asg ? (
        <>
          {asg.status === 'removed' || asg.status === 'declined'
            ? <Muted>{asg.status === 'declined' ? 'You declined the testing invitation.' : 'Your testing invitation was withdrawn by the team.'}</Muted>
            : <Notice tone="good" title="Your testing invitation is ready">Open it to read the instructions and get started.</Notice>}
          <Button title={asg.status === 'removed' || asg.status === 'declined' ? 'View invitation' : 'Open your testing invitation'} testID="open-invitation"
            variant={asg.status === 'removed' || asg.status === 'declined' ? 'secondary' : 'primary'} onPress={() => go(`/assignments/${asg.id}`)} />
        </>
      ) : app.status === 'approved' ? (
        <Notice tone="info" title="Approved is not an invitation yet">
          You have a place in this round. Testing starts once the team sends your invitation — it will show up here, in My tests and in your inbox.
        </Notice>
      ) : null}

      <Section title="What happens next">
        <Timeline done={reached(app, !!asg)} />
      </Section>

      <Collapsible title="Your answers" open={showAnswers} onToggle={() => setShowAnswers(!showAnswers)} testID="toggle-answers">
        <AnswersSummary form={d.application_form ?? { steps: [] }} answers={app.answers ?? {}} availability={app}
          minutes={minutesRange(d.round.expected_minutes_min, d.round.expected_minutes_max)} />
      </Collapsible>

      {canWithdraw && (
        <View style={{ gap: theme.space.sm, marginTop: theme.space.xl }}>
          <ErrorNote error={withdraw.error} />
          <Button variant="danger" title="Withdraw application" testID="withdraw-application" loading={withdraw.loading} onPress={() => withdraw.run()} />
        </View>
      )}
    </>
  );
}

export default function ApplicationStatus() {
  const { roundId, submitted } = useLocalSearchParams<{ roundId: string; submitted?: string }>();
  const { userId, ready } = useAuth();
  const q = useQuery({ queryKey: keys.round(roundId), queryFn: () => api.roundDetail(roundId), enabled: !!userId });
  if (ready && !userId) return <SignInScreen title="Application" message="Sign in to see your application." next={`/rounds/${roundId}/application`} />;
  return (
    <Screen title="Application">
      <QueryView query={q}>{(d) => <Status d={d} justSubmitted={submitted === '1'} />}</QueryView>
      <Button variant="ghost" title="Go to my tests" testID="go-my-tests" onPress={() => go('/(tabs)/tests')} />
    </Screen>
  );
}
