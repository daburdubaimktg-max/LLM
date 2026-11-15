import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { queryClient } from './query';
import { supabase } from './supabase';

interface AuthState { session: Session | null; userId: string | null; ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void> }
const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  const value: AuthState = {
    session, userId: session?.user.id ?? null, ready,
    signIn: async (email, password) => { const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password }); if (error) throw new Error(error.message); },
    signUp: async (email, password, displayName) => {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { display_name: displayName.trim() } } });
      if (error) throw new Error(error.message);
      if (!data.session) throw new Error('Check your inbox to confirm your email, then sign in.');
    },
    signOut: async () => { await supabase.auth.signOut(); queryClient.clear(); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useAuth() { const v = useContext(Ctx); if (!v) throw new Error('AuthProvider missing'); return v; }
