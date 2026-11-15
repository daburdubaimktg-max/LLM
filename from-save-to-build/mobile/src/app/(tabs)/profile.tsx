import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SignInScreen, go, replace } from '@/components/tester';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { COUNTRIES, DEVICES, date, verdictLabel } from '@/lib/labels';
import { keys, queryClient } from '@/lib/query';
import type { Profile } from '@/lib/types';
import { Badge, Button, Card, Chip, Choice, ErrorNote, Field, H1, H3, Muted, Notice, P, QueryView, Row, Screen, Section, confirm, theme, useAction } from '@/ui';

const DEVICE_OPTIONS = Object.entries(DEVICES).map(([value, label]) => ({ value, label }));

function ProfileForm({ profile }: { profile: Profile }) {
  const [name, setName] = useState(profile.display_name ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [country, setCountry] = useState(profile.country ?? '');
  const [devices, setDevices] = useState<string[]>(profile.devices ?? []);
  const [skills, setSkills] = useState((profile.skills ?? []).join(', '));
  const [nameError, setNameError] = useState('');
  const [saved, setSaved] = useState(false);
  const touch = <V,>(setter: (v: V) => void) => (v: V) => { setSaved(false); setter(v); };
  const save = useAction(async () => {
    setSaved(false);
    if (!name.trim()) { setNameError('Tell us what to call you'); return; }
    setNameError('');
    const updated = await api.updateProfile({ display_name: name.trim(), bio: bio.trim() || null, country: country || null, devices,
      skills: skills.split(',').map((x) => x.trim()).filter(Boolean) });
    queryClient.setQueryData(keys.profile, updated);
    setSaved(true);
  });
  return (
    <View style={{ gap: theme.space.lg }}>
      <Field label="Display name" value={name} onChangeText={touch(setName)} error={nameError || undefined} testID="profile-name" />
      <Field label="About you (optional)" value={bio} onChangeText={touch(setBio)} multiline hint="A sentence or two is plenty." testID="profile-bio" />
      <View style={{ gap: theme.space.sm }}>
        <H3>Country</H3>
        <Muted style={{ fontSize: theme.font.small }}>Some tests are only open to people in certain countries.</Muted>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.sm }}>
          {Object.entries(COUNTRIES).map(([code, label]) => (
            <Chip key={code} label={label} selected={country === code} testID={`country-${code}`} onPress={() => touch(setCountry)(country === code ? '' : code)} />
          ))}
        </ScrollView>
        <Muted style={{ fontSize: theme.font.small }}>{country ? `Selected: ${COUNTRIES[country] ?? country}` : 'Nothing selected'}</Muted>
      </View>
      <Choice multi label="Devices you can test on" options={DEVICE_OPTIONS} value={devices} onChange={touch(setDevices)} testID="profile-devices" />
      <Field label="Skills or interests (optional)" value={skills} onChangeText={touch(setSkills)} hint="Separate with commas, for example: budgeting, design, accessibility"
        autoCapitalize="none" testID="profile-skills" />
      <ErrorNote error={save.error} />
      {saved && <Notice tone="good">Profile saved.</Notice>}
      <Button title="Save profile" testID="save-profile" loading={save.loading} onPress={() => save.run()} />
    </View>
  );
}

function History() {
  const q = useQuery({ queryKey: keys.myTesting, queryFn: () => api.myTesting() });
  return (
    <QueryView query={q}>
      {(items) => {
        const done = items.filter((i) => i.session?.status === 'completed');
        if (done.length === 0) return <Muted>You have not finished a test yet. Tests you complete are listed here.</Muted>;
        return (
          <View style={{ gap: theme.space.md }}>
            <P>{done.length === 1 ? '1 test completed' : `${done.length} tests completed`}</P>
            {done.slice(0, 5).map((i) => (
              <Card key={i.application.id} onPress={() => i.session && go(`/sessions/${i.session.id}/done`)}>
                <H3>{i.product.name}</H3>
                <Muted style={{ fontSize: theme.font.small }}>
                  Version {i.release.version}{i.verdict ? ` · ${verdictLabel(i.verdict.verdict)} · ${date(i.verdict.submitted_at)}` : i.session?.completed_at ? ` · ${date(i.session.completed_at)}` : ''}
                </Muted>
              </Card>
            ))}
            {done.length > 5 && <Button variant="ghost" small title="See all in My tests" onPress={() => go('/(tabs)/tests')} />}
          </View>
        );
      }}
    </QueryView>
  );
}

export default function ProfileScreen() {
  const { userId, ready, signOut } = useAuth();
  const q = useQuery({ queryKey: keys.profile, queryFn: () => api.profile(), enabled: !!userId });
  const out = useAction(async () => { await signOut(); replace('/'); });
  const remove = useAction(async () => {
    if (!(await confirm('Delete your account?', 'Your profile and private application answers will be removed. This cannot be undone.'))) return;
    await api.requestAccountDeletion();
    await signOut();
    replace('/');
  });
  if (ready && !userId) return <SignInScreen title="Profile" message="Sign in to set up your tester profile." />;
  return (
    <Screen title="Profile">
      <Row wrap><H1>Your profile</H1>{q.data?.is_demo && <Badge tone="warn" label="Demonstration profile" />}</Row>
      <Muted>Product teams see this when you apply to test.</Muted>
      <QueryView query={q}>{(profile) => <ProfileForm key={profile.id} profile={profile} />}</QueryView>

      <Section title="Testing history"><History /></Section>

      <Section title="Account">
        <ErrorNote error={out.error} />
        <Button variant="secondary" title="Sign out" testID="sign-out" loading={out.loading} onPress={() => out.run()} />
        <Muted style={{ fontSize: theme.font.small, marginTop: theme.space.md }}>
          Deleting your account removes your profile and your private application answers. Feedback, issue reports and verdicts you already submitted are kept so
          product teams do not lose their results, but your name is taken off them — they stay anonymous.
        </Muted>
        <ErrorNote error={remove.error} />
        <Button variant="danger" title="Delete my account" testID="delete-account" loading={remove.loading} onPress={() => remove.run()} />
      </Section>
    </Screen>
  );
}
