import { useQuery } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { AnswersSummary, SignInScreen, countryOptions, go, minutesRange, replace } from '@/components/tester';
import { api, type DraftPatch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { DAYS } from '@/lib/labels';
import { keys, queryClient } from '@/lib/query';
import { availabilitySchema, fieldErrors, validateStep } from '@/lib/schemas';
import type { FormQuestion, RoundDetail } from '@/lib/types';
import { Button, Check, Choice, ErrorNote, Field, H1, H2, Loading, Muted, Notice, P, Progress, QueryView, Row, Screen, theme, useAction } from '@/ui';

type Availability = Required<Pick<DraftPatch, 'available_days' | 'confirm_device_access' | 'confirm_time_commitment' | 'confirm_instructions' | 'accept_terms'
  | 'consent_screenshots' | 'consent_recordings' | 'consent_voice'>>;
// Optional sharing consents always start unchecked.
const blankAvailability: Availability = { available_days: [], confirm_device_access: false, confirm_time_commitment: false, confirm_instructions: false,
  accept_terms: false, consent_screenshots: false, consent_recordings: false, consent_voice: false };

function Question({ q, value, onChange, error, countries }: { q: FormQuestion; value: unknown; onChange: (v: unknown) => void; error?: string; countries: string[] }) {
  const label = q.required ? q.label : `${q.label} (optional)`;
  if (q.type === 'text') return <Field label={label} value={typeof value === 'string' ? value : ''} onChangeText={onChange} multiline error={error} testID={`q-${q.key}`} />;
  if (q.type === 'multi') {
    return <Choice multi label={label} hint="Choose all that apply." options={q.options ?? []} value={Array.isArray(value) ? (value as string[]) : []}
      onChange={onChange} error={error} testID={`q-${q.key}`} />;
  }
  const options = q.type === 'country' ? countryOptions(countries) : q.options ?? [];
  return <Choice label={label} options={options} value={typeof value === 'string' ? value : null} onChange={onChange} error={error} testID={`q-${q.key}`} />;
}

function ApplyForm({ d }: { d: RoundDetail }) {
  const { round } = d;
  const roundId = round.id;
  const existing = d.my_application;
  const formSteps = d.application_form?.steps ?? [];
  const availabilityIndex = formSteps.length;
  const reviewIndex = formSteps.length + 1;
  const total = formSteps.length + 2;
  const minutes = minutesRange(round.expected_minutes_min, round.expected_minutes_max);

  const [appId, setAppId] = useState<string | null>(existing?.id ?? null);
  const [answers, setAnswers] = useState<Record<string, unknown>>(existing?.answers ?? {});
  const [avail, setAvail] = useState<Availability>(existing ? {
    available_days: existing.available_days ?? [], confirm_device_access: !!existing.confirm_device_access, confirm_time_commitment: !!existing.confirm_time_commitment,
    confirm_instructions: !!existing.confirm_instructions, accept_terms: !!existing.accept_terms, consent_screenshots: !!existing.consent_screenshots,
    consent_recordings: !!existing.consent_recordings, consent_voice: !!existing.consent_voice } : blankAvailability);
  const [step, setStep] = useState(() => Math.min(Math.max(existing?.current_step ?? 0, 0), total - 1));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setAnswer = (key: string, v: unknown) => { setAnswers((cur) => ({ ...cur, [key]: v })); setErrors((cur) => ({ ...cur, [key]: '' })); };
  const setA = (patch: Partial<Availability>) => {
    setAvail((cur) => ({ ...cur, ...patch }));
    setErrors((cur) => ({ ...cur, ...Object.fromEntries(Object.keys(patch).map((k) => [k, ''])) }));
  };

  /** Saves the draft (creating it the first time) and returns its id. */
  const persist = async (currentStep: number): Promise<string> => {
    let id = appId;
    if (!id) {
      const created = await api.createDraft(roundId, { answers, current_step: currentStep });
      id = created.id;
      setAppId(id);
    }
    await api.saveDraft(id, { answers, current_step: currentStep, ...avail });
    void queryClient.invalidateQueries({ queryKey: keys.round(roundId) });
    void queryClient.invalidateQueries({ queryKey: keys.myTesting });
    return id;
  };
  const errorsFor = (index: number): Record<string, string> => {
    if (index < formSteps.length) return validateStep(formSteps[index], answers);
    if (index === availabilityIndex) return fieldErrors(availabilitySchema.safeParse(avail));
    return {};
  };

  const next = useAction(async () => {
    const found = errorsFor(step);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    await persist(step + 1);
    setStep(step + 1);
  });
  const back = useAction(async () => {
    setErrors({});
    if (appId) await persist(step - 1);
    setStep(step - 1);
  });
  const saveLater = useAction(async () => {
    await persist(step);
    replace('/(tabs)/tests');
  });
  const submit = useAction(async () => {
    for (let i = 0; i <= availabilityIndex; i++) {
      const found = errorsFor(i);
      if (Object.keys(found).length > 0) { setErrors(found); setStep(i); return; }
    }
    const id = await persist(reviewIndex);
    await api.submitApplication(id);
    replace(`/rounds/${roundId}/application?submitted=1`);
    for (const queryKey of [keys.round(roundId), keys.myTesting, keys.marketplace, keys.notifications]) void queryClient.invalidateQueries({ queryKey });
  });
  const busy = next.loading || back.loading || saveLater.loading || submit.loading;
  const hasErrors = Object.values(errors).some(Boolean);

  const title = step < formSteps.length ? formSteps[step].title : step === availabilityIndex ? 'Availability and consent' : 'Review';
  const footer = (
    <>
      <ErrorNote error={next.error ?? back.error ?? saveLater.error ?? submit.error} />
      {hasErrors && <Muted style={{ fontSize: theme.font.small, color: theme.color.bad }}>Something above still needs an answer.</Muted>}
      <Row>
        {step > 0 && <Button variant="secondary" title="Back" testID="apply-back" style={{ flex: 1 }} loading={back.loading} disabled={busy} onPress={() => back.run()} />}
        {step < reviewIndex
          ? <Button title="Next" testID="apply-next" style={{ flex: 2 }} loading={next.loading} disabled={busy} onPress={() => next.run()} />
          : <Button title="Submit application" testID="submit-application" style={{ flex: 2 }} loading={submit.loading} disabled={busy} onPress={() => submit.run()} />}
      </Row>
      <Button variant="ghost" small title="Save and finish later" testID="save-later" loading={saveLater.loading} disabled={busy} onPress={() => saveLater.run()} />
    </>
  );

  return (
    // The key resets the scroll position each time the step changes.
    <Screen key={step} title="Apply to test" footer={footer}>
      <Progress value={step + 1} total={total} label={`Step ${step + 1} of ${total}`} />
      <Muted style={{ fontSize: theme.font.small }}>{d.product.name}</Muted>
      <H1>{title}</H1>
      {existing?.is_demo && <Notice tone="warn">Demonstration data — these answers were pre-filled for the demo profile</Notice>}
      {existing?.status === 'info_requested' && (
        <Notice tone="warn" title="The team asked for more information">{existing.creator_message ?? 'Update your answers and send the application again.'}</Notice>
      )}

      {step < formSteps.length && (
        <View style={{ gap: theme.space.xl }}>
          {!!formSteps[step].intro && <Muted>{formSteps[step].intro}</Muted>}
          {formSteps[step].questions.map((q) => (
            <Question key={q.key} q={q} value={answers[q.key]} onChange={(v) => setAnswer(q.key, v)} error={errors[q.key] || undefined} countries={round.countries} />
          ))}
        </View>
      )}

      {step === availabilityIndex && (
        <View style={{ gap: theme.space.xl }}>
          <Muted>A few things to confirm so the team knows you can take part.</Muted>
          <Choice multi label="Which days are you usually available?" options={DAYS} value={avail.available_days}
            onChange={(available_days: string[]) => setA({ available_days })} error={errors.available_days || undefined} testID="available-days" />
          <View style={{ gap: theme.space.md }}>
            <Check label="I have access to a supported device" checked={avail.confirm_device_access} onChange={(v) => setA({ confirm_device_access: v })}
              error={errors.confirm_device_access || undefined} testID="confirm-device" />
            <Check label={`I can spare about ${minutes}`} checked={avail.confirm_time_commitment} onChange={(v) => setA({ confirm_time_commitment: v })}
              error={errors.confirm_time_commitment || undefined} testID="confirm-time" />
          </View>
          <View style={{ gap: theme.space.md }}>
            <H2>What testing involves</H2>
            <P>{round.summary}</P>
            <Check label="I understand what testing involves" checked={avail.confirm_instructions} onChange={(v) => setA({ confirm_instructions: v })}
              error={errors.confirm_instructions || undefined} testID="confirm-instructions" />
          </View>
          <View style={{ gap: theme.space.md }}>
            <H2>Privacy and participation</H2>
            <P>{round.privacy_requirements || 'The team has not listed any special privacy requirements.'}</P>
            <Check label="I accept the privacy and participation terms" checked={avail.accept_terms} onChange={(v) => setA({ accept_terms: v })}
              error={errors.accept_terms || undefined} testID="accept-terms" />
          </View>
          <View style={{ gap: theme.space.md, backgroundColor: theme.color.soft, borderRadius: theme.radius.lg, padding: theme.space.lg }}>
            <H2>Optional — you can say no to all of these</H2>
            <Muted style={{ fontSize: theme.font.small }}>
              Sometimes a picture or a recording helps the team understand a problem. Saying no does not affect your application, and you can change your mind before you start testing.
            </Muted>
            <Check label="I'm happy to share screenshots" checked={avail.consent_screenshots} onChange={(v) => setA({ consent_screenshots: v })} testID="consent-screenshots" />
            <Check label="I'm happy to share screen recordings" checked={avail.consent_recordings} onChange={(v) => setA({ consent_recordings: v })} testID="consent-recordings" />
            <Check label="I'm happy to share voice notes" checked={avail.consent_voice} onChange={(v) => setA({ consent_voice: v })} testID="consent-voice" />
          </View>
        </View>
      )}

      {step === reviewIndex && (
        <View style={{ gap: theme.space.xl }}>
          <Muted>Have a last look. You can change anything before you send it.</Muted>
          <AnswersSummary form={{ steps: formSteps }} answers={answers} availability={avail} minutes={minutes} onEdit={(i) => { setErrors({}); setStep(i); }} />
        </View>
      )}
    </Screen>
  );
}

export default function Apply() {
  const { roundId } = useLocalSearchParams<{ roundId: string }>();
  const { userId, ready } = useAuth();
  const formOpen = useRef(false);
  const q = useQuery({ queryKey: keys.round(roundId), queryFn: () => api.roundDetail(roundId), enabled: !!userId });
  if (!ready) return <Screen title="Apply to test"><Loading /></Screen>;
  if (!userId) return <SignInScreen title="Apply to test" message="Sign in or create a free account to apply. It takes a minute." next={`/rounds/${roundId}/apply`} />;
  // Wait for a fresh copy so a draft saved a moment ago is never missed.
  if (!q.data || !q.isFetchedAfterMount) return <Screen title="Apply to test"><QueryView query={q}>{() => <Loading />}</QueryView></Screen>;
  const d = q.data;
  if (d.is_creator) {
    return (
      <Screen title="Apply to test">
        <Notice title="This is your own round">You cannot apply to test your own product.</Notice>
        <Button title="Manage this round" onPress={() => go(`/creator/rounds/${roundId}`)} />
      </Screen>
    );
  }
  const app = d.my_application;
  // Only redirect on arrival: once the form is open, a background refresh must not pull the tester away mid-submit.
  if (!formOpen.current && app && app.status !== 'draft' && app.status !== 'info_requested') return <Redirect href={`/rounds/${roundId}/application` as never} />;
  if (!app && d.round.status !== 'published') {
    return (
      <Screen title="Apply to test">
        <Notice tone="warn" title="Applications are closed">This testing round is no longer taking applications.</Notice>
        <Button variant="secondary" title="Find another test" onPress={() => replace('/')} />
      </Screen>
    );
  }
  formOpen.current = true;
  return <ApplyForm d={d} />;
}
