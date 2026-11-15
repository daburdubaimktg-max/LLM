// The round details form, shared by "new testing round" and the round setup hub.
import { Text, View } from 'react-native';
import { COUNTRIES, DEVICES, REWARDS } from '@/lib/labels';
import { fieldErrors, roundSchema } from '@/lib/schemas';
import type { Release, Round } from '@/lib/types';
import { Check, Chip, Choice, Field, KeyValue, Muted, Row, theme } from '@/ui';
import { dateInputToIso, isoToDateInput, optionsOf, orNull, releaseOptions } from './util';

export interface RoundFormState {
  release_id: string; title: string; summary: string; target_audience: string; cohort_size: string; minutes_min: string; minutes_max: string;
  supported_devices: string[]; countries: string[]; application_deadline: string; testing_deadline: string; reward_type: Round['reward_type'];
  reward_details: string; privacy_requirements: string; beginner_friendly: boolean; instructions: string; access_instructions: string; support_contact: string;
}
export const emptyRoundForm = (releaseId: string): RoundFormState => ({
  release_id: releaseId, title: '', summary: '', target_audience: '', cohort_size: '', minutes_min: '', minutes_max: '', supported_devices: [], countries: [],
  application_deadline: '', testing_deadline: '', reward_type: 'unpaid', reward_details: '', privacy_requirements: '', beginner_friendly: false,
  instructions: '', access_instructions: '', support_contact: '',
});
export const roundToForm = (r: Round): RoundFormState => ({
  release_id: r.release_id, title: r.title, summary: r.summary, target_audience: r.target_audience ?? '', cohort_size: String(r.cohort_size),
  minutes_min: String(r.expected_minutes_min), minutes_max: String(r.expected_minutes_max), supported_devices: r.supported_devices ?? [], countries: r.countries ?? [],
  application_deadline: isoToDateInput(r.application_deadline), testing_deadline: isoToDateInput(r.testing_deadline), reward_type: r.reward_type,
  reward_details: r.reward_details ?? '', privacy_requirements: r.privacy_requirements ?? '', beginner_friendly: r.beginner_friendly,
  instructions: r.instructions ?? '', access_instructions: r.access_instructions ?? '', support_contact: r.support_contact ?? '',
});

const num = (s: string) => (s.trim() === '' ? Number.NaN : Number(s));

/** Validates the form; `values` is ready for api.createRound / api.updateRound when there are no errors. */
export function readRoundForm(f: RoundFormState) {
  const parsed = roundSchema.safeParse({ title: f.title, summary: f.summary, cohort_size: num(f.cohort_size), expected_minutes_min: num(f.minutes_min),
    expected_minutes_max: num(f.minutes_max), release_id: f.release_id });
  const errors = fieldErrors(parsed);
  const applicationDeadline = dateInputToIso(f.application_deadline);
  const testingDeadline = dateInputToIso(f.testing_deadline);
  if (applicationDeadline === undefined) errors.application_deadline = 'Use YYYY-MM-DD, for example 2027-03-31';
  if (testingDeadline === undefined) errors.testing_deadline = 'Use YYYY-MM-DD, for example 2027-03-31';
  if (applicationDeadline && testingDeadline && testingDeadline < applicationDeadline) errors.testing_deadline = 'Testing should end on or after the application deadline';
  if (!parsed.success || Object.keys(errors).length) return { errors, values: null };
  return { errors, values: {
    ...parsed.data, target_audience: orNull(f.target_audience), supported_devices: f.supported_devices, countries: f.countries,
    application_deadline: applicationDeadline ?? null, testing_deadline: testingDeadline ?? null, reward_type: f.reward_type, reward_details: orNull(f.reward_details),
    privacy_requirements: orNull(f.privacy_requirements), beginner_friendly: f.beginner_friendly, instructions: orNull(f.instructions),
    access_instructions: orNull(f.access_instructions), support_contact: orNull(f.support_contact),
  } };
}

export function RoundFields({ value, onChange, errors, releases, releaseLocked }: {
  value: RoundFormState; onChange: (next: RoundFormState) => void; errors: Record<string, string>; releases: Release[]; releaseLocked?: boolean }) {
  const set = <K extends keyof RoundFormState>(k: K) => (v: RoundFormState[K]) => onChange({ ...value, [k]: v });
  const toggleCountry = (code: string) =>
    set('countries')(value.countries.includes(code) ? value.countries.filter((x) => x !== code) : [...value.countries, code]);
  return (
    <View style={{ gap: theme.space.lg }}>
      {releaseLocked
        ? <View><KeyValue k="Release under test" v={releases.find((r) => r.id === value.release_id)?.version ?? '—'} />
            <Muted style={{ fontSize: theme.font.small }}>The release is locked once a round has been published, so results always refer to one exact version.</Muted></View>
        : <Choice label="Release under test" hint="Every round tests one exact release." options={releaseOptions(releases)} value={value.release_id}
            onChange={set('release_id')} error={errors.release_id} testID="round-release" />}
      <Field label="Round title" value={value.title} onChangeText={set('title')} error={errors.title} testID="round-title" />
      <Field label="What testers will be asked to do" hint="Shown on the listing. Plain language works best." value={value.summary} onChangeText={set('summary')}
        error={errors.summary} multiline testID="round-summary" />
      <Field label="Target audience" hint="Optional. Who you most want to hear from." value={value.target_audience} onChangeText={set('target_audience')} testID="round-audience" />
      <Field label="Cohort size" hint="How many testers you want to approve." value={value.cohort_size} onChangeText={set('cohort_size')} keyboardType="numeric"
        error={errors.cohort_size} testID="round-cohort-size" />
      <Field label="Expected time — minimum (minutes)" value={value.minutes_min} onChangeText={set('minutes_min')} keyboardType="numeric"
        error={errors.expected_minutes_min} testID="round-minutes-min" />
      <Field label="Expected time — maximum (minutes)" value={value.minutes_max} onChangeText={set('minutes_max')} keyboardType="numeric"
        error={errors.expected_minutes_max} testID="round-minutes-max" />
      <Choice multi label="Supported devices" options={optionsOf(DEVICES)} value={value.supported_devices} onChange={set('supported_devices')} testID="round-devices" />
      <View style={{ gap: theme.space.sm }}>
        <Text style={{ fontSize: theme.font.body, fontWeight: '600', color: theme.color.ink }}>Countries</Text>
        <Muted style={{ fontSize: theme.font.small }}>
          {value.countries.length ? `${value.countries.length} selected.` : 'None selected — testers from any country can apply.'}
        </Muted>
        <Row wrap>{optionsOf(COUNTRIES).map((o) =>
          <Chip key={o.value} label={o.label} selected={value.countries.includes(o.value)} onPress={() => toggleCountry(o.value)} testID={`round-country-${o.value}`} />)}</Row>
      </View>
      <Field label="Application deadline" hint="Optional. YYYY-MM-DD." placeholder="YYYY-MM-DD" value={value.application_deadline} onChangeText={set('application_deadline')}
        error={errors.application_deadline} autoCapitalize="none" testID="round-application-deadline" />
      <Field label="Testing deadline" hint="Optional. YYYY-MM-DD." placeholder="YYYY-MM-DD" value={value.testing_deadline} onChangeText={set('testing_deadline')}
        error={errors.testing_deadline} autoCapitalize="none" testID="round-testing-deadline" />
      <Choice label="Reward" options={optionsOf(REWARDS)} value={value.reward_type} onChange={set('reward_type')} testID="round-reward-type" />
      <Field label="Reward details" hint="Optional. Say exactly what testers get, even if it is nothing." value={value.reward_details} onChangeText={set('reward_details')}
        multiline testID="round-reward-details" />
      <Field label="Privacy requirements" hint="Optional. For example: use sample data only." value={value.privacy_requirements} onChangeText={set('privacy_requirements')}
        multiline testID="round-privacy" />
      <Check label="Beginner-friendly" hint="No prior testing experience needed." checked={value.beginner_friendly} onChange={set('beginner_friendly')} testID="round-beginner-friendly" />
      <Field label="Instructions for testers" hint="Optional. Shown before testing starts." value={value.instructions} onChangeText={set('instructions')} multiline testID="round-instructions" />
      <Field label="How to access the product" hint="Optional. Shown only to assigned testers." value={value.access_instructions} onChangeText={set('access_instructions')}
        multiline testID="round-access-instructions" />
      <Field label="Support contact" hint="Optional. Where testers can ask for help." value={value.support_contact} onChangeText={set('support_contact')}
        autoCapitalize="none" testID="round-support-contact" />
    </View>
  );
}
