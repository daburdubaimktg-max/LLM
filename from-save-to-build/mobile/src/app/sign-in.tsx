import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { isConfigured, isDevGateway } from '@/lib/supabase';
import { Button, ErrorNote, Field, H1, Muted, Notice, Row, Screen, Spacer, useAction } from '@/ui';

const DEMO = [
  { label: 'Demo tester', email: 'tester@demo.fromsavetobuild.test' },
  { label: 'Demo creator', email: 'creator@demo.fromsavetobuild.test' },
  { label: 'Second tester', email: 'tester2@demo.fromsavetobuild.test' },
];

export default function SignIn() {
  const { signIn, signUp } = useAuth();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const done = () => (next ? router.replace(next as never) : router.canGoBack() ? router.back() : router.replace('/'));
  const submit = useAction(async () => {
    if (mode === 'up' && !name.trim()) throw new Error('Tell us what to call you.');
    if (mode === 'in') await signIn(email, password); else await signUp(email, password, name);
    done();
  });
  const demo = useAction(async (demoEmail: string) => { await signIn(demoEmail, 'demo-password-1'); done(); });

  return (
    <Screen title={mode === 'in' ? 'Sign in' : 'Create account'}>
      <H1>{mode === 'in' ? 'Welcome back' : 'Join From Save to Build'}</H1>
      <Muted>{mode === 'in' ? 'Sign in to apply for tests, track your applications or manage your own product.' : 'One account lets you both test products and get your own product tested.'}</Muted>
      {!isConfigured && <Notice tone="warn" title="Backend not configured">Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (see .env.example).</Notice>}
      <Spacer size={4} />
      {mode === 'up' && <Field label="Your name" value={name} onChangeText={setName} testID="name" />}
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" testID="email" />
      <Field label="Password" value={password} onChangeText={setPassword} secure hint={mode === 'up' ? 'At least 8 characters.' : undefined} testID="password" />
      <ErrorNote error={submit.error ?? demo.error} />
      <Button title={mode === 'in' ? 'Sign in' : 'Create account'} onPress={() => submit.run()} loading={submit.loading} testID="submit-auth" />
      <Button variant="ghost" title={mode === 'in' ? 'New here? Create an account' : 'Already have an account? Sign in'} onPress={() => setMode(mode === 'in' ? 'up' : 'in')} />
      {isDevGateway && (
        <Notice tone="neutral" title="Development mode">
          <Muted style={{ fontSize: 14 }}>This build talks to the local development gateway, not a hosted Supabase project. Seeded demo accounts:</Muted>
          <Row wrap>{DEMO.map((d) => <Button key={d.email} small variant="secondary" title={d.label} loading={demo.loading} onPress={() => demo.run(d.email)} testID={`demo-${d.label}`} />)}</Row>
        </Notice>
      )}
    </Screen>
  );
}
