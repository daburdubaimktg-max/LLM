import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { SignInPrompt } from '@/components/creator/parts';
import { go, invalidate, moved, param } from '@/components/creator/util';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { TASK_TYPES } from '@/lib/labels';
import { keys } from '@/lib/query';
import type { BuilderTask, CreatorRoundData } from '@/lib/types';
import { Badge, Button, Card, confirm, Divider, Empty, ErrorNote, H1, H3, Muted, Notice, QueryView, Row, Screen, theme, useAction } from '@/ui';

export default function TaskBuilder() {
  const { userId } = useAuth();
  const id = param(useLocalSearchParams<{ id: string }>().id) ?? '';
  const round = useQuery({ queryKey: keys.creatorRound(id), queryFn: () => api.creatorRoundData(id), enabled: !!userId && !!id });
  if (!userId) return <Screen title="Task builder"><SignInPrompt body="Sign in to build your testing tasks." /></Screen>;
  return <Screen title="Task builder"><QueryView query={round}>{(data) => <Builder data={data} />}</QueryView></Screen>;
}

function Builder({ data }: { data: CreatorRoundData }) {
  const roundId = data.round.id;
  const tasks = [...data.tasks].sort((a, b) => a.position - b.position);
  const [picking, setPicking] = useState(false);
  const [savedTemplate, setSavedTemplate] = useState<string | null>(null);
  const refresh = () => invalidate(keys.creatorRound(roundId), keys.round(roundId), keys.product(data.round.product_id), keys.creatorHome, keys.marketplace);

  const move = useAction(async (index: number, delta: -1 | 1) => {
    await api.reorderTasks(roundId, moved(tasks, index, delta).map((t) => t.id));
    await refresh();
  });
  const remove = useAction(async (task: BuilderTask) => {
    if (!(await confirm('Remove this task?', `“${task.version.title}” will be removed from this round. Results already collected for it are kept.`))) return;
    await api.archiveTask(task.id);
    await refresh();
  });
  const saveTemplate = useAction(async (task: BuilderTask) => {
    setSavedTemplate(null);
    await api.saveTaskAsTemplate(task.id);
    await invalidate(keys.templates);
    setSavedTemplate(task.version.title);
  });
  const busy = move.loading || remove.loading || saveTemplate.loading;

  return (
    <>
      <H1>Testing tasks</H1>
      <Muted>{data.round.title} · testers work through these in order.</Muted>
      <Muted style={{ fontSize: theme.font.small }}>Editing a task creates a new version. Testers who already started keep the version they were given.</Muted>
      <Button title="Add a task" onPress={() => go(`/creator/rounds/${roundId}/task`)} testID="add-task" />
      <Button variant="secondary" title={picking ? 'Hide templates' : 'Add from template'} onPress={() => setPicking(!picking)} testID="add-from-template" />
      {picking && <TemplatePicker roundId={roundId} onAdded={async () => { await refresh(); setPicking(false); }} />}

      <ErrorNote error={move.error ?? remove.error ?? saveTemplate.error} />
      {savedTemplate && <Notice tone="good">“{savedTemplate}” was saved to your template library.</Notice>}
      {tasks.length === 0 && <Empty title="No tasks yet" body="Add a task, or start from a template and adapt it to your product." />}
      {tasks.map((t, i) => {
        const after = t.depends_on_task_id ? tasks.find((x) => x.id === t.depends_on_task_id)?.version.title : null;
        return (
          <Card key={t.id} testID={`task-${t.id}`}>
            <Row style={{ alignItems: 'flex-start' }} gap={theme.space.md}>
              <H3 style={{ color: theme.color.accent }}>{i + 1}</H3>
              <View style={{ flex: 1, gap: 4 }}>
                <H3>{t.version.title}</H3>
                <Muted style={{ fontSize: theme.font.small }}>
                  {TASK_TYPES[t.version.task_type] ?? t.version.task_type}{t.version.estimated_minutes != null ? ` · ${t.version.estimated_minutes} min` : ''}
                </Muted>
                <Row wrap>
                  <Badge label={t.is_required ? 'Required' : 'Optional'} tone={t.is_required ? 'info' : 'neutral'} />
                  <Badge label={`v${t.version.version_number}`} />
                </Row>
                {t.version_count > 1 && <Muted style={{ fontSize: theme.font.small }}>
                  Edited {t.version_count - 1} {t.version_count === 2 ? 'time' : 'times'}. Earlier versions are kept for testers who started on them.</Muted>}
                {after && <Muted style={{ fontSize: theme.font.small }}>after: {after}</Muted>}
              </View>
            </Row>
            <Divider />
            <Row wrap>
              <Button small variant="secondary" title="Edit" disabled={busy} onPress={() => go(`/creator/rounds/${roundId}/task?taskId=${t.id}`)} testID={`edit-task-${t.id}`} />
              <Button small variant="ghost" title="Move up" disabled={busy || i === 0} onPress={() => move.run(i, -1)} testID={`move-up-task-${t.id}`} />
              <Button small variant="ghost" title="Move down" disabled={busy || i === tasks.length - 1} onPress={() => move.run(i, 1)} testID={`move-down-task-${t.id}`} />
              <Button small variant="ghost" title="Save as template" disabled={busy} onPress={() => saveTemplate.run(t)} testID={`template-task-${t.id}`} />
              <Button small variant="ghost" title="Remove" disabled={busy} onPress={() => remove.run(t)} testID={`remove-task-${t.id}`} />
            </Row>
          </Card>
        );
      })}
      <Button variant="ghost" title="Back to round setup" onPress={() => go(`/creator/rounds/${roundId}/settings`)} testID="back-to-setup" />
    </>
  );
}

function TemplatePicker({ roundId, onAdded }: { roundId: string; onAdded: () => Promise<void> }) {
  const templates = useQuery({ queryKey: keys.templates, queryFn: () => api.templates() });
  const add = useAction(async (templateId: string) => {
    await api.addTaskFromTemplate(roundId, templateId);
    await onAdded();
  });
  return (
    <Card>
      <H3>Choose a template</H3>
      <Muted style={{ fontSize: theme.font.small }}>It is added to the end of the list as a copy — edit it to fit your product.</Muted>
      <ErrorNote error={add.error} />
      <QueryView query={templates}>
        {(list) => list.length === 0
          ? <Muted>No templates available yet.</Muted>
          : <>{list.map((t) => (
              <View key={t.id}>
                <Divider />
                <Pressable accessibilityRole="button" disabled={add.loading} onPress={() => add.run(t.id)} testID={`pick-template-${t.id}`}
                  style={({ pressed }) => [{ gap: 2, paddingVertical: 4 }, (pressed || add.loading) && { opacity: 0.6 }]}>
                  <H3>{t.title}</H3>
                  <Muted style={{ fontSize: theme.font.small }}>{TASK_TYPES[t.task_type] ?? t.task_type} · {t.is_public ? 'Platform template' : 'Your template'}</Muted>
                </Pressable>
              </View>
            ))}</>}
      </QueryView>
    </Card>
  );
}
