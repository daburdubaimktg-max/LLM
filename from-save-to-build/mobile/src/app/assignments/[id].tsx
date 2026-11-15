import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { SignInScreen, go, minutesRange, replace, shortId } from '@/components/tester';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { DEVICES, TASK_TYPES, date } from '@/lib/labels';
import { keys, queryClient } from '@/lib/query';
import type { AssignmentDetail } from '@/lib/types';
import { Badge, Bullets, Button, Card, Check, Divider, ErrorNote, H1, H2, KeyValue, Muted, Notice, P, QueryView, Row, Screen, Section, confirm, theme, useAction } from '@/ui';

const invalidate = (d: AssignmentDetail) => Promise.all(
  [keys.assignment(d.assignment.id), keys.myTesting, keys.round(d.round.id), keys.notifications, keys.marketplace].map((queryKey) => queryClient.invalidateQueries({ queryKey })));

function Actions({ d }: { d: AssignmentDetail }) {
  const { assignment } = d;
  const [ack, setAck] = useState(false);
  const [ackError, setAckError] = useState('');
  // Pre-filled from what the tester chose when applying; still optional and editable.
  const [consent, setConsent] = useState({ screenshots: !!d.application_consents?.screenshots, recordings: !!d.application_consents?.recordings, voice: !!d.application_consents?.voice });
  const respond = useAction(async (accept: boolean) => {
    if (!accept && !(await confirm('Decline this invitation?', 'Your place will be offered to someone else.'))) return;
    await api.respondToAssignment(assignment.id, accept);
    await invalidate(d);
  });
  const start = useAction(async () => {
    if (!ack) { setAckError('Please confirm you have read the instructions'); return; }
    const sessionId = await api.startSession(assignment.id, { acknowledged: true, ...consent });
    replace(`/sessions/${sessionId}`);
    void invalidate(d);
  });

  if (d.session_id) {
    const sessionId = d.session_id;
    return (
      <Section title={assignment.status === 'completed' ? 'You finished this test' : 'Your test is under way'}>
        <Button title={assignment.status === 'completed' ? 'View your test' : 'Continue testing'} testID="continue-testing" onPress={() => go(`/sessions/${sessionId}`)} />
      </Section>
    );
  }
  if (assignment.status === 'invited') {
    return (
      <Section title="Would you like to take part?">
        <Muted>Accepting holds your place. You can start right away or come back later.</Muted>
        <ErrorNote error={respond.error} />
        <Button title="Accept invitation" testID="accept-invitation" loading={respond.loading} onPress={() => respond.run(true)} />
        <Button variant="ghost" title="Decline" testID="decline-invitation" disabled={respond.loading} onPress={() => respond.run(false)} />
      </Section>
    );
  }
  if (assignment.status === 'accepted') {
    return (
      <Section title="Before you start">
        <Check label="I have read the testing instructions and privacy notes" checked={ack} onChange={(v) => { setAck(v); setAckError(''); }}
          error={ackError || undefined} testID="ack-instructions" />
        <View style={{ gap: theme.space.md, backgroundColor: theme.color.soft, borderRadius: theme.radius.lg, padding: theme.space.lg }}>
          <H2>Optional — you can say no to all of these</H2>
          <Muted style={{ fontSize: theme.font.small }}>
            If you agree, you will be able to attach these to your feedback. You never have to. We will only offer the kinds you tick here.
          </Muted>
          <Check label="I'm happy to share screenshots" checked={consent.screenshots} onChange={(screenshots) => setConsent({ ...consent, screenshots })} testID="consent-screenshots" />
          <Check label="I'm happy to share screen recordings" checked={consent.recordings} onChange={(recordings) => setConsent({ ...consent, recordings })} testID="consent-recordings" />
          <Check label="I'm happy to share voice notes" checked={consent.voice} onChange={(voice) => setConsent({ ...consent, voice })} testID="consent-voice" />
        </View>
        <ErrorNote error={start.error} />
        <Button title="Start testing" testID="start-testing" loading={start.loading} onPress={() => start.run()} />
      </Section>
    );
  }
  if (assignment.status === 'declined') return <Notice tone="neutral" title="You declined this invitation">Nothing more to do. You are welcome to apply to other tests any time.</Notice>;
  if (assignment.status === 'removed') {
    return <Notice tone="neutral" title="This invitation was withdrawn">The team removed this invitation, so there is nothing to do here. It is not a judgement on you — plans change.</Notice>;
  }
  return null;
}

function Detail({ d, name }: { d: AssignmentDetail; name: string | undefined }) {
  const { round, product, release } = d;
  const access = release.access_instructions || round.access_instructions;
  const accessUrl = release.access_url;
  return (
    <>
      <H1>{name ? `Welcome, ${name}` : 'Welcome'}</H1>
      <P>You have been invited to test {product.name}. Here is everything you need. Take your time — we are testing the product, not you.</P>

      <Section title={product.name}>
        <P>{product.description}</P>
        <Card>
          <KeyValue k="Product version" v={release.version} />
          <KeyValue k="Testing round" v={round.title} />
          <KeyValue k="Round ID" v={shortId(round.id)} />
          <KeyValue k="Finish by" v={round.testing_deadline ? date(round.testing_deadline) : 'No deadline'} />
          <KeyValue k="Time needed" v={`About ${minutesRange(round.expected_minutes_min, round.expected_minutes_max)}`} />
          <KeyValue k="Devices" v={round.supported_devices.length ? round.supported_devices.map((x) => DEVICES[x] ?? x).join(', ') : 'Any device'} />
        </Card>
        <Text selectable style={{ fontSize: theme.font.tiny, color: theme.color.muted }}>Full round ID: {round.id}</Text>
      </Section>

      {d.objectives.length > 0 && <Section title="What the team wants to learn"><Bullets items={d.objectives} /></Section>}

      {!!round.instructions && <Section title="How to approach it"><P>{round.instructions}</P></Section>}

      <Section title="Getting into the product">
        <P>{access || 'The team has not added access instructions. Use the support contact below if you get stuck.'}</P>
        {!!accessUrl && <Button variant="secondary" title="Open the product" testID="open-product" onPress={() => { void Linking.openURL(accessUrl); }} />}
      </Section>

      {d.outline.length > 0 && (
        <Section title="Your tasks">
          <Card>
            {[...d.outline].sort((a, b) => a.position - b.position).map((t, i) => (
              <View key={`${t.position}-${i}`}>
                {i > 0 && <Divider />}
                <Row style={{ alignItems: 'flex-start' }} gap={theme.space.md}>
                  <Text style={{ width: 22, fontSize: theme.font.body, fontWeight: '700', color: theme.color.accent, lineHeight: 24 }}>{t.position}</Text>
                  <View style={{ flex: 1, gap: 2 }}>
                    <P style={{ color: theme.color.ink }}>{t.title}</P>
                    <Muted style={{ fontSize: theme.font.small }}>{TASK_TYPES[t.task_type] ?? t.task_type}{t.estimated_minutes ? ` · about ${t.estimated_minutes} min` : ''}</Muted>
                  </View>
                  {!t.is_required && <Badge label="Optional" />}
                </Row>
              </View>
            ))}
          </Card>
        </Section>
      )}

      <Section title="Privacy">
        <P>{round.privacy_requirements || 'The team has not listed any special privacy requirements.'}</P>
      </Section>

      <Section title="If you need help">
        {round.support_contact
          ? <Text selectable style={{ fontSize: theme.font.body, color: theme.color.ink, lineHeight: 24 }}>{round.support_contact}</Text>
          : <Muted>The team has not listed a support contact.</Muted>}
      </Section>

      <Actions d={d} />
    </>
  );
}

export default function AssignmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId, ready } = useAuth();
  const q = useQuery({ queryKey: keys.assignment(id), queryFn: () => api.assignmentDetail(id), enabled: !!userId });
  const profile = useQuery({ queryKey: keys.profile, queryFn: () => api.profile(), enabled: !!userId });
  if (ready && !userId) return <SignInScreen title="Testing invitation" message="Sign in to open your testing invitation." next={`/assignments/${id}`} />;
  return (
    <Screen title="Testing invitation">
      <QueryView query={q}>{(d) => <Detail d={d} name={profile.data?.display_name} />}</QueryView>
    </Screen>
  );
}
