// Test harness: talks to PostgreSQL exactly the way PostgREST/Supabase does — every statement
// runs inside a transaction with `role` switched to anon/authenticated/service_role and the JWT
// claims set, so Row Level Security and the RPC authorisation checks are exercised for real.
import pg from 'pg';

export const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://fstb_admin:dev@127.0.0.1:5432/fstb_test';
export const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 6 });

export const DEMO = {
  creator: '00000000-0000-4000-a000-000000000001',
  tester: '00000000-0000-4000-a000-000000000002',
  tester2: '00000000-0000-4000-a000-000000000003',
  pocketRound: '12000000-0000-4000-a000-000000000001',
  pocketProduct: '10000000-0000-4000-a000-000000000001',
  pocketRelease: '11000000-0000-4000-a000-000000000001',
};

export type Actor = { id: string | null; role: 'anon' | 'authenticated' | 'service_role' };
export const user = (id: string): Actor => ({ id, role: 'authenticated' });
export const anon: Actor = { id: null, role: 'anon' };
export const service: Actor = { id: null, role: 'service_role' };

export async function as<T>(actor: Actor, fn: (q: (sql: string, params?: unknown[]) => Promise<any[]>) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select set_config('request.jwt.claims', $1, true), set_config('role', $2, true)`,
      [JSON.stringify({ sub: actor.id ?? undefined, role: actor.role }), actor.role]);
    const out = await fn(async (sql, params) => (await client.query(sql, params as any[])).rows);
    await client.query('commit');
    return out;
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}

const enc = (v: unknown) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v);

/** Calls a Postgres function with named arguments, like supabase.rpc(). */
export async function rpc<T = any>(actor: Actor, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const keys = Object.keys(args);
  const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as result`;
  const rows = await as(actor, (q) => q(sql, keys.map((k) => enc(args[k]))));
  return rows[0]?.result as T;
}
export const query = (actor: Actor, sql: string, params?: unknown[]) => as(actor, (q) => q(sql, params));
export const admin = (sql: string, params?: unknown[]) => pool.query(sql, params as any[]).then((r) => r.rows);

export async function createUser(name: string): Promise<string> {
  const [row] = await admin(
    `insert into auth.users (email, encrypted_password, raw_user_meta_data)
     values ($1, crypt('pw', gen_salt('bf', 4)), jsonb_build_object('display_name', $2::text)) returning id`,
    [`${name.toLowerCase().replace(/\W+/g, '.')}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@test.local`, name]);
  return row.id;
}

/** A fully answered Pocket Budget application, ready to submit. */
export const completeAnswers = {
  experience_level: 'beginner', used_budget_apps: 'no', tracking_frequency: 'check_occasionally', current_method: 'banking_app',
  device: 'iphone', country: 'AE', motivation: 'I want to understand where my money goes.',
  desired_help: ['easy_expense_tracking'], preferred_experience: 'simple_effortless',
};
export const step4 = `available_days = array['sat','sun'], confirm_device_access = true, confirm_time_commitment = true,
  confirm_instructions = true, accept_terms = true`;

export async function submittedApplication(testerId: string, roundId: string, answers: Record<string, unknown> = completeAnswers) {
  const [app] = await query(user(testerId), `insert into tester_applications (round_id, tester_id, answers) values ($1, $2, $3) returning id`,
    [roundId, testerId, JSON.stringify(answers)]);
  await query(user(testerId), `update tester_applications set ${step4} where id = $1`, [app.id]);
  await rpc(user(testerId), 'submit_application', { p_application: app.id });
  return app.id as string;
}
