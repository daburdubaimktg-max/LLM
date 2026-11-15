// Application review: approve, waitlist or decline. Approving is not assigning — that is a separate step.
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { AWAITING, SignInPrompt, activeAssignmentFor, formQuestions, formatAnswer, go, invalidateRound, isBlank, param, useCreatorRound } from '@/components/creator-review';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import * as L from '@/lib/labels';
import type { CreatorApplication, CreatorRoundData } from '@/lib/types';
import { Badge, Button, Card, Chip, Empty, ErrorNote, H2, H3, Muted, QueryView, Row, Screen, confirm, theme, useAction } from '@/ui';

type Tab = 'awaiting' | 'approved' | 'waitlisted' | 'declined' | 'withdrawn';
const TABS: { value: Tab; label: string }[] = [{ value: 'awaiting', label: 'Awaiting review' }, { value: 'approved', label: 'Approved' },
  { value: 'waitlisted', label: 'Waitlisted' }, { value: 'declined', label: 'Declined' }, { value: 'withdrawn', label: 'Withdrawn' }];
const inTab = (a: CreatorApplication, tab: Tab) => (tab === 'awaiting' ? AWAITING.includes(a.status) : a.status === tab);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function ApplicationsScreen() {
  const { userId } = useAuth();
  const id = param(useLocalSearchParams<{ id: string }>().id);
  if (!userId) return <SignInPrompt title="Applications" />;
  return <Applications roundId={id} />;
}

function Applications({ roundId }: { roundId: string }) {
  const query = useCreatorRound(roundId);
  const [tab, setTab] = useState<Tab>('awaiting');
  return (
    <Screen title="Applications">
      <QueryView query={query}>{(data) => {
        const rows = data.applications.filter((a) => inTab(a, tab));
        const cohort = data.round.cohort_size;
        return (
          <>
            <H2>Approved {data.stats.approved_testers} of {cohort} places</H2>
            <Muted>
              {data.stats.remaining_places > 0 ? `${plural(data.stats.remaining_places, 'place', 'places')} remaining.` : 'No places remaining. New applicants can be waitlisted.'}
              {' '}Approving a tester does not send their testing invitation — you assign them afterwards.
            </Muted>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.sm, paddingVertical: theme.space.sm }}>
              {TABS.map((t) => (
                <Chip key={t.value} testID={`tab-${t.value}`} selected={tab === t.value} onPress={() => setTab(t.value)}
                  label={`${t.label} (${data.applications.filter((a) => inTab(a, t.value)).length})`} />
              ))}
            </ScrollView>
            {rows.length === 0
              ? <Empty title="No applications here" body={data.applications.length === 0 ? 'Nobody has applied to this round yet.' : 'Nothing with this status right now.'} />
              : rows.map((a) => <ApplicationRow key={a.id} app={a} data={data} roundId={roundId} />)}
          </>
        );
      }}</QueryView>
    </Screen>
  );
}

function ApplicationRow({ app, data, roundId }: { app: CreatorApplication; data: CreatorRoundData; roundId: string }) {
  const decide = useAction(async (decision: 'approved' | 'waitlisted' | 'declined') => {
    if (decision === 'declined' && !(await confirm('Decline this application?', `${app.profile.display_name} will be told they were not selected for this round.`))) return;
    await api.reviewApplication(app.id, decision);
    await invalidateRound(roundId);
  });
  const status = L.APPLICATION_STATUS[app.status];
  const assigned = !!activeAssignmentFor(data, app.id);
  const keyAnswers = formQuestions(data.round.application_form).filter((q) => q.segment && !isBlank(app.answers?.[q.key])).slice(0, 3);
  const awaiting = AWAITING.includes(app.status);
  const canApprove = awaiting || app.status === 'waitlisted';
  const canWaitlist = awaiting;
  const canDecline = awaiting || app.status === 'waitlisted';

  return (
    <Card testID={`application-${app.id}`}>
      <Pressable accessibilityRole="link" onPress={() => go(`/creator/rounds/${roundId}/applicant/${app.id}`)} style={({ pressed }) => [{ gap: theme.space.sm }, pressed && { opacity: 0.6 }]}>
        <Row style={{ justifyContent: 'space-between' }} gap={theme.space.md}>
          <H3 style={{ flex: 1 }}>{app.profile.display_name}</H3>
          <Muted style={{ fontSize: 20 }}>›</Muted>
        </Row>
        <Row wrap>
          <Badge label={status.label} tone={status.tone} />
          {app.status === 'approved' && <Badge label={assigned ? 'Assigned' : 'Not yet assigned'} tone={assigned ? 'good' : 'warn'} />}
          {(app.is_demo || app.profile.is_demo) && <Badge label="Demo" />}
        </Row>
        <Muted style={{ fontSize: theme.font.small }}>Submitted {L.date(app.submitted_at)}</Muted>
        {keyAnswers.length > 0 && (
          <View style={{ gap: 2 }}>
            {keyAnswers.map((q) => <Muted key={q.key} style={{ fontSize: theme.font.small }}>{q.label}: {formatAnswer(q, app.answers[q.key])}</Muted>)}
          </View>
        )}
        <Muted style={{ fontSize: theme.font.small }}>
          Previous contributions: {plural(app.completed_tests, 'completed test', 'completed tests')} · {plural(app.issues_reported, 'issue reported', 'issues reported')}
        </Muted>
      </Pressable>
      <ErrorNote error={decide.error} />
      {(canApprove || canWaitlist || canDecline) && (
        <Row wrap>
          {canApprove && <Button small title="Approve" loading={decide.loading} onPress={() => decide.run('approved')} testID={`approve-application-${app.id}`} />}
          {canWaitlist && <Button small variant="secondary" title="Waitlist" disabled={decide.loading} onPress={() => decide.run('waitlisted')} testID={`waitlist-application-${app.id}`} />}
          {canDecline && <Button small variant="danger" title="Decline" disabled={decide.loading} onPress={() => decide.run('declined')} testID={`decline-application-${app.id}`} />}
        </Row>
      )}
    </Card>
  );
}
