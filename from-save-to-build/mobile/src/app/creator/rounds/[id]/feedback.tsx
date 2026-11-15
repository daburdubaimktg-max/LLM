// Feedback explorer: what testers wrote, verbatim, task by task, plus their final reviews.
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Quote, SignInPrompt, VerdictBlock, go, matchesSegments, param, plainValue, taskOptions, taskTitles, useCreatorRound } from '@/components/creator-review';
import { useAuth } from '@/lib/auth';
import { segmentOptions } from '@/lib/dashboard';
import * as L from '@/lib/labels';
import type { CreatorRoundData } from '@/lib/types';
import { Badge, Button, Card, Check, ChipSelect, Empty, H3, Muted, QueryView, Row, Screen, Section, theme } from '@/ui';

const KIND: Record<string, string> = { general: 'General feedback', feature_request: 'Feature request' };

export default function FeedbackScreen() {
  const { userId } = useAuth();
  const id = param(useLocalSearchParams<{ id: string }>().id);
  if (!userId) return <SignInPrompt title="Feedback explorer" />;
  return <Feedback roundId={id} />;
}

function Feedback({ roundId }: { roundId: string }) {
  const query = useCreatorRound(roundId);
  return <Screen title="Feedback explorer"><QueryView query={query}>{(data) => <Explorer data={data} />}</QueryView></Screen>;
}

function Explorer({ data }: { data: CreatorRoundData }) {
  const [taskId, setTaskId] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [onlyComments, setOnlyComments] = useState(false);
  const [segments, setSegments] = useState<Record<string, string>>({});
  const titles = useMemo(() => taskTitles(data), [data]);
  const tasks = useMemo(() => taskOptions(data), [data]);
  const segs = useMemo(() => segmentOptions(data), [data]);
  const sessions = useMemo(() => new Map(data.sessions.map((s) => [s.id, s])), [data]);
  const questionLabels = useMemo(() => {
    const m = new Map<string, string>();
    data.tasks.forEach((t) => (t.version.feedback_questions ?? []).forEach((q) => m.set(`${t.id}:${q.key}`, q.label)));
    return m;
  }, [data]);

  const inSegment = (sessionId: string) => matchesSegments(sessions.get(sessionId)?.answers, segments);
  const items = data.feedback.filter((f) => (!taskId || f.task_id === taskId) && (!difficulty || f.difficulty === difficulty)
    && (!onlyComments || !!f.comment?.trim()) && inSegment(f.session_id));
  const verdicts = data.verdicts.filter((v) => inSegment(v.session_id));
  const name = (sessionId: string) => sessions.get(sessionId)?.tester_name ?? 'Former tester';

  return (
    <>
      <Muted>Comments are shown exactly as testers wrote them.</Muted>
      {tasks.length > 0 && <ChipSelect label="Task" options={tasks} value={taskId} onChange={setTaskId} />}
      <ChipSelect label="Difficulty rating" options={L.DIFFICULTY} value={difficulty} onChange={setDifficulty} />
      {segs.map((seg) => seg.values.length > 0 && (
        <ChipSelect key={seg.key} label={seg.label} options={seg.values} value={segments[seg.key] ?? ''} onChange={(v) => setSegments({ ...segments, [seg.key]: v })} />
      ))}
      <Check label="Only with written comments" checked={onlyComments} onChange={setOnlyComments} testID="only-comments" />

      <Section title="Task feedback">
        <Muted style={{ fontSize: theme.font.small }}>
          {data.feedback.length === 0 ? 'No feedback submitted yet.' : `Showing ${items.length} of ${data.feedback.length} feedback entries.`}
        </Muted>
        {data.feedback.length > 0 && items.length === 0 && <Empty title="Nothing matches these filters" />}
        {items.map((f) => {
          const answers = Object.entries(f.answers ?? {});
          return (
            <Card key={f.id}>
              <H3>{f.kind === 'task' ? (f.task_id ? titles.get(f.task_id) ?? 'Removed task' : 'Task') : KIND[f.kind] ?? 'Feedback'}</H3>
              <Row wrap>
                {f.difficulty && <Badge label={L.difficultyLabel(f.difficulty)} tone={f.difficulty === 'could_not_complete' ? 'bad' : f.difficulty === 'difficult' ? 'warn' : 'neutral'} />}
                {f.help_requested === true && <Badge label="Help requested" tone="warn" />}
              </Row>
              {f.comment?.trim() ? <Quote>{f.comment}</Quote> : <Muted style={{ fontSize: theme.font.small }}>No written comment.</Muted>}
              {answers.map(([k, v]) => (
                <Muted key={k} style={{ fontSize: theme.font.small }}>{questionLabels.get(`${f.task_id}:${k}`) ?? k}: {plainValue(v)}</Muted>
              ))}
              <Row style={{ justifyContent: 'space-between' }} gap={theme.space.md}>
                <Muted style={{ fontSize: theme.font.small, flex: 1 }}>{name(f.session_id)} · {L.dateTime(f.created_at)}</Muted>
                <Button small variant="ghost" title="Open session" onPress={() => go(`/creator/sessions/${f.session_id}`)} />
              </Row>
            </Card>
          );
        })}
      </Section>

      <Section title="Final reviews">
        <Muted style={{ fontSize: theme.font.small }}>
          {data.verdicts.length === 0 ? 'No final reviews yet.' : `Showing ${verdicts.length} of ${data.verdicts.length} final reviews. Task and difficulty filters do not apply here.`}
        </Muted>
        {verdicts.map((v) => (
          <Card key={v.id}>
            <Row style={{ justifyContent: 'space-between' }} gap={theme.space.md}>
              <H3 style={{ flex: 1 }}>{name(v.session_id)}</H3>
              <Button small variant="ghost" title="Open session" onPress={() => go(`/creator/sessions/${v.session_id}`)} />
            </Row>
            <VerdictBlock verdict={v} />
          </Card>
        ))}
      </Section>
    </>
  );
}
