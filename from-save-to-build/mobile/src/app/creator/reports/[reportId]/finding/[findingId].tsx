// Finding review: check the source feedback, approve or reject, then turn an approved finding into a project task.
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { CONFIDENCE, NavRow, Quote, REVIEW_STATUS, SOURCE_TYPES, SignInPrompt, go, humanise, kindTag, param, testerRef } from '@/components/creator-review';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import * as L from '@/lib/labels';
import { keys, queryClient } from '@/lib/query';
import { fieldErrors, projectTaskSchema } from '@/lib/schemas';
import type { Finding, ProjectTask, ReportDetail } from '@/lib/types';
import { Badge, Button, Card, Check, Choice, Divider, Empty, ErrorNote, Eyebrow, Field, H1, H3, KeyValue, Muted, Notice, P, QueryView, Row, Screen, Section, theme, useAction } from '@/ui';

const PRIORITIES = [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' }];
const TASK_STATUS: Record<string, string> = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved', wont_fix: "Won't fix" };

export default function FindingScreen() {
  const { userId } = useAuth();
  const p = useLocalSearchParams<{ reportId: string; findingId: string }>();
  const reportId = param(p.reportId); const findingId = param(p.findingId);
  if (!userId) return <SignInPrompt title="Finding" />;
  return <FindingLoader reportId={reportId} findingId={findingId} />;
}

function FindingLoader({ reportId, findingId }: { reportId: string; findingId: string }) {
  const query = useQuery({ queryKey: keys.report(reportId), queryFn: () => api.reportDetail(reportId), enabled: !!reportId });
  return (
    <Screen title="Finding">
      <QueryView query={query}>{(r) => {
        const f = r.findings.find((x) => x.id === findingId);
        if (!f) return <Empty title="Finding not found" body="It is not part of this report." />;
        return <Review key={f.id} f={f} r={r} />;
      }}</QueryView>
    </Screen>
  );
}

function Review({ f, r }: { f: Finding; r: ReportDetail }) {
  const tag = kindTag(f.kind, r.generator);
  const confidence = CONFIDENCE[f.confidence] ?? { label: f.confidence, tone: 'neutral' as const };
  const review = REVIEW_STATUS[f.review_status] ?? { label: f.review_status, tone: 'neutral' as const };
  const [title, setTitle] = useState(f.edited_title ?? f.title);
  const [body, setBody] = useState(f.edited_body ?? f.body);

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.report(r.id) }),
    queryClient.invalidateQueries({ queryKey: keys.product(r.product_id) }),
    queryClient.invalidateQueries({ queryKey: keys.creatorHome }),
  ]);
  const [pending, setPending] = useState<string | null>(null);
  const save = useAction(async (status: Finding['review_status'], which: string) => {
    if (!title.trim()) throw new Error('The finding needs a title.');
    setPending(which);
    try {
      // Only wording that differs from the generated text is stored as an edit; the original always stays.
      await api.reviewFinding(f.id, status, { title: title.trim() === f.title.trim() ? null : title.trim(), body: body.trim() === f.body.trim() || !body.trim() ? null : body.trim() });
      await refresh();
    } finally { setPending(null); }
  });
  const dirty = title.trim() !== (f.edited_title ?? f.title).trim() || body.trim() !== (f.edited_body ?? f.body).trim();

  return (
    <>
      <Row wrap><Badge label={tag.label} tone={tag.tone} /><Badge label={review.label} tone={review.tone} /></Row>
      <H1>{f.edited_title ?? f.title}</H1>
      {f.edited_title && <Muted style={{ fontSize: theme.font.small }}>Title edited by you.</Muted>}

      <View style={{ borderWidth: 1, borderColor: theme.color.line, borderRadius: theme.radius.lg, padding: theme.space.lg, gap: theme.space.sm, backgroundColor: theme.color.surface }}>
        <Eyebrow>Generated finding (original, unchanged)</Eyebrow>
        <H3>{f.title}</H3>
        {f.kind === 'tester_statement' ? <Quote>{f.body}</Quote> : <P>{f.body}</P>}
        <Divider />
        <KeyValue k="Type" v={tag.label} />
        <KeyValue k="Report section" v={L.SECTIONS[f.section] ?? humanise(f.section)} />
        <KeyValue k="Support" v={`Supported by ${f.supporting_tester_count} of ${f.total_testers} testers`} />
        <KeyValue k="Related task" v={f.task_title ?? 'Not tied to one task'} />
        <KeyValue k="Product release" v={r.version} />
        <KeyValue k="Confidence" v={<Badge label={confidence.label} tone={confidence.tone} />} />
        <KeyValue k="Limitations" v={f.limitations ?? 'None recorded'} />
      </View>

      <Section title="Source feedback">
        <Muted style={{ fontSize: theme.font.small }}>
          {f.evidence.length === 0 ? 'No evidence rows are attached to this finding.' : 'The tester evidence this finding rests on, word for word. Testers are shown by reference, not by name.'}
        </Muted>
        {f.evidence.length > 0 && (
          <Card>
            {f.evidence.map((e, i) => (
              <View key={e.id} style={{ gap: 6 }}>
                {i > 0 && <Divider />}
                <Row wrap><Badge label={SOURCE_TYPES[e.source_type] ?? humanise(e.source_type)} /><Muted style={{ fontSize: theme.font.small }}>{testerRef(e.session_id)}</Muted></Row>
                {e.excerpt?.trim() ? <Quote>{e.excerpt}</Quote> : <Muted style={{ fontSize: theme.font.small }}>No text excerpt for this source.</Muted>}
                <Button small variant="ghost" title={e.source_type === 'bug_report' ? 'Open bug report' : "Open tester's session"} testID={`open-source-${e.id}`}
                  onPress={() => go(e.source_type === 'bug_report' ? `/bugs/${e.source_id}` : `/creator/sessions/${e.session_id}`)} />
              </View>
            ))}
          </Card>
        )}
      </Section>

      <Section title="Your review">
        <Muted style={{ fontSize: theme.font.small }}>You can reword the finding. Your wording is stored alongside the generated original, which stays visible above.</Muted>
        <Field label="Title" value={title} onChangeText={setTitle} testID="finding-title" />
        <Field label="Body" value={body} onChangeText={setBody} multiline testID="finding-body" />
        <ErrorNote error={save.error} />
        <Row wrap>
          {f.review_status !== 'approved' && <Button title="Approve" loading={pending === 'approve'} disabled={save.loading && pending !== 'approve'} onPress={() => save.run('approved', 'approve')} testID="approve-finding" />}
          {f.review_status !== 'rejected' && <Button variant="danger" title="Reject" loading={pending === 'reject'} disabled={save.loading && pending !== 'reject'} onPress={() => save.run('rejected', 'reject')} testID="reject-finding" />}
          {f.review_status !== 'pending' && <Button variant="secondary" title="Back to pending" loading={pending === 'pending'} disabled={save.loading && pending !== 'pending'} onPress={() => save.run('pending', 'pending')} testID="finding-back-to-pending" />}
          {dirty && <Button variant="secondary" title="Save wording" loading={pending === 'wording'} disabled={save.loading && pending !== 'wording'} onPress={() => save.run(f.review_status, 'wording')} testID="save-finding-wording" />}
        </Row>
      </Section>

      <Section title="Convert to project task">
        {f.review_status === 'approved'
          ? <TaskForm key={`${f.edited_title ?? ''}|${f.edited_body ?? ''}`} f={f} onCreated={refresh} />
          : <Notice tone="neutral">Approve this finding first. Only findings you have checked and approved can become project tasks.</Notice>}
      </Section>

      <Section title="Project tasks from this finding">
        {f.project_tasks.length === 0 ? <Muted>None yet.</Muted> : (
          <Card>
            {f.project_tasks.map((t) => (
              <Row key={t.id} style={{ justifyContent: 'space-between' }} gap={theme.space.md}>
                <P style={{ flex: 1 }}>{t.title}</P>
                <Badge label={TASK_STATUS[t.status] ?? humanise(t.status)} tone={t.status === 'resolved' ? 'good' : 'neutral'} />
              </Row>
            ))}
          </Card>
        )}
        <Card>
          <NavRow title="Open the product" detail="Project tasks and their resolution are tracked there" onPress={() => go(`/creator/products/${r.product_id}`)} testID="open-product" />
        </Card>
      </Section>
    </>
  );
}

function TaskForm({ f, onCreated }: { f: Finding; onCreated: () => Promise<unknown> }) {
  const [title, setTitle] = useState(f.edited_title ?? f.title);
  const [description, setDescription] = useState(f.edited_body ?? f.body);
  const [ownerName, setOwnerName] = useState('');
  const [assignToMe, setAssignToMe] = useState(false);
  const [priority, setPriority] = useState<ProjectTask['priority']>('medium');
  const [due, setDue] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState(false);

  const create = useAction(async () => {
    setCreated(false);
    const parsed = projectTaskSchema.safeParse({ title, priority, due: due.trim() });
    const errs = fieldErrors(parsed);
    setErrors(errs);
    if (!parsed.success) return;
    await api.createProjectTaskFromFinding(f.id, { title: parsed.data.title, description: description.trim() || undefined, ownerName: ownerName.trim() || undefined,
      assignToMe, priority: parsed.data.priority, due: parsed.data.due || null });
    setCreated(true);
    await onCreated();
  });

  return (
    <>
      <Field label="Task title" value={title} onChangeText={setTitle} error={errors.title} testID="task-title" />
      <Field label="Description" value={description} onChangeText={setDescription} multiline testID="task-description" />
      <Field label="Owner name" hint="Optional. Who will do the work." value={ownerName} onChangeText={setOwnerName} testID="task-owner" />
      <Check label="Assign to me" checked={assignToMe} onChange={setAssignToMe} testID="task-assign-to-me" />
      <Choice label="Priority" options={PRIORITIES} value={priority} onChange={setPriority} error={errors.priority} testID="task-priority" />
      <Field label="Deadline" hint="Optional." placeholder="YYYY-MM-DD" value={due} onChangeText={setDue} error={errors.due} autoCapitalize="none" testID="task-due" />
      <ErrorNote error={create.error} />
      {created && <Notice tone="good">Project task created. It is listed below and on the product page.</Notice>}
      <Button title="Create project task" loading={create.loading} onPress={() => create.run()} testID="create-project-task" />
    </>
  );
}
