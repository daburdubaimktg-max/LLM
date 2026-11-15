import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { EvidenceUploader } from '@/components/EvidenceUploader';
import { Answer, Collapsible, SignInScreen, go, replace, sortedTasks, taskTitle } from '@/components/tester';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { TASK_STATUS, VERDICTS, WOULD_USE, dateTime, difficultyLabel, verdictLabel, wouldUseLabel } from '@/lib/labels';
import { keys, queryClient } from '@/lib/query';
import type { SessionDetail, Verdict } from '@/lib/types';
import { Button, Card, Choice, Divider, Empty, ErrorNote, Field, H1, KeyValue, Muted, Notice, P, QueryView, Rating, Row, Screen, Section, theme, useAction } from '@/ui';

function CorrectionForm({ verdict, sessionId, onDone }: { verdict: Verdict; sessionId: string; onDone: () => void }) {
  const [rating, setRating] = useState<number | null>(null);
  const [wouldUse, setWouldUse] = useState('');
  const [newVerdict, setNewVerdict] = useState('');
  const [improvement, setImprovement] = useState('');
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  // Tapping the selected option again clears it, because every field here is optional.
  const toggle = (current: string, setter: (v: string) => void) => (v: string) => setter(current === v ? '' : v);
  const save = useAction(async () => {
    if (!reason.trim()) { setReasonError('Please say why you are correcting your verdict'); return; }
    if (rating === null && !wouldUse && !newVerdict && !improvement.trim()) { setReasonError('Choose at least one thing to change above'); return; }
    setReasonError('');
    await api.amendVerdict(verdict.id, { reason: reason.trim(), rating, wouldUse: wouldUse || null, verdict: newVerdict || null, biggestImprovement: improvement.trim() || null });
    await Promise.all([keys.session(sessionId), keys.myTesting].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    onDone();
  });
  return (
    <View style={{ gap: theme.space.lg }}>
      <Muted>Change only what you need to. Your original verdict is kept — the correction is added next to it.</Muted>
      <View style={{ gap: theme.space.sm }}>
        <Text style={{ fontSize: theme.font.body, fontWeight: '600', color: theme.color.ink }}>New rating (optional)</Text>
        <Rating value={rating} onChange={(v) => setRating(rating === v ? null : v)} />
      </View>
      <Choice label="Would you use the product? (optional)" options={WOULD_USE} value={wouldUse || null} onChange={toggle(wouldUse, setWouldUse)} testID="amend-would-use" />
      <Choice label="New verdict (optional)" options={VERDICTS} value={newVerdict || null} onChange={toggle(newVerdict, setNewVerdict)} testID="amend-verdict" />
      <Field label="New improvement recommendation (optional)" value={improvement} onChangeText={setImprovement} multiline testID="amend-improvement" />
      <Field label="Why are you correcting it?" value={reason} onChangeText={(v) => { setReason(v); setReasonError(''); }} multiline error={reasonError || undefined} testID="amend-reason" />
      <ErrorNote error={save.error} />
      <Button title="Save correction" testID="submit-amendment" loading={save.loading} onPress={() => save.run()} />
    </View>
  );
}

function Done({ d }: { d: SessionDetail }) {
  const sessionId = d.session.id;
  const verdict = d.verdict;
  const tasks = sortedTasks(d.tasks);
  const [correcting, setCorrecting] = useState(false);
  const [saved, setSaved] = useState(false);
  if (!verdict) {
    return <Empty title="No verdict yet" body="You have not sent your final review for this test."
      action={<Button title="Back to your test" onPress={() => replace(`/sessions/${sessionId}`)} />} />;
  }
  const count = (status: string) => tasks.filter((t) => t.status === status).length;
  return (
    <>
      <H1>Thank you — your review is in</H1>
      <P>The {d.product.name} team now has your feedback. Honest opinions like yours are what make the product better.</P>

      <Section title="Your verdict">
        <Card>
          <KeyValue k="Verdict" v={verdictLabel(verdict.verdict)} />
          <KeyValue k="Rating" v={`${verdict.rating} out of 5`} />
          <KeyValue k="Would you use it?" v={wouldUseLabel(verdict.would_use)} />
          <KeyValue k="Sent" v={dateTime(verdict.submitted_at)} />
          <KeyValue k="Product version" v={d.release.version} />
          <Divider />
          <Answer label="Why" value={verdict.reason} />
          <Answer label="Biggest improvement" value={verdict.biggest_improvement} />
        </Card>
      </Section>

      <Section title="Tasks">
        <Muted>
          {count('completed')} completed{count('blocked') > 0 ? ` · ${count('blocked')} could not be completed` : ''}{count('skipped') > 0 ? ` · ${count('skipped')} skipped` : ''} · {tasks.length} in total
        </Muted>
        <Card>
          {tasks.map((t, i) => (
            <View key={t.id}>
              {i > 0 && <Divider />}
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }} gap={theme.space.lg}>
                <P style={{ flex: 1, color: theme.color.ink }}>{t.position}. {taskTitle(t)}</P>
                <Muted style={{ fontSize: theme.font.small }}>{t.status === 'completed' && t.difficulty ? difficultyLabel(t.difficulty) : TASK_STATUS[t.status] ?? t.status}</Muted>
              </Row>
            </View>
          ))}
        </Card>
      </Section>

      <Section title="Attach evidence to your review">
        <Muted>Optional. Add a file if it helps explain your verdict.</Muted>
        <EvidenceUploader sessionId={sessionId} target={{ verdictId: verdict.id }} consent={d.consent} existing={verdict.evidence ?? []}
          onUploaded={() => queryClient.invalidateQueries({ queryKey: keys.session(sessionId) })} />
      </Section>

      <Section title="Corrections">
        <Muted style={{ fontSize: theme.font.small }}>Your verdict can't be edited, but you can add a correction. The original always stays on record.</Muted>
        {verdict.amendments.length === 0 && <Muted>No corrections added.</Muted>}
        {verdict.amendments.map((a) => (
          <Card key={a.id}>
            <Muted style={{ fontSize: theme.font.small }}>Added {dateTime(a.created_at)}</Muted>
            {a.verdict && <KeyValue k="Verdict changed to" v={verdictLabel(a.verdict)} />}
            {a.rating !== null && <KeyValue k="Rating changed to" v={`${a.rating} out of 5`} />}
            {a.would_use && <KeyValue k="Would use changed to" v={wouldUseLabel(a.would_use)} />}
            {a.biggest_improvement && <Answer label="Improvement changed to" value={a.biggest_improvement} />}
            <Answer label="Reason" value={a.reason} />
          </Card>
        ))}
        {saved && !correcting && <Notice tone="good">Correction saved. Your original verdict is still on record.</Notice>}
        <Collapsible title="Add a correction" open={correcting} onToggle={() => { setCorrecting(!correcting); setSaved(false); }} testID="toggle-correction">
          <CorrectionForm verdict={verdict} sessionId={sessionId} onDone={() => { setCorrecting(false); setSaved(true); }} />
        </Collapsible>
      </Section>
    </>
  );
}

export default function SubmissionDone() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId, ready } = useAuth();
  const q = useQuery({ queryKey: keys.session(id), queryFn: () => api.sessionDetail(id), enabled: !!userId });
  if (ready && !userId) return <SignInScreen title="Review sent" message="Sign in to see your review." next={`/sessions/${id}/done`} />;
  return (
    <Screen title="Review sent" footer={<Button title="Back to my tests" testID="back-to-my-tests" onPress={() => go('/(tabs)/tests')} />}>
      <QueryView query={q}>{(d) => <Done d={d} />}</QueryView>
    </Screen>
  );
}
