// Client-side validation (Zod). The database re-validates everything; this just gives fast, friendly errors.
import { z } from 'zod';
import type { ApplicationForm, FormStep } from './types';

const text = (label: string, max = 4000) => z.string().trim().min(1, `${label} is required`).max(max);

/** Validates one configurable application step against the round's own form definition. */
export function validateStep(step: FormStep, answers: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const q of step.questions) {
    const v = answers[q.key];
    const empty = v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.length === 0);
    if (q.required && empty) { errors[q.key] = 'Please answer this question'; continue; }
    if (empty) continue;
    if ((q.type === 'single') && !q.options?.some((o) => o.value === v)) errors[q.key] = 'Choose one of the options';
    if (q.type === 'multi' && !(Array.isArray(v) && v.every((x) => q.options?.some((o) => o.value === x)))) errors[q.key] = 'Choose from the options';
    if (q.type === 'text' && String(v).length > 2000) errors[q.key] = 'Please keep this under 2,000 characters';
  }
  return errors;
}
export const firstIncompleteStep = (form: ApplicationForm, answers: Record<string, unknown>) =>
  form.steps.findIndex((s) => Object.keys(validateStep(s, answers)).length > 0);

/** Availability & consent step. Recording consents are optional and deliberately not part of this schema. */
export const availabilitySchema = z.object({
  available_days: z.array(z.string()).min(1, 'Choose at least one day'),
  confirm_device_access: z.literal(true, { error: 'Please confirm you have the device' }),
  confirm_time_commitment: z.literal(true, { error: 'Please confirm you can spare the time' }),
  confirm_instructions: z.literal(true, { error: 'Please confirm you understand what testing involves' }),
  accept_terms: z.literal(true, { error: 'Please accept the privacy and participation terms' }),
});

export const taskFeedbackSchema = z.object({
  difficulty: z.enum(['very_easy', 'easy', 'somewhat_difficult', 'difficult', 'could_not_complete'], { error: 'Tell us how the task went' }),
  comment: z.string().max(5000).optional(),
  hadProblem: z.boolean({ error: 'Let us know whether you ran into a problem' }),
  helpRequested: z.boolean(),
});

export const bugSchema = z.object({
  title: text('A short title', 200).min(3, 'Give the issue a short title'),
  expected: text('What you expected'),
  actual: text('What actually happened'),
  steps: text('The steps to reproduce'),
  severity: z.enum(['minor', 'major', 'critical'], { error: 'Choose how serious it is' }),
  device: z.string().max(120).optional(),
  os: z.string().max(120).optional(),
});

export const verdictSchema = z.object({
  rating: z.number({ error: 'Choose a rating' }).int().min(1, 'Choose a rating').max(5),
  wouldUse: z.enum(['yes_definitely', 'maybe_with_improvements', 'no'], { error: 'Choose an option' }),
  biggestImprovement: text('Your biggest improvement recommendation'),
  verdict: z.enum(['good_to_go', 'good_needs_improvements', 'needs_major_redevelopment', 'insufficient_information'], { error: 'Choose a verdict' }),
  reason: text('The reason for your verdict'),
});

export const productSchema = z.object({
  name: text('Product name', 120), description: text('Description'),
  category: z.string().min(1, 'Choose a category'), stage: z.string().min(1, 'Choose a stage'),
  stage_label: z.string().max(60).optional(), target_audience: z.string().max(500).optional(),
  demo_url: z.union([z.literal(''), z.string().url('Enter a full link, starting with https://')]).optional(),
});
export const releaseSchema = z.object({ version: text('Version', 40), notes: z.string().max(2000).optional(),
  access_url: z.union([z.literal(''), z.string().url('Enter a full link, starting with https://')]).optional(), access_instructions: z.string().max(2000).optional() });
export const roundSchema = z.object({
  title: text('Title', 160), summary: text('What testers will be asked to do'),
  cohort_size: z.number({ error: 'Enter a number' }).int().min(1, 'At least 1 tester').max(10000),
  expected_minutes_min: z.number({ error: 'Enter a number' }).int().min(1),
  expected_minutes_max: z.number({ error: 'Enter a number' }).int().min(1),
  release_id: z.string().min(1, 'Choose a release'),
}).refine((v) => v.expected_minutes_max >= v.expected_minutes_min, { path: ['expected_minutes_max'], message: 'Must be at least the minimum' });
export const taskSchema = z.object({ title: text('Task title', 160), task_type: z.string().min(1),
  instructions: z.array(z.string()).min(1, 'Add at least one instruction step') });
export const projectTaskSchema = z.object({ title: text('Task title', 200), priority: z.enum(['low', 'medium', 'high', 'urgent']),
  due: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')]).optional() });

/** Flattens a Zod error into { field: message }. */
export function fieldErrors(result: { success: boolean; error?: z.ZodError }): Record<string, string> {
  const out: Record<string, string> = {};
  if (result.success || !result.error) return out;
  for (const issue of result.error.issues) { const k = String(issue.path[0] ?? '_'); if (!out[k]) out[k] = issue.message; }
  return out;
}
