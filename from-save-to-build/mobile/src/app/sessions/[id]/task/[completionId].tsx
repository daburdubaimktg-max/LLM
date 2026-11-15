import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { EvidenceList, EvidenceUploader } from '@/components/EvidenceUploader';
import { Answer, SignInScreen, blockingTask, go, replace, sortedTasks, taskTitle } from '@/components/tester';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { DIFFICULTY, TASK_STATUS, TASK_TYPES, difficultyLabel } from '@/lib/labels';
import { keys, queryClient } from '@/lib/query';
import { fieldErrors, taskFeedbackSchema } from '@/lib/schemas';
import type { Difficulty, FeedbackQuestion, SessionDetail, SessionTask } from '@/lib/types';
import { Badge, Bullets, Button, Check, Choice, Empty, ErrorNote, Field, H1, H2, Muted, Notice, P, Progress, QueryView, Row, Screen, Section, confirm, theme, useAction } from '@/ui';

const YES_NO = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];
const refresh = (sessionId: string) => Promise.all([keys.session(sessionId), keys.myTesting].map((queryKey) => queryClient.invalidateQueries({ queryKey })));

function questionAnswer(q: FeedbackQuestion, value: unknown) {
  if (value === undefined || value === null || value === '') return '';
  return q.type === 'single' ? q.options?.find((o) => o.value === value)?.label ?? String(value) : String(value);
}

function FeedbackForm({ d, task }: { d: SessionDetail; task: SessionTask }) {
  const sessionId = d.session.id;
  const questions = task.version.feedback_questions ?? [];
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [comment, setComment] = useState('');
  const [help, setHelp] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const canSkip = task.allow_skip || !task.is_required;

  const finish = useAction(async () => {
    const parsed = taskFeedbackSchema.safeParse({ difficulty: difficulty ?? undefined, comment: comment.trim() || undefined,
      hadProblem: problem === null ? undefined : problem === 'yes', helpRequested: help });
    setErrors(fieldErrors(parsed));
    if (!parsed.success) return;
    const kept = Object.fromEntries(Object.entries(answers).filter(([, v]) => v.trim() !== ''));
    await api.completeTask(task.id, { difficulty: parsed.data.difficulty, helpRequested: parsed.data.helpRequested, hadProblem: parsed.data.hadProblem,
      comment: parsed.data.comment, answers: kept });
    replace(parsed.data.hadProblem ? `/sessions/${sessionId}/bug?completionId=${task.id}` : `/sessions/${sessionId}`);
    void refresh(sessionId);
  });
  const skip = useAction(async () => {
    if (!(await confirm('Skip this task?', 'That is fine. You will not be able to come back to it later.'))) return;
    await api.skipTask(task.id, comment.trim() || undefined);
    replace(`/sessions/${sessionId}`);
    void refresh(sessionId);
  });

  return (
    <Section title="How did it go?">
      <Muted>Be honest — there are no wrong answers, and a hard time is just as useful to hear about as an easy one.</Muted>
      <Choice label="How did this task go?" options={DIFFICULTY} value={difficulty} onChange={(v: Difficulty) => { setDifficulty(v); setErrors((e) => ({ ...e, difficulty: '' })); }}
        error={errors.difficulty || undefined} testID="task-difficulty" />
      {difficulty === 'could_not_complete' && <Muted style={{ fontSize: theme.font.small }}>That is useful to know. If you can, say below where you got stuck.</Muted>}
      <Field label="Anything you want to add? (optional)" value={comment} onChangeText={setComment} multiline error={errors.comment || undefined} testID="task-comment" />
      <Check label="I needed help to get through this" checked={help} onChange={setHelp} testID="task-help" />
      {questions.map((q) => q.type === 'single'
        ? <Choice key={q.key} label={`${q.label} (optional)`} options={q.options ?? []} value={answers[q.key] ?? null} testID={`fq-${q.key}`}
            onChange={(v: string) => setAnswers((cur) => ({ ...cur, [q.key]: cur[q.key] === v ? '' : v }))} />
        : <Field key={q.key} label={`${q.label} (optional)`} value={answers[q.key] ?? ''} onChangeText={(v) => setAnswers((cur) => ({ ...cur, [q.key]: v }))} multiline testID={`fq-${q.key}`} />)}
      <Choice label="Did you run into a problem?" hint="For example something broke, looked wrong or stopped you. If yes, we will ask for a few details next."
        options={YES_NO} value={problem} onChange={(v: string) => { setProblem(v); setErrors((e) => ({ ...e, hadProblem: '' })); }}
        error={errors.hadProblem || undefined} testID="task-had-problem" />

      <View style={{ gap: theme.space.md, marginTop: theme.space.sm }}>
        <H2>Add a file (optional)</H2>
        <EvidenceUploader sessionId={sessionId} target={{ completionId: task.id }} consent={d.consent} existing={task.evidence ?? []}
          suggested={task.version.required_evidence ?? []} onUploaded={() => refresh(sessionId)} />
      </View>

      <ErrorNote error={finish.error ?? skip.error} />
      <Button title="Finish task" testID="complete-task" loading={finish.loading} disabled={skip.loading} onPress={() => finish.run()} />
      {canSkip && <Button variant="ghost" title="Skip this task" testID="skip-task" loading={skip.loading} disabled={finish.loading} onPress={() => skip.run()} />}
    </Section>
  );
}

function Summary({ d, task }: { d: SessionDetail; task: SessionTask }) {
  const sessionId = d.session.id;
  const feedback = (task.feedback ?? []).filter((f) => f.kind === 'task');
  const main = feedback.find((f) => !!f.difficulty) ?? feedback[0];
  const questions = task.version.feedback_questions ?? [];
  const open = d.session.status === 'active' || d.session.status === 'paused';
  return (
    <Section title="What you told us">
      {task.status === 'skipped' && <Muted>You skipped this task.</Muted>}
      {task.status !== 'skipped' && <Answer label="How did this task go?" value={difficultyLabel(task.difficulty ?? main?.difficulty)} />}
      {task.status !== 'skipped' && <Answer label="Needed help" value={(task.help_requested ?? main?.help_requested) ? 'Yes' : 'No'} />}
      {task.status !== 'skipped' && <Answer label="Ran into a problem" value={task.had_problem === null || task.had_problem === undefined ? '' : task.had_problem ? 'Yes' : 'No'} />}
      {!!main?.comment && <Answer label={task.status === 'skipped' ? 'Your note' : 'Your comment'} value={main.comment} />}
      {task.status !== 'skipped' && questions.map((q) => <Answer key={q.key} label={q.label} value={questionAnswer(q, main?.answers?.[q.key])} />)}
      {open && task.status !== 'skipped' ? (
        <View style={{ gap: theme.space.sm }}>
          <H2>Files (optional)</H2>
          <EvidenceUploader sessionId={sessionId} target={{ completionId: task.id }} consent={d.consent} existing={task.evidence ?? []} onUploaded={() => refresh(sessionId)} />
        </View>
      ) : (task.evidence?.length ?? 0) > 0 ? (
        <View style={{ gap: theme.space.sm }}><H2>Files you added</H2><EvidenceList files={task.evidence} /></View>
      ) : null}
      {open && <Button variant="secondary" title="Report a problem with this task" testID="report-task-problem" onPress={() => go(`/sessions/${sessionId}/bug?completionId=${task.id}`)} />}
      <Button variant="ghost" title="Back to all tasks" testID="back-to-tasks" onPress={() => replace(`/sessions/${sessionId}`)} />
    </Section>
  );
}

function Task({ d, completionId }: { d: SessionDetail; completionId: string }) {
  const sessionId = d.session.id;
  const tasks = sortedTasks(d.tasks);
  const index = tasks.findIndex((t) => t.id === completionId);
  const task = tasks[index];
  const start = useAction(async () => { await api.startTask(completionId); await refresh(sessionId); });
  const resume = useAction(async () => { await api.resumeSession(sessionId); await refresh(sessionId); });
  const skip = useAction(async () => {
    if (!(await confirm('Skip this task?', 'That is fine. You will not be able to come back to it later.'))) return;
    await api.skipTask(completionId);
    replace(`/sessions/${sessionId}`);
    void refresh(sessionId);
  });
  if (!task) return <Empty title="Task not found" body="This task is not part of your test." action={<Button title="Back to all tasks" onPress={() => replace(`/sessions/${sessionId}`)} />} />;
  const v = task.version;
  const waitingOn = task.status === 'not_started' ? blockingTask(task, tasks) : null;
  const pending = task.status === 'not_started' || task.status === 'in_progress';
  const status = d.session.status;

  return (
    <>
      <Progress value={index + 1} total={tasks.length} label={`Task ${index + 1} of ${tasks.length}`} />
      <H1>{taskTitle(task)}</H1>
      <Row wrap>
        <Badge label={TASK_TYPES[v.task_type] ?? v.task_type} />
        <Badge label={TASK_STATUS[task.status] ?? task.status} tone={task.status === 'completed' ? 'good' : task.status === 'in_progress' ? 'info' : 'neutral'} />
        {!task.is_required && <Badge label="Optional" />}
        {!!v.estimated_minutes && <Muted style={{ fontSize: theme.font.small }}>about {v.estimated_minutes} min</Muted>}
      </Row>
      {!!v.description && <P>{v.description}</P>}
      {!!v.scenario && <Notice tone="info" title="Imagine this">{v.scenario}</Notice>}
      {(v.instructions?.length ?? 0) > 0 && <Section title="What to do"><Bullets ordered items={v.instructions} /></Section>}
      {!!v.expected_result && <Section title="What should happen"><P>{v.expected_result}</P></Section>}
      {(v.success_criteria?.length ?? 0) > 0 && <Section title="You are done when"><Bullets items={v.success_criteria} /></Section>}

      {!pending && <Summary d={d} task={task} />}
      {pending && status === 'paused' && (
        <Section title="Your test is paused">
          <Muted>Resume to carry on with this task. Your progress is saved.</Muted>
          <ErrorNote error={resume.error} />
          <Button title="Resume testing" testID="resume-testing" loading={resume.loading} onPress={() => resume.run()} />
        </Section>
      )}
      {pending && (status === 'completed' || status === 'abandoned') && <Notice tone="neutral">This test is closed, so this task can no longer be done.</Notice>}
      {pending && status === 'active' && task.status === 'not_started' && (
        <Section title="Ready?">
          {waitingOn
            ? <>
                <Notice tone="neutral">Finish “{taskTitle(waitingOn)}” first — this task builds on it.</Notice>
                <Button title="Go to that task" testID="go-dependency" onPress={() => replace(`/sessions/${sessionId}/task/${waitingOn.id}`)} />
              </>
            : <>
                <Muted>Start when you have the product open. Take as long as you need — you answer a few short questions afterwards.</Muted>
                <ErrorNote error={start.error ?? skip.error} />
                <Button title="Start this task" testID="start-task" loading={start.loading} disabled={skip.loading} onPress={() => start.run()} />
                {(task.allow_skip || !task.is_required) && <Button variant="ghost" title="Skip this task" testID="skip-task" loading={skip.loading} disabled={start.loading} onPress={() => skip.run()} />}
              </>}
        </Section>
      )}
      {pending && status === 'active' && task.status === 'in_progress' && <FeedbackForm d={d} task={task} />}
    </>
  );
}

export default function TaskScreen() {
  const { id, completionId } = useLocalSearchParams<{ id: string; completionId: string }>();
  const { userId, ready } = useAuth();
  const q = useQuery({ queryKey: keys.session(id), queryFn: () => api.sessionDetail(id), enabled: !!userId });
  if (ready && !userId) return <SignInScreen title="Task" message="Sign in to continue your test." next={`/sessions/${id}/task/${completionId}`} />;
  return (
    <Screen title="Task">
      <QueryView query={q}>{(d) => <Task d={d} completionId={completionId} />}</QueryView>
    </Screen>
  );
}
