// Plain-language labels for stored values.
import type { ApplicationStatus, Difficulty, TaskType } from './types';

export const CATEGORIES: Record<string, string> = { finance: 'Finance & budgeting', productivity: 'Productivity', health_fitness: 'Health & fitness',
  beauty_personal_care: 'Beauty & personal care', education: 'Education', travel: 'Travel', entertainment: 'Entertainment',
  ecommerce: 'E-commerce', creator_tools: 'Creator tools', other: 'Other' };
export const STAGES: Record<string, string> = { idea: 'Idea', prototype: 'Prototype', alpha: 'Alpha', beta: 'Beta', live: 'Live' };
export const DEVICES: Record<string, string> = { iphone: 'iPhone', android: 'Android', web: 'Web' };
export const REWARDS: Record<string, string> = { unpaid: 'Unpaid', paid: 'Paid', perk: 'Perk' };
export const COUNTRIES: Record<string, string> = { AE: 'United Arab Emirates', SA: 'Saudi Arabia', QA: 'Qatar', KW: 'Kuwait', BH: 'Bahrain', OM: 'Oman',
  EG: 'Egypt', JO: 'Jordan', LB: 'Lebanon', IN: 'India', PK: 'Pakistan', BD: 'Bangladesh', LK: 'Sri Lanka', PH: 'Philippines', ID: 'Indonesia',
  MY: 'Malaysia', SG: 'Singapore', GB: 'United Kingdom', US: 'United States', CA: 'Canada', AU: 'Australia', DE: 'Germany', FR: 'France',
  NG: 'Nigeria', KE: 'Kenya', ZA: 'South Africa', TR: 'Türkiye', OTHER: 'Somewhere else' };
export const country = (code: string | null | undefined) => (code ? COUNTRIES[code] ?? code : '—');

export const APPLICATION_STATUS: Record<ApplicationStatus, { label: string; tone: 'neutral' | 'info' | 'good' | 'warn' | 'bad'; help: string }> = {
  draft: { label: 'Draft', tone: 'neutral', help: 'Not sent yet. Pick up where you left off.' },
  submitted: { label: 'Submitted', tone: 'info', help: 'Sent to the product team. Nothing more to do for now.' },
  under_review: { label: 'Under review', tone: 'info', help: 'The team is reading your application.' },
  info_requested: { label: 'More information requested', tone: 'warn', help: 'The team asked a question. Update your application and send it again.' },
  approved: { label: 'Approved', tone: 'good', help: 'You are in. Your testing invitation appears here once the team sends it.' },
  waitlisted: { label: 'Waitlisted', tone: 'warn', help: 'All places are taken for now. You will be told if one opens up.' },
  declined: { label: 'Declined', tone: 'bad', help: 'You were not selected for this round.' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral', help: 'You withdrew this application.' },
};
export const DIFFICULTY: { value: Difficulty; label: string }[] = [
  { value: 'very_easy', label: 'Very easy' }, { value: 'easy', label: 'Easy' }, { value: 'somewhat_difficult', label: 'Somewhat difficult' },
  { value: 'difficult', label: 'Difficult' }, { value: 'could_not_complete', label: 'Could not complete' }];
export const difficultyLabel = (d: string | null | undefined) => DIFFICULTY.find((x) => x.value === d)?.label ?? '—';
export const TASK_TYPES: Record<TaskType, string> = { guided_scenario: 'Guided scenario', feature_exploration: 'Feature exploration',
  usability_assessment: 'Usability assessment', bug_reproduction: 'Bug reproduction', comparison: 'Comparison',
  comprehension_check: 'Knowledge or comprehension check', open_exploration: 'Open-ended exploration', final_review: 'Final product review' };
export const TASK_STATUS: Record<string, string> = { not_started: 'Not started', in_progress: 'In progress', completed: 'Completed', blocked: 'Blocked', skipped: 'Skipped' };
export const SEVERITY: Record<string, string> = { minor: 'Minor', major: 'Major', critical: 'Critical' };
export const WOULD_USE = [{ value: 'yes_definitely', label: 'Yes, definitely' }, { value: 'maybe_with_improvements', label: 'Maybe, with improvements' }, { value: 'no', label: 'No' }];
export const VERDICTS = [{ value: 'good_to_go', label: 'Good to go' }, { value: 'good_needs_improvements', label: 'Good, needs improvements' },
  { value: 'needs_major_redevelopment', label: 'Needs major redevelopment' }, { value: 'insufficient_information', label: 'Insufficient information' }];
export const verdictLabel = (v: string | null | undefined) => VERDICTS.find((x) => x.value === v)?.label ?? '—';
export const wouldUseLabel = (v: string | null | undefined) => WOULD_USE.find((x) => x.value === v)?.label ?? '—';
export const TRIAGE: Record<string, string> = { new: 'New', reviewed: 'Reviewed', in_progress: 'In progress', needs_info: 'Needs info', duplicate: 'Duplicate', fixed: 'Fixed', closed: 'Closed' };
export const SECTIONS: Record<string, string> = { worked_well: 'What worked well', usability_problems: 'Most common usability problems',
  technical_problems: 'Critical technical problems', feature_requests: 'Feature requests', task_analysis: 'Task-level completion analysis',
  segment_differences: 'Differences between tester segments', conflicting_opinions: 'Conflicting opinions',
  priorities: 'Recommended priorities', next_steps: 'Suggested next testing steps' };
export const DAYS = [{ value: 'mon', label: 'Mon' }, { value: 'tue', label: 'Tue' }, { value: 'wed', label: 'Wed' }, { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' }, { value: 'sat', label: 'Sat' }, { value: 'sun', label: 'Sun' }];
export const EVIDENCE: Record<string, string> = { screenshot: 'Screenshot', recording: 'Screen recording', voice: 'Voice note' };
export const date = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const dateTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const duration = (seconds: number) => (seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`);
