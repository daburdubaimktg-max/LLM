// Small pure helpers shared by the creator setup screens.
import { router } from 'expo-router';
import { queryClient } from '@/lib/query';
import type { FormOption, Release, Round, RoundSummary } from '@/lib/types';
import type { Option, Tone } from '@/ui';

/** "How often do you…?" -> "how_often_do_you". Used for question keys and option values. */
export const snakeCase = (s: string) =>
  s.trim().toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60).replace(/_+$/g, '');

/** Returns `base`, or `base_2`, `base_3`… so it does not collide with anything in `taken` (which it then joins). */
export function uniqueIn(base: string, taken: Set<string>, fallback = 'item') {
  const root = base || fallback;
  let candidate = root;
  for (let n = 2; taken.has(candidate); n++) candidate = `${root}_${n}`;
  taken.add(candidate);
  return candidate;
}

export const optionsOf = (labels: Record<string, string>): Option[] => Object.entries(labels).map(([value, label]) => ({ value, label }));
export const cleanList = (items: string[]) => items.map((x) => x.trim()).filter(Boolean);
export const linesOf = (text: string) => cleanList(text.split('\n'));
export const orNull = (s: string) => (s.trim() ? s.trim() : null);

/** One option per line -> options. Values of options that already existed are kept so stored answers stay valid. */
export function optionsFromLines(text: string, existing: FormOption[] = []): FormOption[] {
  const taken = new Set<string>();
  return linesOf(text).map((label) => {
    const known = existing.find((o) => o.label === label && !taken.has(o.value));
    if (known) { taken.add(known.value); return { value: known.value, label }; }
    return { value: uniqueIn(snakeCase(label), taken, 'option'), label };
  });
}

export function moved<T>(items: T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

export const ROUND_STATUS: Record<Round['status'], { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' }, published: { label: 'Published', tone: 'good' }, closed: { label: 'Applications closed', tone: 'warn' },
  completed: { label: 'Completed', tone: 'info' }, archived: { label: 'Archived', tone: 'neutral' },
};

/** Applications, approvals, assignments and completed tests are different things, so each gets its own number. */
export const countsLine = (r: Pick<RoundSummary, 'stats' | 'sessions_completed'>) =>
  `${r.stats.pending_applications} awaiting review · ${r.stats.approved_testers} approved · ${r.stats.assigned_testers} assigned · `
  + `${r.sessions_completed} of ${r.stats.cohort_size} completed`;

export const newestFirst = (releases: Release[]) =>
  [...releases].sort((a, b) => (b.released_at ?? '').localeCompare(a.released_at ?? ''));
export const releaseOptions = (releases: Release[]): Option[] => newestFirst(releases).map((r) => ({ value: r.id, label: r.version }));

const pad = (n: number) => String(n).padStart(2, '0');
/** ISO timestamp -> local YYYY-MM-DD for a text input. */
export function isoToDateInput(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** YYYY-MM-DD -> ISO at the end of that local day. Empty -> null (no deadline). Anything else -> undefined (invalid). */
export function dateInputToIso(text: string): string | null | undefined {
  const t = text.trim();
  if (!t) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return undefined;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d, 23, 59, 59);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return undefined;
  return date.toISOString();
}

export const invalidate = (...queryKeys: (readonly unknown[])[]) =>
  Promise.all(queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));

export const go = (path: string) => router.push(path as never);
export const goReplace = (path: string) => router.replace(path as never);
/** Route params can arrive as string | string[]. */
export const param = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
