import { useQuery } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { SignInScreen, replace, requiredRemaining } from '@/components/tester';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { VERDICTS, WOULD_USE } from '@/lib/labels';
import { keys, queryClient } from '@/lib/query';
import { fieldErrors, verdictSchema } from '@/lib/schemas';
import type { SessionDetail } from '@/lib/types';
import { Button, Choice, ErrorNote, Field, H1, Muted, Notice, QueryView, Rating, Screen, confirm, theme, useAction } from '@/ui';

function ReviewForm({ d }: { d: SessionDetail }) {
  const sessionId = d.session.id;
  const [rating, setRating] = useState<number | null>(null);
  const [wouldUse, setWouldUse] = useState<string | null>(null);
  const [improvement, setImprovement] = useState('');
  const [verdict, setVerdict] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const clear = (key: string) => setErrors((e) => ({ ...e, [key]: '' }));

  const submit = useAction(async () => {
    const parsed = verdictSchema.safeParse({ rating: rating ?? undefined, wouldUse: wouldUse ?? undefined, biggestImprovement: improvement, verdict: verdict ?? undefined, reason });
    setErrors(fieldErrors(parsed));
    if (!parsed.success) return;
    if (!(await confirm('Send your verdict?', "Once sent, it can't be edited. You can add a correction afterwards."))) return;
    await api.submitVerdict(sessionId, parsed.data);
    replace(`/sessions/${sessionId}/done`);
    for (const queryKey of [keys.session(sessionId), keys.myTesting, keys.assignment(d.session.assignment_id), keys.round(d.session.round_id), keys.notifications]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  });
  const footer = (
    <>
      <ErrorNote error={submit.error} />
      {Object.values(errors).some(Boolean) && <Muted style={{ fontSize: theme.font.small, color: theme.color.bad }}>Something above still needs an answer.</Muted>}
      <Button title="Send my verdict" testID="submit-verdict" loading={submit.loading} onPress={() => submit.run()} />
    </>
  );
  return (
    <Screen title="Final review" footer={footer}>
      <H1>Your overall view of {d.product.name}</H1>
      <Muted>Say what you really think — a critical review is just as welcome as a glowing one.</Muted>
      <Notice tone="info">This is your personal opinion — it does not approve or reject the product.</Notice>
      <View style={{ gap: theme.space.xl }}>
        <View style={{ gap: theme.space.sm }}>
          <Text style={{ fontSize: theme.font.body, fontWeight: '600', color: theme.color.ink }}>Overall, how would you rate it?</Text>
          <Rating value={rating} onChange={(v) => { setRating(v); clear('rating'); }} error={errors.rating || undefined} />
        </View>
        <Choice label="Would you use the product?" options={WOULD_USE} value={wouldUse} onChange={(v: string) => { setWouldUse(v); clear('wouldUse'); }}
          error={errors.wouldUse || undefined} testID="verdict-would-use" />
        <Field label="What is the one thing you would improve first?" value={improvement} onChangeText={(v) => { setImprovement(v); clear('biggestImprovement'); }} multiline
          error={errors.biggestImprovement || undefined} testID="verdict-improvement" />
        <Choice label="Your final verdict" options={VERDICTS} value={verdict} onChange={(v: string) => { setVerdict(v); clear('verdict'); }}
          error={errors.verdict || undefined} testID="verdict-choice" />
        <Field label="Why did you choose that verdict?" value={reason} onChangeText={(v) => { setReason(v); clear('reason'); }} multiline
          error={errors.reason || undefined} testID="verdict-reason" />
      </View>
      <Muted style={{ fontSize: theme.font.small }}>Once sent, your verdict can't be edited; you can add a correction afterwards.</Muted>
    </Screen>
  );
}

export default function FinalReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId, ready } = useAuth();
  const formOpen = useRef(false);
  const q = useQuery({ queryKey: keys.session(id), queryFn: () => api.sessionDetail(id), enabled: !!userId });
  if (ready && !userId) return <SignInScreen title="Final review" message="Sign in to finish your test." next={`/sessions/${id}/review`} />;
  if (!q.data) return <Screen title="Final review"><QueryView query={q}>{() => null}</QueryView></Screen>;
  const d = q.data;
  if (!formOpen.current) {
    if (d.verdict || d.session.status === 'completed') return <Redirect href={`/sessions/${id}/done` as never} />;
    const remaining = requiredRemaining(d.tasks);
    if (d.session.status !== 'active' || remaining.length > 0) {
      return (
        <Screen title="Final review">
          <H1>Not quite yet</H1>
          <Notice tone="warn">
            {d.session.status === 'paused' ? 'Your test is paused. Resume it from the overview to continue.'
              : d.session.status === 'abandoned' ? 'You left this test, so a final review can no longer be sent.'
              : `${remaining.length === 1 ? '1 required task still needs' : `${remaining.length} required tasks still need`} to be finished before the final review.`}
          </Notice>
          <Button title="Back to all tasks" testID="back-to-tasks" onPress={() => replace(`/sessions/${id}`)} />
        </Screen>
      );
    }
  }
  formOpen.current = true;
  return <ReviewForm d={d} />;
}
