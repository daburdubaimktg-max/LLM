import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';
import { SignInScreen, go, minutesRange } from '@/components/tester';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { APPLICATION_STATUS, date, verdictLabel } from '@/lib/labels';
import { keys } from '@/lib/query';
import type { MyTestingItem } from '@/lib/types';
import { Badge, Button, Card, Empty, H1, H3, Muted, P, Progress, QueryView, Row, Screen, Section, theme, type Tone } from '@/ui';

type Group = 'invitation' | 'progress' | 'application' | 'history';
function groupOf(i: MyTestingItem): Group {
  if (i.session) return i.session.status === 'active' || i.session.status === 'paused' ? 'progress' : 'history';
  if (i.assignment && (i.assignment.status === 'invited' || i.assignment.status === 'accepted')) return 'invitation';
  if (i.assignment && (i.assignment.status === 'declined' || i.assignment.status === 'removed')) return 'history';
  if (i.application.status === 'declined' || i.application.status === 'withdrawn') return 'history';
  return 'application';
}

function Item({ item, group }: { item: MyTestingItem; group: Group }) {
  const { application, round, product, release, assignment, session, verdict } = item;
  let path = application.status === 'draft' ? `/rounds/${round.id}/apply` : `/rounds/${round.id}/application`;
  let badge: { label: string; tone: Tone } = APPLICATION_STATUS[application.status];
  let detail: string | null = null;
  if (group === 'invitation' && assignment) {
    path = `/assignments/${assignment.id}`;
    badge = assignment.status === 'invited' ? { label: 'Invitation waiting', tone: 'good' } : { label: 'Ready to start', tone: 'good' };
    detail = `${minutesRange(round.expected_minutes_min, round.expected_minutes_max)}${round.testing_deadline ? ` · finish by ${date(round.testing_deadline)}` : ''}`;
  } else if (group === 'progress' && session) {
    path = `/sessions/${session.id}`;
    badge = session.status === 'paused' ? { label: 'Paused', tone: 'warn' } : { label: 'In progress', tone: 'info' };
    detail = round.testing_deadline ? `Finish by ${date(round.testing_deadline)}` : null;
  } else if (group === 'history') {
    if (session?.status === 'completed') {
      path = `/sessions/${session.id}/done`;
      badge = { label: 'Completed', tone: 'good' };
      detail = verdict ? `Your verdict: ${verdictLabel(verdict.verdict)} · rated ${verdict.rating} out of 5 · ${date(verdict.submitted_at)}` : `Finished ${date(session.completed_at)}`;
    } else if (session) {
      path = `/sessions/${session.id}`;
      badge = { label: 'Left the test', tone: 'neutral' };
    } else if (assignment && (assignment.status === 'declined' || assignment.status === 'removed')) {
      path = `/assignments/${assignment.id}`;
      badge = assignment.status === 'declined' ? { label: 'Invitation declined', tone: 'neutral' } : { label: 'Invitation withdrawn', tone: 'neutral' };
    }
  } else if (application.status === 'draft') {
    detail = 'Not sent yet — pick up where you left off.';
  } else if (application.submitted_at) {
    detail = `Sent ${date(application.submitted_at)}`;
  }
  return (
    <Card testID={`test-${application.id}`} onPress={() => go(path)}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <H3 style={{ flex: 1 }}>{product.name}</H3>
        <Badge label={badge.label} tone={badge.tone} />
      </Row>
      <Muted style={{ fontSize: theme.font.small }}>{round.title} · Version {release.version}</Muted>
      {detail && <P style={{ fontSize: theme.font.small }}>{detail}</P>}
      {group === 'progress' && session && <Progress value={session.tasks_done} total={session.tasks_total} label="Tasks finished" />}
    </Card>
  );
}

const SECTIONS: { group: Group; title: string }[] = [
  { group: 'invitation', title: 'Invitations' }, { group: 'progress', title: 'In progress' },
  { group: 'application', title: 'Applications' }, { group: 'history', title: 'History' }];

export default function MyTests() {
  const { userId, ready } = useAuth();
  const q = useQuery({ queryKey: keys.myTesting, queryFn: () => api.myTesting(), enabled: !!userId });
  if (ready && !userId) return <SignInScreen title="My tests" message="Sign in to see your applications, invitations and the tests you have done." />;
  return (
    <Screen title="My tests">
      <Row style={{ justifyContent: 'space-between' }}>
        <H1>My tests</H1>
        <Button small variant="ghost" title="Refresh" testID="refresh-tests" loading={q.isRefetching} onPress={() => { void q.refetch(); }} />
      </Row>
      <QueryView query={q}>
        {(items) => {
          if (items.length === 0) {
            return <Empty title="Nothing here yet" body="When you apply to test a product, it shows up here."
              action={<Button title="Find something to test" testID="go-discover" onPress={() => go('/')} />} />;
          }
          return (
            <View>
              {SECTIONS.map(({ group, title }) => {
                const rows = items.filter((i) => groupOf(i) === group);
                if (rows.length === 0) return null;
                return (
                  <Section key={group} title={title}>
                    {rows.map((i) => <Item key={i.application.id} item={i} group={group} />)}
                  </Section>
                );
              })}
            </View>
          );
        }}
      </QueryView>
    </Screen>
  );
}
