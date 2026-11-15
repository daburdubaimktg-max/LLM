import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { FormBuilder, questionTypeLabel } from '@/components/creator/FormBuilder';
import { SignInPrompt, StringList } from '@/components/creator/parts';
import { readRoundForm, RoundFields, roundToForm, type RoundFormState } from '@/components/creator/RoundFields';
import { cleanList, go, invalidate, param, ROUND_STATUS } from '@/components/creator/util';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { COUNTRIES, date, DEVICES, REWARDS } from '@/lib/labels';
import { keys } from '@/lib/query';
import type { ApplicationForm, CreatorRoundData } from '@/lib/types';
import { Badge, Button, Card, confirm, Divider, ErrorNote, H1, H3, KeyValue, Muted, Notice, P, QueryView, Row, Screen, Section, theme, useAction } from '@/ui';

export default function RoundSettings() {
  const { userId } = useAuth();
  const id = param(useLocalSearchParams<{ id: string }>().id) ?? '';
  const round = useQuery({ queryKey: keys.creatorRound(id), queryFn: () => api.creatorRoundData(id), enabled: !!userId && !!id });
  if (!userId) return <Screen title="Round setup"><SignInPrompt body="Sign in to set up your testing round." /></Screen>;
  return <Screen title="Round setup"><QueryView query={round}>{(data) => <Hub key={data.round.id} data={data} />}</QueryView></Screen>;
}

const refresh = (d: CreatorRoundData) =>
  invalidate(keys.creatorRound(d.round.id), keys.round(d.round.id), keys.product(d.round.product_id), keys.creatorHome, keys.marketplace);

function Hub({ data }: { data: CreatorRoundData }) {
  const { round, release, product } = data;
  const isDraft = round.status === 'draft';
  return (
    <>
      <H1>{round.title}</H1>
      <Row wrap>
        <Badge label={ROUND_STATUS[round.status].label} tone={ROUND_STATUS[round.status].tone} />
        <Muted style={{ fontSize: theme.font.small }}>{product.name} · Round {round.round_number} · {release.version}</Muted>
      </Row>
      {isDraft && <Checklist data={data} />}
      <Details data={data} />
      <Objectives data={data} />
      <ApplicationFormSection data={data} />
      <Section title="Testing tasks">
        <Muted>{data.tasks.length === 0 ? 'No tasks yet. Tasks are what testers actually do.'
          : `${data.tasks.length} ${data.tasks.length === 1 ? 'task' : 'tasks'}, ${data.tasks.filter((t) => t.is_required).length} required.`}</Muted>
        <Button variant="secondary" title="Open task builder" onPress={() => go(`/creator/rounds/${round.id}/tasks`)} testID="open-task-builder" />
      </Section>
      <Publish data={data} />
      <Button variant="ghost" title="Open round dashboard" onPress={() => go(`/creator/rounds/${round.id}`)} testID="open-round-dashboard" />
    </>
  );
}

// ---------------------------------------------------------------- checklist
function Checklist({ data }: { data: CreatorRoundData }) {
  const deadline = data.round.application_deadline;
  const items = [
    { ok: data.objectives.length > 0, label: 'At least one testing objective' },
    { ok: data.tasks.length > 0, label: 'At least one testing task' },
    { ok: data.round.summary.trim().length > 0, label: 'A summary of what testers will be asked to do' },
    { ok: !deadline || new Date(deadline).getTime() > Date.now(), label: deadline ? `Application deadline (${date(deadline)}) is in the future` : 'No application deadline (optional)' },
  ];
  return (
    <Card>
      <H3>Before you publish</H3>
      {items.map((item) => (
        <Row key={item.label} style={{ alignItems: 'flex-start' }} gap={theme.space.md}>
          <Text accessibilityLabel={item.ok ? 'Done' : 'To do'} style={{ width: 18, fontSize: theme.font.body, lineHeight: 24, fontWeight: '700',
            color: item.ok ? theme.color.good : theme.color.bad }}>{item.ok ? '✓' : '✗'}</Text>
          <P style={{ flex: 1 }}>{item.label}</P>
        </Row>
      ))}
    </Card>
  );
}

// ---------------------------------------------------------------- (a) round details
function Details({ data }: { data: CreatorRoundData }) {
  const { round } = data;
  const locked = round.status !== 'draft';
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<RoundFormState>(() => roundToForm(round));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAction(async () => {
    const { errors: found, values } = readRoundForm(form);
    setErrors(found);
    if (!values) throw new Error('Please check the highlighted fields.');
    const { release_id, ...rest } = values;
    await api.updateRound(round.id, locked ? rest : { ...rest, release_id });
    await refresh(data);
    setEditing(false);
  });
  return (
    <Section title="Round details" action={!editing
      ? <Button small variant="secondary" title="Edit" onPress={() => { setForm(roundToForm(round)); setErrors({}); setEditing(true); }} testID="edit-round-details" /> : undefined}>
      {!editing
        ? <Card>
            <P>{round.summary || 'No summary yet.'}</P>
            <Divider />
            <KeyValue k="Release" v={data.release.version} />
            <KeyValue k="Target audience" v={round.target_audience || '—'} />
            <KeyValue k="Cohort size" v={round.cohort_size} />
            <KeyValue k="Expected time" v={`${round.expected_minutes_min}–${round.expected_minutes_max} min`} />
            <KeyValue k="Devices" v={round.supported_devices.map((d) => DEVICES[d] ?? d).join(', ') || '—'} />
            <KeyValue k="Countries" v={round.countries.map((c) => COUNTRIES[c] ?? c).join(', ') || 'No restriction'} />
            <KeyValue k="Application deadline" v={date(round.application_deadline)} />
            <KeyValue k="Testing deadline" v={date(round.testing_deadline)} />
            <KeyValue k="Reward" v={REWARDS[round.reward_type] ?? round.reward_type} />
            <KeyValue k="Beginner-friendly" v={round.beginner_friendly ? 'Yes' : 'No'} />
            <KeyValue k="Support contact" v={round.support_contact || '—'} />
          </Card>
        : <>
            <RoundFields value={form} onChange={setForm} errors={errors} releases={data.releases} releaseLocked={locked} />
            <ErrorNote error={save.error} />
            <Button title="Save round details" onPress={() => save.run()} loading={save.loading} testID="save-round-details" />
            <Button variant="ghost" title="Cancel" onPress={() => { save.clearError(); setEditing(false); }} />
          </>}
    </Section>
  );
}

// ---------------------------------------------------------------- (b) objectives
function Objectives({ data }: { data: CreatorRoundData }) {
  const [items, setItems] = useState<string[]>(() => data.objectives.map((o) => o.objective));
  const [saved, setSaved] = useState(false);
  const stored = data.objectives.map((o) => o.objective);
  const dirty = JSON.stringify(cleanList(items)) !== JSON.stringify(stored);
  const save = useAction(async () => {
    const clean = cleanList(items);
    await api.setObjectives(data.round.id, clean);
    await refresh(data);
    setItems(clean); setSaved(true);
  });
  return (
    <Section title="Testing objectives">
      <StringList hint="What you want to learn from this round. Testers see these on the listing." items={items} onChange={(next) => { setItems(next); setSaved(false); }}
        addLabel="Add objective" placeholder="For example: can a new user finish setup without help?" ordered testID="objective" />
      <ErrorNote error={save.error} />
      {saved && !dirty && <Notice tone="good">Objectives saved.</Notice>}
      <Button title="Save objectives" variant={dirty ? 'primary' : 'secondary'} disabled={!dirty} onPress={() => save.run()} loading={save.loading} testID="save-objectives" />
    </Section>
  );
}

// ---------------------------------------------------------------- (c) application form
function ApplicationFormSection({ data }: { data: CreatorRoundData }) {
  const { round } = data;
  const isDraft = round.status === 'draft';
  const [editing, setEditing] = useState(false);
  const steps = round.application_form?.steps ?? [];
  const questionCount = steps.reduce((n, s) => n + (s.questions?.length ?? 0), 0);
  const save = async (form: ApplicationForm) => {
    await api.updateRound(round.id, { application_form: form });
    await refresh(data);
  };
  return (
    <Section title="Application form" action={isDraft
      ? <Button small variant="secondary" title={editing ? 'Done' : 'Edit'} onPress={() => setEditing(!editing)} testID="edit-application-form" /> : undefined}>
      {!isDraft && <Notice tone="neutral">The application form is locked once a round has been published, so every applicant answers the same questions.</Notice>}
      {editing && isDraft
        ? <FormBuilder initial={round.application_form} onSave={save} />
        : steps.length === 0
          ? <Muted>No questions of your own yet. Applicants will only see the “Availability and consent” step the platform adds automatically.</Muted>
          : <Card>
              <Muted style={{ fontSize: theme.font.small }}>
                {steps.length} {steps.length === 1 ? 'step' : 'steps'} · {questionCount} {questionCount === 1 ? 'question' : 'questions'} · plus “Availability and consent”, added automatically
              </Muted>
              {steps.map((s) => (
                <View key={s.id} style={{ gap: 4 }}>
                  <Divider />
                  <H3>{s.title}</H3>
                  {(s.questions ?? []).map((q) => (
                    <Muted key={q.key} style={{ fontSize: theme.font.small }}>
                      {q.label} — {questionTypeLabel(q.type)}{q.required ? ', required' : ''}{q.segment ? ', report segment' : ''}
                    </Muted>
                  ))}
                </View>
              ))}
            </Card>}
    </Section>
  );
}

// ---------------------------------------------------------------- (e) publish / close
function Publish({ data }: { data: CreatorRoundData }) {
  const { round } = data;
  const publish = useAction(async () => {
    await api.publishRound(round.id);
    await refresh(data);
  });
  const close = useAction(async (status: 'closed' | 'completed') => {
    const ok = status === 'closed'
      ? await confirm('Close applications?', 'New testers will no longer be able to apply. Testers already assigned can keep testing.')
      : await confirm('Mark this round completed?', 'Use this when testing has finished. The round and its results stay available to you.');
    if (!ok) return;
    await api.closeRound(round.id, status);
    await refresh(data);
  });
  return (
    <Section title={round.status === 'draft' ? 'Publish' : 'Round status'}>
      {round.status === 'draft' && <>
        <Muted>Publishing lists the round so testers can apply. After that, the release and the application form can no longer be changed.</Muted>
        <ErrorNote error={publish.error} />
        <Button title="Publish round" onPress={() => publish.run()} loading={publish.loading} testID="publish-round" />
      </>}
      {round.status === 'published' && <>
        <Muted>Published {date(round.published_at)}. Testers can apply.</Muted>
        <ErrorNote error={close.error} />
        <Button variant="secondary" title="Close applications" onPress={() => close.run('closed')} loading={close.loading} testID="close-applications" />
        <Button variant="secondary" title="Mark completed" onPress={() => close.run('completed')} disabled={close.loading} testID="mark-completed" />
      </>}
      {round.status === 'closed' && <>
        <Muted>Applications are closed.</Muted>
        <ErrorNote error={close.error} />
        <Button variant="secondary" title="Mark completed" onPress={() => close.run('completed')} loading={close.loading} testID="mark-completed" />
      </>}
      {(round.status === 'completed' || round.status === 'archived') && <Muted>This round is {ROUND_STATUS[round.status].label.toLowerCase()}. Its results are kept as they are.</Muted>}
    </Section>
  );
}
