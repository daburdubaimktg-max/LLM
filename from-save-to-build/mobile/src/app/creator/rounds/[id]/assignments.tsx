// Tester assignment management: send (or withdraw) testing invitations for approved testers.
import { useLocalSearchParams } from 'expo-router';
import { ASSIGNMENT_STATUS, SESSION_STATUS, SignInPrompt, activeAssignmentFor, go, invalidateRound, isActiveAssignment, param, sessionForAssignment, useCreatorRound } from '@/components/creator-review';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import * as L from '@/lib/labels';
import type { Assignment, CreatorApplication, CreatorRoundData } from '@/lib/types';
import { Badge, Button, Card, ErrorNote, H2, H3, KeyValue, Muted, Notice, QueryView, Row, Screen, Section, confirm, theme, useAction } from '@/ui';

export default function AssignmentsScreen() {
  const { userId } = useAuth();
  const id = param(useLocalSearchParams<{ id: string }>().id);
  if (!userId) return <SignInPrompt title="Assignments" />;
  return <Assignments roundId={id} />;
}

function Assignments({ roundId }: { roundId: string }) {
  const query = useCreatorRound(roundId);
  return (
    <Screen title="Assignments">
      <QueryView query={query}>{(data) => {
        const active = data.assignments.filter(isActiveAssignment);
        const cohort = data.round.cohort_size;
        const unassigned = data.applications.filter((a) => a.status === 'approved' && !activeAssignmentFor(data, a.id));
        const waitlisted = data.applications.filter((a) => a.status === 'waitlisted').length;
        const nameOf = (applicationId: string) => data.applications.find((a) => a.id === applicationId)?.profile.display_name ?? 'Tester';
        return (
          <>
            <H2>Assigned {active.length} of {cohort} cohort places</H2>
            <Muted>
              An assignment is a testing invitation. It counts toward the cohort until the tester declines it or you withdraw it; it does not mean testing has started.
            </Muted>
            {data.round.status !== 'published' && <Notice tone="warn">The round must be published before testers can be assigned.</Notice>}

            <Section title="Approved, not yet assigned">
              {unassigned.length === 0
                ? <Muted>No approved testers are waiting for an invitation.</Muted>
                : unassigned.map((a) => <UnassignedRow key={a.id} app={a} roundId={roundId} />)}
            </Section>

            <Section title="Assigned testers">
              {active.length === 0
                ? <Muted>No invitations sent yet.</Muted>
                : active.map((s) => <AssignedRow key={s.id} assignment={s} name={nameOf(s.application_id)} data={data} roundId={roundId} />)}
            </Section>

            <Section title="Waitlist">
              <Card>
                <KeyValue k="Waitlisted testers" v={waitlisted} />
                <Button small variant="secondary" title="Review applications" onPress={() => go(`/creator/rounds/${roundId}/applications`)} testID="open-applications" />
              </Card>
            </Section>
          </>
        );
      }}</QueryView>
    </Screen>
  );
}

function UnassignedRow({ app, roundId }: { app: CreatorApplication; roundId: string }) {
  const assign = useAction(async () => { await api.assignTester(app.id); await invalidateRound(roundId); });
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }} gap={theme.space.md}>
        <H3 style={{ flex: 1 }}>{app.profile.display_name}</H3>
        <Button small title="Assign" loading={assign.loading} onPress={() => assign.run()} testID={`assign-tester-${app.id}`} />
      </Row>
      <Muted style={{ fontSize: theme.font.small }}>Approved {L.date(app.decided_at)}</Muted>
      <ErrorNote error={assign.error} />
      <Button small variant="ghost" title="View application" onPress={() => go(`/creator/rounds/${roundId}/applicant/${app.id}`)} />
    </Card>
  );
}

function AssignedRow({ assignment, name, data, roundId }: { assignment: Assignment; name: string; data: CreatorRoundData; roundId: string }) {
  const session = sessionForAssignment(data, assignment.id);
  const st = ASSIGNMENT_STATUS[assignment.status];
  const withdraw = useAction(async () => {
    if (!(await confirm('Withdraw this invitation?', `${name} will be told the testing invitation was withdrawn. They stay approved.`))) return;
    await api.removeAssignment(assignment.id);
    await invalidateRound(roundId);
  });
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }} gap={theme.space.md}>
        <H3 style={{ flex: 1 }}>{name}</H3>
        <Badge label={st.label} tone={st.tone} />
      </Row>
      <KeyValue k="Assigned" v={L.dateTime(assignment.assigned_at)} />
      <KeyValue k="Responded" v={assignment.responded_at ? L.dateTime(assignment.responded_at) : 'Not yet'} />
      <KeyValue k="Testing session" v={session ? SESSION_STATUS[session.status].label : 'Not started'} />
      <ErrorNote error={withdraw.error} />
      <Row wrap>
        {session && <Button small variant="secondary" title="Open session" onPress={() => go(`/creator/sessions/${session.id}`)} testID={`open-session-${session.id}`} />}
        <Button small variant="ghost" title="View application" onPress={() => go(`/creator/rounds/${roundId}/applicant/${assignment.application_id}`)} />
        {(assignment.status === 'invited' || assignment.status === 'accepted') && (
          <Button small variant="danger" title="Withdraw invitation" loading={withdraw.loading} onPress={() => withdraw.run()} testID={`withdraw-invitation-${assignment.id}`} />
        )}
      </Row>
    </Card>
  );
}
