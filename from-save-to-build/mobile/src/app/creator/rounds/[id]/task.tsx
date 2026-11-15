import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { RowActions, SignInPrompt, StringList } from '@/components/creator/parts';
import { cleanList, go, goReplace, invalidate, moved, optionsFromLines, optionsOf, orNull, param, snakeCase, uniqueIn } from '@/components/creator/util';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { EVIDENCE, TASK_TYPES } from '@/lib/labels';
import { keys } from '@/lib/query';
import { fieldErrors, taskSchema } from '@/lib/schemas';
import type { BuilderTask, CreatorRoundData, EvidenceKind, FeedbackQuestion, FormOption, TaskDefinition, TaskType } from '@/lib/types';
import { Button, Card, Chip, Choice, Empty, ErrorNote, Field, H1, H2, Muted, Notice, QueryView, Row, Screen, Spacer, theme, useAction } from '@/ui';

export default function TaskEditor() {
  const { userId } = useAuth();
  const params = useLocalSearchParams<{ id: string; taskId?: string }>();
  const id = param(params.id) ?? '';
  const taskId = param(params.taskId) ?? null;
  const title = taskId ? 'Edit task' : 'New task';
  const round = useQuery({ queryKey: keys.creatorRound(id), queryFn: () => api.creatorRoundData(id), enabled: !!userId && !!id });
  if (!userId) return <Screen title={title}><SignInPrompt body="Sign in to edit testing tasks." /></Screen>;
  return (
    <Screen title={title}>
      <QueryView query={round}>
        {(data) => {
          const task = taskId ? data.tasks.find((t) => t.id === taskId) : undefined;
          if (taskId && !task) {
            return <Empty title="Task not found" body="It may have been removed from this round."
              action={<Button title="Back to task builder" onPress={() => goReplace(`/creator/rounds/${id}/tasks`)} />} />;
          }
          return <Editor key={task?.id ?? 'new'} data={data} task={task} />;
        }}
      </QueryView>
    </Screen>
  );
}

interface DraftQuestion { uid: number; key: string; label: string; type: FeedbackQuestion['type']; optionsText: string; original: FormOption[] }
let nextUid = 1;
const REQUIREMENT = [
  { value: 'required', label: 'Required — testers must attempt it' },
  { value: 'optional', label: 'Optional — testers may skip it' }];

/** Tasks that (directly or indirectly) come after `taskId`; depending on one of them would create a loop. */
function dependants(tasks: BuilderTask[], taskId: string): Set<string> {
  const out = new Set<string>();
  for (let grew = true; grew;) {
    grew = false;
    for (const t of tasks) {
      if (!out.has(t.id) && t.depends_on_task_id && (t.depends_on_task_id === taskId || out.has(t.depends_on_task_id))) { out.add(t.id); grew = true; }
    }
  }
  return out;
}

function Editor({ data, task }: { data: CreatorRoundData; task?: BuilderTask }) {
  const roundId = data.round.id;
  const v = task?.version;
  const [title, setTitle] = useState(v?.title ?? '');
  const [taskType, setTaskType] = useState<TaskType>(v?.task_type ?? 'guided_scenario');
  const [description, setDescription] = useState(v?.description ?? '');
  const [scenario, setScenario] = useState(v?.scenario ?? '');
  const [instructions, setInstructions] = useState<string[]>(v?.instructions?.length ? v.instructions : ['']);
  const [expected, setExpected] = useState(v?.expected_result ?? '');
  const [criteria, setCriteria] = useState<string[]>(v?.success_criteria ?? []);
  const [measures, setMeasures] = useState<string[]>(v?.measures ?? []);
  const [minutes, setMinutes] = useState(v?.estimated_minutes != null ? String(v.estimated_minutes) : '');
  const [required, setRequired] = useState(task ? task.is_required : true);
  const [evidence, setEvidence] = useState<EvidenceKind[]>(v?.required_evidence ?? []);
  const [questions, setQuestions] = useState<DraftQuestion[]>(() => (v?.feedback_questions ?? []).map((q) => ({ uid: nextUid++, key: q.key, label: q.label, type: q.type,
    optionsText: (q.options ?? []).map((o) => o.label).join('\n'), original: q.options ?? [] })));
  const [dependsOn, setDependsOn] = useState(task?.depends_on_task_id ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const blocked = task ? dependants(data.tasks, task.id) : new Set<string>();
  const others = [...data.tasks].sort((a, b) => a.position - b.position).filter((t) => t.id !== task?.id && !blocked.has(t.id));
  const patchQuestion = (i: number, patch: Partial<DraftQuestion>) => setQuestions(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  const save = useAction(async () => {
    const steps = cleanList(instructions);
    const parsed = taskSchema.safeParse({ title, task_type: taskType, instructions: steps });
    const found = fieldErrors(parsed);
    const mins = minutes.trim() === '' ? null : Number(minutes);
    if (mins !== null && (!Number.isInteger(mins) || mins < 1)) found.estimated_minutes = 'Enter a whole number of minutes, or leave it empty';
    const keysTaken = new Set<string>();
    const feedbackQuestions: FeedbackQuestion[] = [];
    questions.forEach((q, i) => {
      const label = q.label.trim();
      if (!label) { found.feedback_questions = `Feedback question ${i + 1} needs a label, or remove it.`; return; }
      const key = uniqueIn(q.key || snakeCase(label), keysTaken, 'question');
      if (q.type === 'text') { feedbackQuestions.push({ key, label, type: 'text' }); return; }
      const options = optionsFromLines(q.optionsText, q.original);
      if (options.length < 2) found.feedback_questions = `“${label}” needs at least two options, one per line.`;
      feedbackQuestions.push({ key, label, type: 'single', options });
    });
    setErrors(found);
    if (!parsed.success || Object.keys(found).length) throw new Error('Please check the highlighted fields.');
    const def: TaskDefinition = {
      title: parsed.data.title, task_type: taskType, description: orNull(description), scenario: orNull(scenario), instructions: steps,
      expected_result: orNull(expected), success_criteria: cleanList(criteria), measures: cleanList(measures), estimated_minutes: mins,
      required_evidence: evidence, feedback_questions: feedbackQuestions, allow_skip: !required,
    };
    await api.saveTask(roundId, task?.id ?? null, def, { isRequired: required, dependsOn: dependsOn || null });
    await invalidate(keys.creatorRound(roundId), keys.round(roundId), keys.product(data.round.product_id), keys.creatorHome, keys.marketplace);
    if (router.canGoBack()) router.back(); else goReplace(`/creator/rounds/${roundId}/tasks`);
  });

  return (
    <>
      <H1>{task ? 'Edit task' : 'New task'}</H1>
      <Muted>{data.round.title}</Muted>
      {task && v && <Notice tone="neutral">Saving creates version {v.version_number + 1}; existing sessions are unaffected.</Notice>}
      <Spacer size={4} />

      <Field label="Task title" value={title} onChangeText={setTitle} error={errors.title} testID="task-title" />
      <Choice label="Task type" options={optionsOf(TASK_TYPES)} value={taskType} onChange={setTaskType} error={errors.task_type} testID="task-type" />
      <Field label="Description" hint="Optional. One or two lines on what this task is about." value={description} onChangeText={setDescription} multiline testID="task-description" />
      <Field label="Real-world scenario" hint="Optional. Put the tester in a situation, for example “It is the end of the month and you want to…”" value={scenario}
        onChangeText={setScenario} multiline testID="task-scenario" />

      <Spacer size={theme.space.sm} />
      <H2>What testers do</H2>
      <StringList label="Step-by-step instructions" items={instructions} onChange={setInstructions} addLabel="Add step" ordered error={errors.instructions}
        placeholder="One clear action per step" testID="task-instruction" />
      <Field label="Expected result" hint="Optional. What should happen if everything works." value={expected} onChangeText={setExpected} multiline testID="task-expected-result" />
      <StringList label="Success criteria" hint="Optional. How a tester knows the task is done." items={criteria} onChange={setCriteria} addLabel="Add criterion" testID="task-criterion" />

      <Spacer size={theme.space.sm} />
      <H2>What you learn</H2>
      <StringList label="What you want to learn / measure" hint="Optional. For your own analysis — for example “time to first budget” or “where people hesitate”."
        items={measures} onChange={setMeasures} addLabel="Add measure" testID="task-measure" />
      <View style={{ gap: theme.space.sm }}>
        <Muted style={{ fontSize: theme.font.small }}>
          Feedback questions are asked right after the task, in addition to the standard “how did it go?” questions.
        </Muted>
        {questions.map((q, i) => (
          <Card key={q.uid}>
            <Field label={`Feedback question ${i + 1}`} value={q.label} onChangeText={(t) => patchQuestion(i, { label: t })} testID={`task-question-${i}-label`} />
            <Row wrap>
              <Chip label="Written answer" selected={q.type === 'text'} onPress={() => patchQuestion(i, { type: 'text' })} testID={`task-question-${i}-type-text`} />
              <Chip label="Choose one" selected={q.type === 'single'} onPress={() => patchQuestion(i, { type: 'single' })} testID={`task-question-${i}-type-single`} />
            </Row>
            {q.type === 'single' && <Field label="Options" hint="One per line." value={q.optionsText} onChangeText={(t) => patchQuestion(i, { optionsText: t })} multiline
              testID={`task-question-${i}-options`} />}
            <RowActions index={i} count={questions.length} onMove={(d) => setQuestions(moved(questions, i, d))}
              onRemove={() => setQuestions(questions.filter((_, j) => j !== i))} testID={`task-question-${i}`} />
          </Card>
        ))}
        <Button small variant="secondary" title="Add feedback question" style={{ alignSelf: 'flex-start' }} testID="task-question-add"
          onPress={() => setQuestions([...questions, { uid: nextUid++, key: '', label: '', type: 'text', optionsText: '', original: [] }])} />
        {!!errors.feedback_questions && <Muted style={{ color: theme.color.bad, fontSize: theme.font.small }}>{errors.feedback_questions}</Muted>}
      </View>

      <Spacer size={theme.space.sm} />
      <H2>Rules</H2>
      <Field label="Estimated minutes" hint="Optional." value={minutes} onChangeText={setMinutes} keyboardType="numeric" error={errors.estimated_minutes} testID="task-minutes" />
      <Choice label="Required or optional" options={REQUIREMENT} value={required ? 'required' : 'optional'} onChange={(x: string) => setRequired(x === 'required')}
        testID="task-requirement" />
      <Choice multi label="Evidence to ask for" hint="Optional. Testers can only supply evidence types they consented to, so treat these as requests, not guarantees."
        options={optionsOf(EVIDENCE)} value={evidence} onChange={setEvidence} testID="task-evidence" />
      {others.length > 0
        ? <Choice label="Must come after" hint="Testers cannot start this task until the chosen one is finished."
            options={[{ value: '', label: 'No dependency' }, ...others.map((t) => ({ value: t.id, label: t.version.title }))]} value={dependsOn} onChange={setDependsOn}
            testID="task-depends-on" />
        : <Muted style={{ fontSize: theme.font.small }}>Once the round has other tasks, you can make this one depend on another.</Muted>}

      <ErrorNote error={save.error} />
      <Button title={task ? 'Save new version' : 'Save task'} onPress={() => save.run()} loading={save.loading} testID="save-task" />
      <Button variant="ghost" title="Cancel" onPress={() => (router.canGoBack() ? router.back() : go(`/creator/rounds/${roundId}/tasks`))} testID="cancel-task" />
    </>
  );
}
