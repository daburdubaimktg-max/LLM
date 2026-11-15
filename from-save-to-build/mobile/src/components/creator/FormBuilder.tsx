// Application form builder: edits the round's own application_form JSON (steps -> questions -> options).
import { useState } from 'react';
import { View } from 'react-native';
import type { ApplicationForm, FormOption, FormQuestion } from '@/lib/types';
import { Button, Card, Check, Chip, Divider, ErrorNote, Field, H3, Muted, Notice, Row, theme, useAction } from '@/ui';
import { RowActions } from './parts';
import { moved, optionsFromLines, snakeCase, uniqueIn } from './util';

const QUESTION_TYPES: { value: FormQuestion['type']; label: string }[] = [
  { value: 'single', label: 'Choose one' }, { value: 'multi', label: 'Choose several' }, { value: 'text', label: 'Written answer' }, { value: 'country', label: 'Country' }];
export const questionTypeLabel = (t: string) => QUESTION_TYPES.find((x) => x.value === t)?.label ?? t;

interface DraftQuestion { uid: number; key: string; keyEdited: boolean; label: string; type: FormQuestion['type']; required: boolean; segment: boolean;
  optionsText: string; original: FormOption[] }
interface DraftStep { uid: number; id: string; title: string; intro: string; questions: DraftQuestion[] }

let nextUid = 1;
const newQuestion = (): DraftQuestion => ({ uid: nextUid++, key: '', keyEdited: false, label: '', type: 'single', required: true, segment: false, optionsText: '', original: [] });
const newStep = (): DraftStep => ({ uid: nextUid++, id: '', title: '', intro: '', questions: [newQuestion()] });

function toDraft(form: ApplicationForm | null | undefined): DraftStep[] {
  return (form?.steps ?? []).map((s) => ({ uid: nextUid++, id: s.id, title: s.title, intro: s.intro ?? '',
    questions: (s.questions ?? []).map((q) => ({ uid: nextUid++, key: q.key, keyEdited: true, label: q.label, type: q.type, required: !!q.required, segment: !!q.segment,
      optionsText: (q.options ?? []).map((o) => o.label).join('\n'), original: q.options ?? [] })) }));
}

/** Builds the stored form, or lists what still needs fixing. */
function fromDraft(steps: DraftStep[]): { form: ApplicationForm; problems: string[] } {
  const problems: string[] = [];
  const stepIds = new Set<string>(['availability', 'review']); // reserved for the steps the platform adds
  const seenKeys = new Map<string, string>();
  const form: ApplicationForm = { steps: steps.map((s, si) => {
    const stepName = s.title.trim() || `Step ${si + 1}`;
    if (!s.title.trim()) problems.push(`Step ${si + 1} needs a title.`);
    if (s.questions.length === 0) problems.push(`“${stepName}” has no questions. Add one or remove the step.`);
    const id = s.id && !stepIds.has(s.id) ? (stepIds.add(s.id), s.id) : uniqueIn(snakeCase(s.title), stepIds, 'step');
    const questions = s.questions.map((q, qi): FormQuestion => {
      const name = q.label.trim() || `Question ${qi + 1} in “${stepName}”`;
      const key = q.key.trim();
      if (!q.label.trim()) problems.push(`Question ${qi + 1} in “${stepName}” needs a label.`);
      if (!/^[a-z][a-z0-9_]*$/.test(key)) problems.push(`“${name}” needs a key made of lowercase letters, numbers and underscores, starting with a letter.`);
      else if (seenKeys.has(key)) problems.push(`“${name}” uses the key “${key}”, which “${seenKeys.get(key)}” already uses. Keys must be unique across the form.`);
      else seenKeys.set(key, name);
      const base = { key, label: q.label.trim(), type: q.type, required: q.required, ...(q.segment ? { segment: true } : {}) };
      if (q.type !== 'single' && q.type !== 'multi') return base;
      const options = optionsFromLines(q.optionsText, q.original);
      if (options.length < 2) problems.push(`“${name}” needs at least two options, one per line.`);
      return { ...base, options };
    });
    return { id, title: s.title.trim(), ...(s.intro.trim() ? { intro: s.intro.trim() } : {}), questions };
  }) };
  return { form, problems };
}

export function FormBuilder({ initial, onSave }: { initial: ApplicationForm | null | undefined; onSave: (form: ApplicationForm) => Promise<void> }) {
  const [steps, setSteps] = useState<DraftStep[]>(() => toDraft(initial));
  const [problems, setProblems] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const change = (next: DraftStep[]) => { setSteps(next); setSaved(false); };
  const patchStep = (si: number, patch: Partial<DraftStep>) => change(steps.map((s, i) => (i === si ? { ...s, ...patch } : s)));
  const patchQuestion = (si: number, qi: number, patch: Partial<DraftQuestion>) =>
    patchStep(si, { questions: steps[si].questions.map((q, i) => (i === qi ? { ...q, ...patch } : q)) });
  const save = useAction(async () => {
    const { form, problems: found } = fromDraft(steps);
    setProblems(found);
    if (found.length) throw new Error('The form has a few things to fix before it can be saved.');
    await onSave(form);
    setSaved(true);
  });

  return (
    <View style={{ gap: theme.space.md }}>
      <Muted style={{ fontSize: theme.font.small }}>
        Ask only what helps you choose the right testers. The “Availability and consent” step and the final review are added automatically by the platform.
      </Muted>
      {steps.map((s, si) => (
        <Card key={s.uid}>
          <Muted style={{ fontSize: theme.font.small }}>Step {si + 1} of {steps.length}</Muted>
          <Field label="Step title" value={s.title} onChangeText={(v) => patchStep(si, { title: v })} testID={`form-step-${si}-title`} />
          <Field label="Intro" hint="Optional. One friendly line shown above the questions." value={s.intro} onChangeText={(v) => patchStep(si, { intro: v })}
            testID={`form-step-${si}-intro`} />
          {s.questions.map((q, qi) => (
            <View key={q.uid} style={{ gap: theme.space.md }}>
              <Divider />
              <H3>Question {qi + 1}</H3>
              <Field label="Question" value={q.label} testID={`form-step-${si}-question-${qi}-label`}
                onChangeText={(v) => patchQuestion(si, qi, q.keyEdited ? { label: v } : { label: v, key: snakeCase(v) })} />
              <Field label="Key" hint="A short name used in your data and reports. Filled in from the question; change it if you like." value={q.key}
                onChangeText={(v) => patchQuestion(si, qi, { key: v, keyEdited: true })} autoCapitalize="none" testID={`form-step-${si}-question-${qi}-key`} />
              <Row wrap>{QUESTION_TYPES.map((t) =>
                <Chip key={t.value} label={t.label} selected={q.type === t.value} onPress={() => patchQuestion(si, qi, { type: t.value })}
                  testID={`form-step-${si}-question-${qi}-type-${t.value}`} />)}</Row>
              {(q.type === 'single' || q.type === 'multi') &&
                <Field label="Options" hint="One per line." value={q.optionsText} onChangeText={(v) => patchQuestion(si, qi, { optionsText: v })} multiline
                  testID={`form-step-${si}-question-${qi}-options`} />}
              <Check label="Required" checked={q.required} onChange={(v) => patchQuestion(si, qi, { required: v })} testID={`form-step-${si}-question-${qi}-required`} />
              <Check label="Use as a tester segment in reports" hint="Reports can then compare results between the groups this answer creates."
                checked={q.segment} onChange={(v) => patchQuestion(si, qi, { segment: v })} testID={`form-step-${si}-question-${qi}-segment`} />
              <RowActions index={qi} count={s.questions.length} onMove={(d) => patchStep(si, { questions: moved(s.questions, qi, d) })}
                onRemove={() => patchStep(si, { questions: s.questions.filter((_, i) => i !== qi) })} testID={`form-step-${si}-question-${qi}`} />
            </View>
          ))}
          <Divider />
          <Button small variant="secondary" title="Add question" onPress={() => patchStep(si, { questions: [...s.questions, newQuestion()] })}
            testID={`form-step-${si}-add-question`} style={{ alignSelf: 'flex-start' }} />
          <Row wrap>
            <Button small variant="ghost" title="Move step up" disabled={si === 0} onPress={() => change(moved(steps, si, -1))} testID={`form-step-${si}-up`} />
            <Button small variant="ghost" title="Move step down" disabled={si === steps.length - 1} onPress={() => change(moved(steps, si, 1))} testID={`form-step-${si}-down`} />
            <Button small variant="ghost" title="Remove step" onPress={() => change(steps.filter((_, i) => i !== si))} testID={`form-step-${si}-remove`} />
          </Row>
        </Card>
      ))}
      <Button variant="secondary" title="Add step" onPress={() => change([...steps, newStep()])} testID="form-add-step" />
      {problems.length > 0 && <Notice tone="warn" title="Before saving">{problems.join('\n')}</Notice>}
      <ErrorNote error={save.error} />
      {saved && <Notice tone="good">Application form saved.</Notice>}
      <Button title="Save application form" onPress={() => save.run()} loading={save.loading} testID="save-application-form" />
    </View>
  );
}
