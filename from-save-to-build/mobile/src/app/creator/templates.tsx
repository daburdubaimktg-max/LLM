import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { SignInPrompt } from '@/components/creator/parts';
import { invalidate } from '@/components/creator/util';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { EVIDENCE, TASK_TYPES } from '@/lib/labels';
import { keys } from '@/lib/query';
import type { TaskTemplate } from '@/lib/types';
import { Bullets, Button, Card, confirm, Divider, Eyebrow, ErrorNote, H1, H3, Muted, Notice, P, QueryView, Row, Screen, Section, theme, useAction } from '@/ui';

export default function TemplateLibrary() {
  const { userId } = useAuth();
  const templates = useQuery({ queryKey: keys.templates, queryFn: () => api.templates(), enabled: !!userId });
  const remove = useAction(async (t: TaskTemplate) => {
    if (!(await confirm('Delete this template?', `“${t.title}” will be removed from your library. Tasks already created from it are not affected.`))) return;
    await api.deleteTemplate(t.id);
    await invalidate(keys.templates);
  });
  if (!userId) return <Screen title="Task templates"><SignInPrompt body="Sign in to see your task templates." /></Screen>;
  return (
    <Screen title="Task templates">
      <H1>Task template library</H1>
      <Muted>Reusable starting points for testing tasks.</Muted>
      <Notice tone="neutral" title="How to use a template">
        <Bullets items={[
          'Open a round’s task builder and choose “Add from template”. The task is added as a copy you can edit.',
          'In the task builder, “Save as template” keeps one of your own tasks here so you can reuse it in other rounds.',
        ]} />
      </Notice>
      <ErrorNote error={remove.error} />
      <QueryView query={templates}>
        {(list) => {
          const platform = list.filter((t) => t.is_public);
          const own = list.filter((t) => !t.is_public && t.owner_id === userId);
          return (
            <>
              <Section title="Your templates">
                {own.length === 0 ? <Muted>None yet. Save a task as a template from a round’s task builder.</Muted>
                  : own.map((t) => <TemplateCard key={t.id} template={t} onDelete={() => remove.run(t)} deleting={remove.loading} />)}
              </Section>
              <Section title="Platform templates">
                {platform.length === 0 ? <Muted>No platform templates are available.</Muted> : platform.map((t) => <TemplateCard key={t.id} template={t} />)}
              </Section>
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}

function TemplateCard({ template: t, onDelete, deleting }: { template: TaskTemplate; onDelete?: () => void; deleting?: boolean }) {
  const [open, setOpen] = useState(false);
  const d = t.definition ?? {};
  const steps = d.instructions ?? [];
  const questions = d.feedback_questions ?? [];
  return (
    <Card testID={`template-${t.id}`}>
      <H3>{t.title}</H3>
      <Muted style={{ fontSize: theme.font.small }}>
        {TASK_TYPES[t.task_type] ?? t.task_type} · {steps.length} {steps.length === 1 ? 'instruction step' : 'instruction steps'}
      </Muted>
      {!!d.scenario && !open && <Muted numberOfLines={2}>{d.scenario}</Muted>}
      {open && (
        <View style={{ gap: theme.space.md }}>
          <Divider />
          {!!d.description && <Block label="Description"><P>{d.description}</P></Block>}
          {!!d.scenario && <Block label="Scenario"><P>{d.scenario}</P></Block>}
          {steps.length > 0 && <Block label="Instructions"><Bullets ordered items={steps} /></Block>}
          {!!d.expected_result && <Block label="Expected result"><P>{d.expected_result}</P></Block>}
          {!!d.success_criteria?.length && <Block label="Success criteria"><Bullets items={d.success_criteria} /></Block>}
          {!!d.measures?.length && <Block label="What it measures"><Bullets items={d.measures} /></Block>}
          {!!d.required_evidence?.length && <Block label="Evidence asked for"><P>{d.required_evidence.map((e) => EVIDENCE[e] ?? e).join(', ')}</P></Block>}
          {questions.length > 0 && <Block label="Feedback questions">
            <Bullets items={questions.map((q) => (q.type === 'single' && q.options?.length ? `${q.label} (${q.options.map((o) => o.label).join(' / ')})` : q.label))} />
          </Block>}
          {d.estimated_minutes != null && <Muted style={{ fontSize: theme.font.small }}>About {d.estimated_minutes} min · {d.allow_skip ? 'testers may skip it' : 'cannot be skipped'}</Muted>}
        </View>
      )}
      <Row wrap>
        <Button small variant="secondary" title={open ? 'Hide details' : 'Show details'} onPress={() => setOpen(!open)} testID={`toggle-template-${t.id}`} />
        {onDelete && <Button small variant="ghost" title="Delete" disabled={deleting} onPress={onDelete} testID={`delete-template-${t.id}`} />}
      </Row>
    </Card>
  );
}

const Block = ({ label, children }: { label: string; children: React.ReactNode }) => <View style={{ gap: 6 }}><Eyebrow>{label}</Eyebrow>{children}</View>;
