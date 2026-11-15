// Tester profile review for one application: who they are, what they answered, and the decision.
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ASSIGNMENT_STATUS, AWAITING, SESSION_STATUS, SignInPrompt, activeAssignmentFor, formatAnswer, go, invalidateRound, param, sessionForAssignment, useCreatorRound, yesNo } from '@/components/creator-review';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import * as L from '@/lib/labels';
import type { CreatorApplication, CreatorRoundData } from '@/lib/types';
import { Badge, Button, Card, Empty, ErrorNote, Field, H1, H3, KeyValue, Muted, Notice, P, QueryView, Row, Screen, Section, confirm, theme, useAction } from '@/ui';

type Decision = 'under_review' | 'approved' | 'waitlisted' | 'declined' | 'info_requested';
const list = (xs: string[] | null | undefined, labels?: Record<string, string>) => (xs?.length ? xs.map((x) => labels?.[x] ?? x).join(', ') : '—');

export default function ApplicantScreen() {
  const { userId } = useAuth();
  const p = useLocalSearchParams<{ id: string; applicationId: string }>();
  const roundId = param(p.id); const applicationId = param(p.applicationId);
  if (!userId) return <SignInPrompt title="Tester application" />;
  return <Applicant roundId={roundId} applicationId={applicationId} />;
}

function Applicant({ roundId, applicationId }: { roundId: string; applicationId: string }) {
  const query = useCreatorRound(roundId);
  return (
    <Screen title="Tester application">
      <QueryView query={query}>{(data) => {
        const app = data.applications.find((a) => a.id === applicationId);
        if (!app) return <Empty title="Application not found" body="It may have been withdrawn before it was submitted, or it belongs to another round." />;
        return <Review app={app} data={data} roundId={roundId} />;
      }}</QueryView>
    </Screen>
  );
}

function Review({ app, data, roundId }: { app: CreatorApplication; data: CreatorRoundData; roundId: string }) {
  const [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState('');
  const status = L.APPLICATION_STATUS[app.status];
  const assignment = activeAssignmentFor(data, app.id);
  const lastInactive = [...data.assignments].reverse().find((a) => a.application_id === app.id && (a.status === 'declined' || a.status === 'removed'));
  const session = assignment ? sessionForAssignment(data, assignment.id) : undefined;

  const decide = useAction(async (decision: Decision) => {
    setMessageError('');
    if (decision === 'info_requested' && !message.trim()) { setMessageError('Tell the tester what information you need'); return; }
    if (decision === 'declined' && !(await confirm('Decline this application?', `${app.profile.display_name} will be told they were not selected for this round.`))) return;
    await api.reviewApplication(app.id, decision, decision === 'info_requested' ? message.trim() : undefined);
    if (decision === 'info_requested') setMessage('');
    await invalidateRound(roundId);
  });
  const assign = useAction(async () => { await api.assignTester(app.id); await invalidateRound(roundId); });
  const withdraw = useAction(async () => {
    if (!assignment) return;
    if (!(await confirm('Withdraw this invitation?', `${app.profile.display_name} will be told the testing invitation was withdrawn. They stay approved.`))) return;
    await api.removeAssignment(assignment.id);
    await invalidateRound(roundId);
  });

  const awaiting = AWAITING.includes(app.status);
  const can = {
    underReview: app.status === 'submitted',
    approve: awaiting || app.status === 'waitlisted' || app.status === 'declined',
    waitlist: awaiting || app.status === 'declined' || (app.status === 'approved' && !assignment),
    decline: awaiting || app.status === 'waitlisted' || (app.status === 'approved' && !assignment),
    requestInfo: app.status === 'submitted' || app.status === 'under_review',
  };
  const anyDecision = Object.values(can).some(Boolean);
  const busy = decide.loading;

  return (
    <>
      <H1>{app.profile.display_name}</H1>
      <Row wrap>
        <Badge label={status.label} tone={status.tone} />
        {(app.is_demo || app.profile.is_demo) && <Badge label="Demo" />}
      </Row>
      <Muted style={{ fontSize: theme.font.small }}>
        Applied to “{data.round.title}” · submitted {L.dateTime(app.submitted_at)}{app.decided_at ? ` · decided ${L.dateTime(app.decided_at)}` : ''}
      </Muted>

      <Section title="Tester profile">
        <Card>
          {app.profile.bio ? <P>{app.profile.bio}</P> : <Muted style={{ fontSize: theme.font.small }}>No bio written.</Muted>}
          <KeyValue k="Country" v={L.country(app.profile.country)} />
          <KeyValue k="Devices" v={list(app.profile.devices, L.DEVICES)} />
          <KeyValue k="Skills" v={list(app.profile.skills)} />
        </Card>
      </Section>

      <Section title="Experience">
        <Card>
          <KeyValue k="Completed tests on this platform" v={app.completed_tests} />
          <KeyValue k="Issues reported on this platform" v={app.issues_reported} />
          {app.completed_tests === 0 && <Muted style={{ fontSize: theme.font.small }}>No completed tests yet. That only means they are new here.</Muted>}
        </Card>
      </Section>

      <Section title="Application answers">
        {data.round.application_form.steps.every((s) => s.questions.length === 0)
          ? <Muted>This round's application form has no questions.</Muted>
          : data.round.application_form.steps.filter((s) => s.questions.length > 0).map((step) => (
            <Card key={step.id}>
              <H3>{step.title}</H3>
              {step.questions.map((q) => <KeyValue key={q.key} k={q.label} v={formatAnswer(q, app.answers?.[q.key])} />)}
            </Card>
          ))}
      </Section>

      <Section title="Availability & confirmations">
        <Card>
          <KeyValue k="Available days" v={app.available_days?.length ? L.DAYS.filter((d) => app.available_days.includes(d.value)).map((d) => d.label).join(', ') : 'Not answered'} />
          <KeyValue k="Has the required device" v={yesNo(app.confirm_device_access)} />
          <KeyValue k="Can spare the time" v={yesNo(app.confirm_time_commitment)} />
          <KeyValue k="Understands what testing involves" v={yesNo(app.confirm_instructions)} />
          <KeyValue k="Accepted the participation terms" v={yesNo(app.accept_terms)} />
        </Card>
      </Section>

      <Section title="Optional evidence consents">
        <Card>
          <KeyValue k="Screenshots" v={yesNo(app.consent_screenshots)} />
          <KeyValue k="Screen recordings" v={yesNo(app.consent_recordings)} />
          <KeyValue k="Voice notes" v={yesNo(app.consent_voice)} />
          <Muted style={{ fontSize: theme.font.small }}>
            These are optional. “No” is a valid choice and must not count against the tester. They confirm their choices again when they start testing.
          </Muted>
        </Card>
      </Section>

      <Section title="Decision">
        {app.creator_message && <Notice tone="neutral" title="Your last message to this tester">{app.creator_message}</Notice>}
        {app.status === 'withdrawn' && <Muted>The tester withdrew this application. There is nothing to decide.</Muted>}
        {app.status === 'info_requested' && <Muted>You asked for more information. The tester can update the application and send it again; you can still decide now.</Muted>}
        {app.status === 'approved' && assignment && <Muted>This tester is assigned. To change the decision, withdraw the invitation first.</Muted>}
        <ErrorNote error={decide.error} />
        {anyDecision && (
          <Row wrap>
            {can.approve && <Button title="Approve" loading={busy} onPress={() => decide.run('approved')} testID="approve-application" />}
            {can.underReview && <Button variant="secondary" title="Mark under review" disabled={busy} onPress={() => decide.run('under_review')} testID="mark-under-review" />}
            {can.waitlist && <Button variant="secondary" title={app.status === 'approved' ? 'Move to waitlist' : 'Waitlist'} disabled={busy} onPress={() => decide.run('waitlisted')} testID="waitlist-application" />}
            {can.decline && <Button variant="danger" title="Decline" disabled={busy} onPress={() => decide.run('declined')} testID="decline-application" />}
          </Row>
        )}
        {can.requestInfo && (
          <Card>
            <Field label="Request more information" hint="The tester sees this message and can update their application." value={message}
              onChangeText={setMessage} error={messageError} multiline testID="info-message" />
            <Button variant="secondary" title="Request more information" disabled={busy} onPress={() => decide.run('info_requested')} testID="request-info" />
          </Card>
        )}
      </Section>

      {app.status === 'approved' && (
        <Section title="Assignment">
          {!assignment ? (
            <Card>
              <P>Approved is not yet assigned — send the testing invitation when you are ready.</P>
              {lastInactive && (
                <Muted style={{ fontSize: theme.font.small }}>
                  {lastInactive.status === 'declined' ? 'The tester declined an earlier invitation' : 'An earlier invitation was withdrawn'} ({L.date(lastInactive.responded_at ?? lastInactive.assigned_at)}).
                </Muted>
              )}
              {data.round.status !== 'published' && <Muted style={{ fontSize: theme.font.small }}>The round must be published before testers can be assigned.</Muted>}
              <ErrorNote error={assign.error} />
              <Button title="Assign to this round" loading={assign.loading} onPress={() => assign.run()} testID="assign-tester" />
            </Card>
          ) : (
            <Card>
              <Row wrap><Badge label={ASSIGNMENT_STATUS[assignment.status].label} tone={ASSIGNMENT_STATUS[assignment.status].tone} /></Row>
              <KeyValue k="Invitation sent" v={L.dateTime(assignment.assigned_at)} />
              <KeyValue k="Tester responded" v={assignment.responded_at ? L.dateTime(assignment.responded_at) : 'Not yet'} />
              <KeyValue k="Testing session" v={session ? SESSION_STATUS[session.status].label : 'Not started'} />
              {session && <Button variant="secondary" title="Open testing session" onPress={() => go(`/creator/sessions/${session.id}`)} testID="open-session" />}
              <ErrorNote error={withdraw.error} />
              {(assignment.status === 'invited' || assignment.status === 'accepted') && (
                <Button variant="danger" title="Withdraw invitation" loading={withdraw.loading} onPress={() => withdraw.run()} testID="withdraw-invitation" />
              )}
            </Card>
          )}
        </Section>
      )}
    </>
  );
}
