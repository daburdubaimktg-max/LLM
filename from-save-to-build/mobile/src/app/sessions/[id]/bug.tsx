import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { EvidenceUploader } from '@/components/EvidenceUploader';
import { SignInScreen, replace, sortedTasks, taskTitle } from '@/components/tester';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { SEVERITY } from '@/lib/labels';
import { keys, queryClient } from '@/lib/query';
import { bugSchema, fieldErrors } from '@/lib/schemas';
import type { SessionDetail, Severity } from '@/lib/types';
import { Button, Card, Choice, ErrorNote, Field, H1, KeyValue, Muted, Notice, QueryView, Screen, Section, theme, useAction } from '@/ui';

const SEVERITY_HELP: Record<string, string> = {
  minor: 'cosmetic or annoying, but you could carry on',
  major: 'it blocked part of a task',
  critical: 'you could not continue, or something was lost',
};
const SEVERITY_OPTIONS = (['minor', 'major', 'critical'] as const).map((value) => ({ value, label: `${SEVERITY[value] ?? value} — ${SEVERITY_HELP[value]}` }));
const NO_TASK = 'none';

function BugForm({ d, initialCompletionId }: { d: SessionDetail; initialCompletionId: string | undefined }) {
  const sessionId = d.session.id;
  const tasks = sortedTasks(d.tasks);
  const [title, setTitle] = useState('');
  const [expected, setExpected] = useState('');
  const [actual, setActual] = useState('');
  const [steps, setSteps] = useState('');
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [device, setDevice] = useState('');
  const [os, setOs] = useState('');
  const [related, setRelated] = useState(initialCompletionId && tasks.some((t) => t.id === initialCompletionId) ? initialCompletionId : NO_TASK);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [bugId, setBugId] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.session(sessionId) });

  const submit = useAction(async () => {
    const parsed = bugSchema.safeParse({ title, expected, actual, steps, severity: severity ?? undefined, device: device.trim() || undefined, os: os.trim() || undefined });
    setErrors(fieldErrors(parsed));
    if (!parsed.success) return;
    const id = await api.reportBug({ sessionId, completionId: related === NO_TASK ? null : related, ...parsed.data });
    setBugId(id);
    await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: keys.notifications })]);
  });

  if (bugId) {
    const reported = d.bugs.find((b) => b.id === bugId);
    return (
      <Screen key="evidence" title="Report a problem" footer={<Button title="Done" testID="bug-done" onPress={() => replace(`/sessions/${sessionId}`)} />}>
        <H1>Thanks — the team has your report</H1>
        <Muted>“{reported?.title ?? title.trim()}” was sent to the product team. You can follow it from your test overview.</Muted>
        <Section title="Add evidence (optional)">
          <Muted>A picture or recording can make the problem easier to understand. Skip this if you would rather not.</Muted>
          <EvidenceUploader sessionId={sessionId} target={{ bugId }} consent={d.consent} existing={reported?.attachments ?? []} onUploaded={refresh} />
        </Section>
      </Screen>
    );
  }

  const clear = (key: string) => setErrors((e) => ({ ...e, [key]: '' }));
  const footer = (
    <>
      <ErrorNote error={submit.error} />
      {Object.values(errors).some(Boolean) && <Muted style={{ fontSize: theme.font.small, color: theme.color.bad }}>Something above still needs filling in.</Muted>}
      <Button title="Send report" testID="submit-bug" loading={submit.loading} onPress={() => submit.run()} />
    </>
  );
  return (
    <Screen title="Report a problem" footer={footer}>
      <H1>What went wrong?</H1>
      <Muted>Describe it in your own words. You did nothing wrong — finding problems is exactly what testing is for.</Muted>
      {d.session.status !== 'active' && <Notice tone="warn">This test is {d.session.status}. You may need to resume it before a report can be sent.</Notice>}
      <View style={{ gap: theme.space.lg }}>
        <Field label="Short title" value={title} onChangeText={(v) => { setTitle(v); clear('title'); }} placeholder="For example: Save button does nothing" error={errors.title || undefined} testID="bug-title" />
        <Field label="What did you expect to happen?" value={expected} onChangeText={(v) => { setExpected(v); clear('expected'); }} multiline error={errors.expected || undefined} testID="bug-expected" />
        <Field label="What actually happened?" value={actual} onChangeText={(v) => { setActual(v); clear('actual'); }} multiline error={errors.actual || undefined} testID="bug-actual" />
        <Field label="Steps to make it happen again" value={steps} onChangeText={(v) => { setSteps(v); clear('steps'); }} multiline hint="One step per line is easiest to follow."
          error={errors.steps || undefined} testID="bug-steps" />
        <Choice label="How serious is it?" options={SEVERITY_OPTIONS} value={severity} onChange={(v: Severity) => { setSeverity(v); clear('severity'); }}
          error={errors.severity || undefined} testID="bug-severity" />
        <Field label="Device (optional)" value={device} onChangeText={(v) => { setDevice(v); clear('device'); }} placeholder="For example: iPhone 13" error={errors.device || undefined} testID="bug-device" />
        <Field label="Operating system (optional)" value={os} onChangeText={(v) => { setOs(v); clear('os'); }} placeholder="For example: iOS 18" error={errors.os || undefined} testID="bug-os" />
        <Card>
          <Muted style={{ fontSize: theme.font.small }}>Filled in for you</Muted>
          <KeyValue k="Product" v={d.product.name} />
          <KeyValue k="Product version" v={d.release.version} />
        </Card>
        <Choice label="Which task was this in?" value={related} onChange={setRelated} testID="bug-task"
          options={[...tasks.map((t) => ({ value: t.id, label: `${t.position}. ${taskTitle(t)}` })), { value: NO_TASK, label: 'Not tied to a task' }]} />
      </View>
    </Screen>
  );
}

export default function BugReport() {
  const { id, completionId } = useLocalSearchParams<{ id: string; completionId?: string }>();
  const { userId, ready } = useAuth();
  const q = useQuery({ queryKey: keys.session(id), queryFn: () => api.sessionDetail(id), enabled: !!userId });
  if (ready && !userId) return <SignInScreen title="Report a problem" message="Sign in to report a problem." next={`/sessions/${id}/bug`} />;
  if (!q.data) return <Screen title="Report a problem"><QueryView query={q}>{() => null}</QueryView></Screen>;
  return <BugForm d={q.data} initialCompletionId={completionId} />;
}
