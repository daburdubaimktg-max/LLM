// Small pieces shared by the tester screens.
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { COUNTRIES, DAYS } from '@/lib/labels';
import type { Application, ApplicationForm, FormQuestion, SessionTask } from '@/lib/types';
import { Button, Empty, H3, Muted, P, Row, Screen, theme } from '@/ui';

export const minutesRange = (min: number, max: number) => (min === max ? `${min} minutes` : `${min}–${max} minutes`);
export const shortId = (id: string) => id.slice(0, 8).toUpperCase();
export const go = (path: string) => router.push(path as never);
export const replace = (path: string) => router.replace(path as never);

/** A full screen asking a signed-out visitor to sign in first. */
export function SignInScreen({ title, message, next }: { title: string; message: string; next?: string }) {
  return (
    <Screen title={title}>
      <Empty title="Please sign in" body={message}
        action={<Button title="Sign in or create an account" testID="go-sign-in" onPress={() => go(next ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in')} />} />
    </Screen>
  );
}

/** Text link, used for quiet secondary actions such as "Edit". */
export function TextLink({ title, onPress, testID }: { title: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable accessibilityRole="link" testID={testID} onPress={onPress} hitSlop={8}>
      <Text style={{ color: theme.color.accent, fontSize: theme.font.small, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}

/** Collapsible block: a tappable heading that shows or hides its content. */
export function Collapsible({ title, open, onToggle, children, testID }: { title: string; open: boolean; onToggle: () => void; children: ReactNode; testID?: string }) {
  return (
    <View style={{ gap: theme.space.md }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} testID={testID} onPress={onToggle}
        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: theme.space.sm }}>
        <H3>{title}</H3>
        <Text style={{ color: theme.color.accent, fontSize: theme.font.small, fontWeight: '600' }}>{open ? 'Hide' : 'Show'}</Text>
      </Pressable>
      {open && children}
    </View>
  );
}

/** One label + value pair stacked vertically (for long answers). */
export function Answer({ label, value }: { label: string; value: string | null | undefined }) {
  const blank = value === null || value === undefined || value === '';
  return (
    <View style={{ gap: 2 }}>
      <Muted style={{ fontSize: theme.font.small }}>{label}</Muted>
      <P style={blank ? { color: theme.color.muted, fontStyle: 'italic' } : { color: theme.color.ink }}>{blank ? 'Not answered' : value}</P>
    </View>
  );
}

/** Options for a 'country' question: the round's allowed countries, or every country when unrestricted. */
export function countryOptions(allowed: string[]) {
  const codes = allowed.length ? allowed : Object.keys(COUNTRIES);
  return codes.map((code) => ({ value: code, label: COUNTRIES[code] ?? code }));
}

/** Turns a stored answer back into the words the tester saw. Empty string means not answered. */
export function answerText(q: FormQuestion, value: unknown): string {
  if (value === undefined || value === null) return '';
  const label = (v: unknown) => q.options?.find((o) => o.value === v)?.label ?? String(v);
  if (q.type === 'multi') return Array.isArray(value) ? value.map(label).join(', ') : '';
  if (q.type === 'country') return typeof value === 'string' && value ? COUNTRIES[value] ?? value : '';
  if (q.type === 'single') return value === '' ? '' : label(value);
  return String(value).trim();
}

type AvailabilityFields = Pick<Application, 'available_days' | 'confirm_device_access' | 'confirm_time_commitment' | 'confirm_instructions' | 'accept_terms'
  | 'consent_screenshots' | 'consent_recordings' | 'consent_voice'>;
const yesNo = (v: boolean) => (v ? 'Yes' : 'No');

/** Every question with the tester's answer in words, grouped by step. `onEdit(stepIndex)` adds an Edit link per group. */
export function AnswersSummary({ form, answers, availability, minutes, onEdit }: { form: ApplicationForm; answers: Record<string, unknown>;
  availability: AvailabilityFields; minutes: string; onEdit?: (step: number) => void }) {
  const heading = (title: string, index: number) => (
    <Row style={{ justifyContent: 'space-between' }}>
      <H3>{title}</H3>
      {onEdit && <TextLink title="Edit" testID={`edit-step-${index + 1}`} onPress={() => onEdit(index)} />}
    </Row>
  );
  const days = DAYS.filter((d) => availability.available_days.includes(d.value)).map((d) => d.label).join(', ');
  return (
    <View style={{ gap: theme.space.xl }}>
      {form.steps.map((step, i) => (
        <View key={step.id} style={{ gap: theme.space.md }}>
          {heading(step.title, i)}
          {step.questions.map((q) => <Answer key={q.key} label={q.label} value={answerText(q, answers[q.key])} />)}
        </View>
      ))}
      <View style={{ gap: theme.space.md }}>
        {heading('Availability and consent', form.steps.length)}
        <Answer label="Days you are available" value={days} />
        <Answer label="I have access to a supported device" value={yesNo(availability.confirm_device_access)} />
        <Answer label={`I can spare about ${minutes}`} value={yesNo(availability.confirm_time_commitment)} />
        <Answer label="I understand what testing involves" value={yesNo(availability.confirm_instructions)} />
        <Answer label="I accept the privacy and participation terms" value={yesNo(availability.accept_terms)} />
      </View>
      <View style={{ gap: theme.space.md }}>
        <H3>Optional sharing</H3>
        <Answer label="Screenshots" value={yesNo(availability.consent_screenshots)} />
        <Answer label="Screen recordings" value={yesNo(availability.consent_recordings)} />
        <Answer label="Voice notes" value={yesNo(availability.consent_voice)} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- session helpers
export const isFinished = (t: { status: string }) => t.status === 'completed' || t.status === 'blocked' || t.status === 'skipped';
/** Required tasks that still stand between the tester and the final review. */
export const requiredRemaining = (tasks: SessionTask[]) => tasks.filter((t) => t.is_required && t.status !== 'completed' && t.status !== 'blocked');
export const taskTitle = (t: SessionTask) => t.version?.title ?? t.title ?? `Task ${t.position}`;
export const sortedTasks = (tasks: SessionTask[]) => [...tasks].sort((a, b) => a.position - b.position);
/** The task this one is waiting on, if that task has not been finished yet. */
export function blockingTask(task: SessionTask, tasks: SessionTask[]): SessionTask | null {
  if (!task.depends_on_task_id) return null;
  const dep = tasks.find((t) => t.task_id === task.depends_on_task_id);
  return dep && (dep.status === 'not_started' || dep.status === 'in_progress') ? dep : null;
}
