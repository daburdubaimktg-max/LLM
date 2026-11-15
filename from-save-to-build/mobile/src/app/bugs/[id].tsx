// Bug detail for both roles. The tester's report is immutable; triage, notes and replies are separate records.
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { EvidenceList, SignInPrompt, bugEventLabel, go, param, severityTone, triageTone } from '@/components/creator-review';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import * as L from '@/lib/labels';
import { keys, queryClient } from '@/lib/query';
import type { BugDetail } from '@/lib/types';
import { Badge, Button, Card, Choice, Divider, Eyebrow, ErrorNote, Field, H1, H3, KeyValue, Muted, Notice, P, QueryView, Row, Screen, Section, Stack2, theme, useAction } from '@/ui';

type TriageAction = Parameters<typeof api.triageBug>[1];

export default function BugScreen() {
  const { userId } = useAuth();
  const id = param(useLocalSearchParams<{ id: string }>().id);
  if (!userId) return <SignInPrompt title="Issue report" />;
  return <Bug bugId={id} />;
}

function Bug({ bugId }: { bugId: string }) {
  const query = useQuery({ queryKey: keys.bug(bugId), queryFn: () => api.bugDetail(bugId), enabled: !!bugId });
  return <Screen title="Issue report"><QueryView query={query}>{(d) => <Detail d={d} />}</QueryView></Screen>;
}

async function refresh(d: BugDetail) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.bug(d.bug.id) }),
    queryClient.invalidateQueries({ queryKey: keys.creatorRound(d.bug.round_id) }),
    queryClient.invalidateQueries({ queryKey: keys.session(d.bug.session_id) }),
  ]);
}

function Detail({ d }: { d: BugDetail }) {
  const { bug, triage } = d;
  const creator = d.viewer_role === 'creator';
  const status = triage?.status ?? 'new';
  const duplicateTitle = triage?.duplicate_of ? d.other_bugs.find((o) => o.id === triage.duplicate_of)?.title : undefined;

  return (
    <>
      <Row wrap>
        <Badge label={L.TRIAGE[status] ?? status} tone={triageTone(status)} />
        {!!triage?.category && <Badge label={triage.category} />}
      </Row>
      <H1>{bug.title}</H1>
      {status === 'duplicate' && triage?.duplicate_of && creator && (
        <Button small variant="secondary" title={`Duplicate of: ${duplicateTitle ?? 'another issue'}`} onPress={() => go(`/bugs/${triage.duplicate_of}`)} testID="open-original-bug" />
      )}

      <View style={{ borderWidth: 1, borderColor: theme.color.ink, borderRadius: theme.radius.lg, padding: theme.space.lg, gap: theme.space.sm, backgroundColor: theme.color.surface }}>
        <Eyebrow>Original report (cannot be edited)</Eyebrow>
        <H3>{bug.title}</H3>
        <Row wrap><Badge label={`${L.SEVERITY[bug.severity] ?? bug.severity} severity`} tone={severityTone(bug.severity)} /></Row>
        <Block label="What the tester expected" text={bug.expected_result} />
        <Block label="What actually happened" text={bug.actual_result} />
        <Block label="Steps to reproduce" text={bug.steps_to_reproduce} />
        <Divider />
        <KeyValue k="Device" v={bug.device || '—'} />
        <KeyValue k="Operating system" v={bug.operating_system || '—'} />
        <KeyValue k="Product version" v={bug.product_version} />
        <KeyValue k="Related task" v={d.task_title ?? 'Not linked to a task'} />
        <KeyValue k="Reported" v={L.dateTime(bug.created_at)} />
        {creator && <KeyValue k="Reported by" v={d.reporter ?? 'Former tester'} />}
        <Muted style={{ fontSize: theme.font.tiny }}>
          {creator ? 'This is exactly what the tester submitted. Status changes, categories and notes are recorded separately and never alter it.'
            : 'This is exactly what you submitted. It stays as written; the product team records their status and questions separately.'}
        </Muted>
      </View>

      <Section title="Attachments">
        <EvidenceList files={d.attachments} emptyText="No files were attached to this report." />
      </Section>

      {creator && (
        <Button variant="secondary" title="Open the tester's session" onPress={() => go(`/creator/sessions/${bug.session_id}`)} testID="open-session" />
      )}

      <Section title={creator ? 'Timeline' : 'Updates from the product team'}>
        {d.events.length === 0 ? <Muted>{creator ? 'Nothing recorded yet.' : 'No updates yet. You will be notified if the team has a question.'}</Muted> : (
          <Card>
            {d.events.map((e, i) => (
              <View key={e.id} style={{ gap: 4 }}>
                {i > 0 && <Divider />}
                <Row style={{ justifyContent: 'space-between' }} gap={theme.space.md}>
                  <Text style={{ flex: 1, fontSize: theme.font.small, fontWeight: '600', color: theme.color.ink }}>
                    {e.actor_role === 'creator' ? 'Product team' : 'Tester'} · {bugEventLabel(e.event_type)}
                  </Text>
                  <Muted style={{ fontSize: theme.font.tiny }}>{L.dateTime(e.created_at)}</Muted>
                </Row>
                {e.from_status && e.to_status && e.from_status !== e.to_status && (
                  <Muted style={{ fontSize: theme.font.small }}>Status: {L.TRIAGE[e.from_status] ?? e.from_status} → {L.TRIAGE[e.to_status] ?? e.to_status}</Muted>
                )}
                {!!e.note && <P style={{ fontSize: theme.font.small }}>{e.note}</P>}
              </View>
            ))}
          </Card>
        )}
      </Section>

      {creator ? <CreatorActions d={d} /> : <TesterReply d={d} />}
    </>
  );
}

const Block = ({ label, text }: { label: string; text: string }) => (
  <View style={{ gap: 2 }}>
    <Muted style={{ fontSize: theme.font.small }}>{label}</Muted>
    <P>{text}</P>
  </View>
);

function CreatorActions({ d }: { d: BugDetail }) {
  const status = d.triage?.status ?? 'new';
  const [note, setNote] = useState('');
  const [category, setCategory] = useState(d.triage?.category ?? '');
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [pending, setPending] = useState<TriageAction | null>(null);

  const act = useAction(async (action: TriageAction) => {
    const text = note.trim();
    if (action === 'request_info' && !text) throw new Error('Write the question for the tester in the note field first.');
    if (action === 'note' && !text) throw new Error('Write the internal note first.');
    if (action === 'categorise' && !category.trim()) throw new Error('Enter a category first.');
    if (action === 'mark_duplicate' && !duplicateOf) throw new Error('Choose the original issue this one duplicates.');
    setPending(action);
    try {
      const usesNote = action === 'request_info' || action === 'note' || action === 'mark_fixed';
      await api.triageBug(d.bug.id, action, {
        note: usesNote && text ? text : undefined,
        category: action === 'categorise' ? category.trim() : undefined,
        duplicateOf: action === 'mark_duplicate' ? duplicateOf ?? undefined : undefined,
      });
      if (usesNote) setNote('');
      if (action === 'mark_duplicate') setShowDuplicates(false);
      await refresh(d);
    } finally { setPending(null); }
  });
  const btn = (action: TriageAction, title: string, testID: string, variant: 'primary' | 'secondary' | 'danger' = 'secondary') =>
    <Button small variant={variant} title={title} loading={pending === action} disabled={act.loading && pending !== action} onPress={() => act.run(action)} testID={testID} />;
  const closedLike = status === 'closed' || status === 'fixed' || status === 'duplicate';

  return (
    <Section title="Triage">
      <Muted style={{ fontSize: theme.font.small }}>
        Each action below is saved as its own record in the timeline. Notes and status never alter the original report.
      </Muted>
      <ErrorNote error={act.error} />

      <Card>
        <H3>Status</H3>
        <Row wrap>
          {status === 'new' && btn('review', 'Mark reviewed', 'bug-mark-reviewed', 'primary')}
          {btn('assign', d.triage?.assignee_id ? 'Reassign to me' : 'Assign to me', 'bug-assign-to-me')}
          {!closedLike && btn('close', 'Close', 'bug-close')}
          {closedLike && btn('reopen', 'Reopen', 'bug-reopen')}
        </Row>
        <Muted style={{ fontSize: theme.font.tiny }}>
          {d.triage?.assignee_id ? 'This issue has an assignee. ' : 'Nobody is assigned yet. '}Assigning moves the issue to “In progress”.
        </Muted>
      </Card>

      <Card>
        <Field label="Category" hint="For example: Login, Payments, Layout." value={category} onChangeText={setCategory} testID="bug-category" />
        {btn('categorise', 'Save category', 'bug-categorise')}
      </Card>

      <Card>
        <Field label="Note" multiline value={note} onChangeText={setNote} testID="bug-note"
          hint="Used by the three buttons below. A request for information is sent to the tester; an internal note is only visible to your team; a fix note is optional." />
        <Row wrap>
          {btn('request_info', 'Request more information', 'bug-request-info')}
          {btn('note', 'Add internal note', 'bug-add-note')}
          {status !== 'fixed' && btn('mark_fixed', 'Mark as fixed', 'bug-mark-fixed')}
        </Row>
      </Card>

      <Card>
        <H3>Duplicate</H3>
        {d.other_bugs.length === 0 ? <Muted style={{ fontSize: theme.font.small }}>There are no other issues on this product to point to.</Muted>
          : !showDuplicates ? <Button small variant="secondary" title="Mark as duplicate…" onPress={() => setShowDuplicates(true)} testID="bug-show-duplicates" />
          : (
            <Stack2>
              <Choice label="Which issue is the original?" options={d.other_bugs.map((o) => ({ value: o.id, label: o.title }))} value={duplicateOf} onChange={setDuplicateOf} testID="bug-duplicate-of" />
              <Row wrap>
                {btn('mark_duplicate', 'Mark as duplicate', 'bug-mark-duplicate')}
                <Button small variant="ghost" title="Cancel" onPress={() => setShowDuplicates(false)} />
              </Row>
            </Stack2>
          )}
      </Card>
    </Section>
  );
}

function TesterReply({ d }: { d: BugDetail }) {
  const [reply, setReply] = useState('');
  const send = useAction(async () => {
    if (!reply.trim()) throw new Error('Write a reply first.');
    await api.replyToBug(d.bug.id, reply.trim());
    setReply('');
    await refresh(d);
  });
  if (d.triage?.status !== 'needs_info') return null;
  return (
    <Section title="The team needs more information">
      <Notice tone="warn">Their question is in the updates above. Your reply is added as a new message; your original report stays as written.</Notice>
      <Field label="Your reply" multiline value={reply} onChangeText={setReply} testID="bug-reply" />
      <ErrorNote error={send.error} />
      <Button title="Send reply" loading={send.loading} onPress={() => send.run()} testID="send-bug-reply" />
    </Section>
  );
}
