// =============================================================================
// DEVELOPMENT-ONLY BACKEND GATEWAY — not Supabase, not for production.
//
// Lets the app run end-to-end on a laptop/CI box with nothing but PostgreSQL. It speaks just
// enough of the Supabase HTTP surface for supabase-js:
//   /auth/v1      email+password sign-up / sign-in / refresh (users live in the shim auth.users)
//   /rest/v1      rpc/<fn> plus single-table select/insert/update/delete with eq / in / is filters
//   /storage/v1   private uploads + short-lived signed URLs (files on local disk)
//   /functions/v1 generate-validation-report (same shared code as the Edge Function)
// Every database statement runs with the caller's role and JWT claims, so the REAL migrations,
// RLS policies and workflow functions decide what is allowed — nothing is stubbed.
// Not supported (use a real Supabase project): OAuth, email confirmation, realtime, embedded
// selects, the full PostgREST filter grammar.
// =============================================================================
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { openAiCall, processReport } from '../supabase/functions/_shared/report/run.ts';

const PORT = Number(process.env.PORT ?? 54321);
const SECRET = process.env.FSTB_JWT_SECRET ?? 'dev-only-jwt-secret-do-not-use-in-production-0001';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://fstb_admin:dev@127.0.0.1:5432/fstb_dev';
const FILES = resolve(dirname(fileURLToPath(import.meta.url)), '.data/storage');
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 10 });

// ---------------------------------------------------------------- JWT (HS256)
const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
function sign(payload: Record<string, unknown>, ttlSeconds: number) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64(JSON.stringify({ iat: now, exp: now + ttlSeconds, ...payload }))}`;
  return `${body}.${createHmac('sha256', SECRET).update(body).digest('base64url')}`;
}
function verify(token: string | undefined): Record<string, any> | null {
  if (!token) return null;
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;
  const expected = createHmac('sha256', SECRET).update(`${h}.${p}`).digest();
  const given = Buffer.from(s, 'base64url');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  return payload.exp && payload.exp < Date.now() / 1000 ? null : payload;
}
export const ANON_KEY = sign({ role: 'anon', iss: 'fstb-dev', iat: 1700000000, exp: 2100000000 }, 0);   // stable across restarts

// ---------------------------------------------------------------- db access as the caller
type Claims = { sub?: string; role: 'anon' | 'authenticated' | 'service_role' };
class HttpError extends Error { constructor(public status: number, message: string, public code = 'DEV') { super(message); } }

async function asCaller<T>(claims: Claims, fn: (q: (sql: string, params?: unknown[]) => Promise<any[]>) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select set_config('request.jwt.claims', $1, true), set_config('role', $2, true)`, [JSON.stringify(claims), claims.role]);
    const out = await fn(async (sql, params) => (await client.query(sql, params as any[])).rows);
    await client.query('commit');
    return out;
  } catch (e: any) {
    await client.query('rollback').catch(() => {});
    if (e instanceof HttpError) throw e;
    const status = e.code === '42501' ? 403 : e.code === '28000' ? 401 : e.code === '23505' ? 409 : 400;
    throw new HttpError(status, e.message, e.code);
  } finally { client.release(); }
}
const callerOf = (req: IncomingMessage): Claims => {
  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const claims = verify(token);
  if (claims?.role === 'authenticated' && claims.sub) return { sub: claims.sub, role: 'authenticated' };
  return { role: 'anon' };
};
const ident = (s: string) => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new HttpError(400, `Invalid identifier: ${s}`); return `"${s}"`; };
const enc = (v: unknown) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v);

// ---------------------------------------------------------------- http helpers
const CORS = {
  'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'access-control-allow-headers': 'authorization,apikey,content-type,prefer,accept,accept-profile,content-profile,x-client-info,x-upsert,cache-control,x-supabase-api-version',
  'access-control-expose-headers': 'content-range',
};
const send = (res: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}) => {
  const payload = body === undefined ? '' : Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { ...CORS, ...(Buffer.isBuffer(body) ? {} : { 'content-type': 'application/json' }), ...headers });
  res.end(payload);
};
const readBody = (req: IncomingMessage) => new Promise<Buffer>((ok, fail) => {
  const chunks: Buffer[] = []; let size = 0;
  req.on('data', (c) => { size += c.length; if (size > 60 * 1024 * 1024) { fail(new HttpError(413, 'File too large')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => ok(Buffer.concat(chunks))); req.on('error', fail);
});
const json = async (req: IncomingMessage) => { const b = await readBody(req); return b.length ? JSON.parse(b.toString()) : {}; };

// ---------------------------------------------------------------- auth
const userJson = (u: any) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: u.created_at,
  app_metadata: { provider: 'email' }, user_metadata: u.raw_user_meta_data ?? {}, created_at: u.created_at });
const session = (u: any) => {
  const expires_in = 3600;
  return { access_token: sign({ sub: u.id, role: 'authenticated', aud: 'authenticated', email: u.email }, expires_in), token_type: 'bearer',
    expires_in, expires_at: Math.floor(Date.now() / 1000) + expires_in, refresh_token: sign({ sub: u.id, typ: 'refresh' }, 30 * 86400), user: userJson(u) };
};
async function auth(req: IncomingMessage, res: ServerResponse, path: string, url: URL) {
  if (path === '/signup' && req.method === 'POST') {
    const { email, password, data } = await json(req);
    if (!email || !password || String(password).length < 8) throw new HttpError(422, 'Enter an email and a password of at least 8 characters');
    const exists = await pool.query('select 1 from auth.users where email = $1', [String(email).toLowerCase()]);
    if (exists.rowCount) throw new HttpError(422, 'User already registered');
    const { rows } = await pool.query(`insert into auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
      values ($1, crypt($2, gen_salt('bf')), now(), $3) returning *`, [String(email).toLowerCase(), password, JSON.stringify(data ?? {})]);
    return send(res, 200, session(rows[0]));
  }
  if (path === '/token' && req.method === 'POST') {
    const body = await json(req);
    if (url.searchParams.get('grant_type') === 'refresh_token') {
      const claims = verify(body.refresh_token);
      const { rows } = await pool.query('select * from auth.users where id = $1', [claims?.typ === 'refresh' ? claims.sub : null]);
      if (!rows[0]) throw new HttpError(400, 'Invalid Refresh Token');
      return send(res, 200, session(rows[0]));
    }
    const { rows } = await pool.query(`select * from auth.users where email = $1 and encrypted_password = crypt($2, encrypted_password)`,
      [String(body.email ?? '').toLowerCase(), String(body.password ?? '')]);
    if (!rows[0]) throw new HttpError(400, 'Invalid login credentials');
    return send(res, 200, session(rows[0]));
  }
  if (path === '/user' && req.method === 'GET') {
    const c = callerOf(req);
    const { rows } = await pool.query('select * from auth.users where id = $1', [c.sub ?? null]);
    if (!rows[0]) throw new HttpError(401, 'Not signed in');
    return send(res, 200, userJson(rows[0]));
  }
  if (path === '/logout') return send(res, 204);
  throw new HttpError(404, 'Auth route not supported by the dev gateway');
}

// ---------------------------------------------------------------- rest (rpc + single-table subset)
function filters(url: URL, params: unknown[]) {
  const where: string[] = [];
  for (const [key, raw] of url.searchParams) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(key)) continue;
    const [op, ...rest] = raw.split('.'); const value = rest.join('.');
    if (op === 'eq') { params.push(value); where.push(`${ident(key)}::text = $${params.length}`); }
    else if (op === 'neq') { params.push(value); where.push(`${ident(key)}::text <> $${params.length}`); }
    else if (op === 'in') { params.push(value.replace(/^\(|\)$/g, '').split(',').map((v) => v.replace(/^"|"$/g, ''))); where.push(`${ident(key)}::text = any($${params.length}::text[])`); }
    else if (op === 'is' && value === 'null') where.push(`${ident(key)} is null`);
    else if (op === 'not' && value === 'is.null') where.push(`${ident(key)} is not null`);
    else throw new HttpError(400, `Filter "${key}=${raw}" is not supported by the dev gateway`);
  }
  return where.length ? ` where ${where.join(' and ')}` : '';
}
async function rest(req: IncomingMessage, res: ServerResponse, path: string, url: URL) {
  const claims = callerOf(req);
  if (path.startsWith('/rpc/')) {
    const fn = ident(path.slice(5)); const args = req.method === 'POST' ? await json(req) : {};
    const keys = Object.keys(args);
    const rows = await asCaller(claims, (q) => q(`select public.${fn}(${keys.map((k, i) => `${ident(k)} => $${i + 1}`).join(', ')}) as result`, keys.map((k) => enc(args[k]))));
    return send(res, 200, rows[0]?.result ?? null);
  }
  const table = `public.${ident(path.slice(1))}`;
  const single = String(req.headers.accept ?? '').includes('vnd.pgrst.object');
  const wantRows = req.method === 'GET' || String(req.headers.prefer ?? '').includes('return=representation');
  const params: unknown[] = [];
  let sql: string;
  if (req.method === 'GET') {
    const where = filters(url, params);
    const order = (url.searchParams.get('order') ?? '').split(',').filter(Boolean)
      .map((o) => { const [c, d] = o.split('.'); return `${ident(c)} ${d === 'desc' ? 'desc' : 'asc'}`; }).join(', ');
    const limit = Number(url.searchParams.get('limit') ?? 0);
    sql = `select * from ${table}${where}${order ? ` order by ${order}` : ''}${limit ? ` limit ${limit}` : ''}`;
  } else if (req.method === 'POST') {
    const body = await json(req); const list = Array.isArray(body) ? body : [body];
    const cols = [...new Set(list.flatMap((r) => Object.keys(r)))].map(ident).join(', ');
    params.push(JSON.stringify(list));
    sql = `insert into ${table} (${cols}) select ${cols} from jsonb_populate_recordset(null::${table}, $1::jsonb) returning *`;
  } else if (req.method === 'PATCH') {
    const body = await json(req); const cols = Object.keys(body).map(ident).join(', ');
    params.push(JSON.stringify(body));
    const where = filters(url, params);
    if (!where) throw new HttpError(400, 'Refusing to update without a filter');
    sql = `update ${table} set (${cols}) = (select ${cols} from jsonb_populate_record(null::${table}, $1::jsonb))${where} returning *`;
  } else if (req.method === 'DELETE') {
    const where = filters(url, params);
    if (!where) throw new HttpError(400, 'Refusing to delete without a filter');
    sql = `delete from ${table}${where} returning *`;
  } else throw new HttpError(405, 'Method not supported');
  const rows = await asCaller(claims, (q) => q(sql, params));
  if (!wantRows) return send(res, req.method === 'POST' ? 201 : 204);
  if (single) {
    if (rows.length !== 1) return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `${rows.length} rows` });
    return send(res, 200, rows[0]);
  }
  return send(res, req.method === 'POST' ? 201 : 200, rows);
}

// ---------------------------------------------------------------- storage (private, signed URLs)
async function storage(req: IncomingMessage, res: ServerResponse, path: string, url: URL) {
  const claims = callerOf(req);
  const m = path.match(/^\/object\/(sign\/)?([a-z0-9-]+)\/(.+)$/);
  if (!m) throw new HttpError(404, 'Storage route not supported by the dev gateway');
  const [, signing, bucket, rawName] = m; const name = decodeURIComponent(rawName);
  if (name.includes('..')) throw new HttpError(400, 'Invalid path');
  const file = join(FILES, bucket, name);
  if (signing && req.method === 'POST') {
    const { expiresIn } = await json(req);
    const rows = await asCaller(claims, (q) => q('select 1 from storage.objects where bucket_id = $1 and name = $2', [bucket, name]));
    if (!rows.length) throw new HttpError(404, 'Object not found');
    const token = sign({ typ: 'storage', bucket, name }, Math.min(Number(expiresIn) || 60, 3600));
    return send(res, 200, { signedURL: `/object/sign/${bucket}/${encodeURI(name)}?token=${token}` });
  }
  if (signing && req.method === 'GET') {
    const claim = verify(url.searchParams.get('token') ?? undefined);
    if (!claim || claim.typ !== 'storage' || claim.bucket !== bucket || claim.name !== name) throw new HttpError(403, 'Signed URL is invalid or has expired');
    const meta = await pool.query('select metadata from storage.objects where bucket_id = $1 and name = $2', [bucket, name]);
    return send(res, 200, await readFile(file), { 'content-type': meta.rows[0]?.metadata?.mimetype ?? 'application/octet-stream' });
  }
  if (!signing && req.method === 'POST') {
    const body = await readBody(req);
    let bytes = body; let type = String(req.headers['content-type'] ?? 'application/octet-stream');
    if (type.startsWith('multipart/form-data')) {
      const form = await new Request('http://local', { method: 'POST', headers: { 'content-type': type }, body }).formData();
      const part = [...form.values()].find((v): v is File => typeof v !== 'string');
      if (!part) throw new HttpError(400, 'No file in upload');
      bytes = Buffer.from(await part.arrayBuffer()); type = part.type || 'application/octet-stream';
    }
    await asCaller(claims, (q) => q(`insert into storage.objects (bucket_id, name, owner, metadata) values ($1, $2, $3, $4)`,
      [bucket, name, claims.sub ?? null, JSON.stringify({ mimetype: type, size: bytes.length })]));   // RLS decides
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, bytes);
    return send(res, 200, { Key: `${bucket}/${name}`, Id: randomUUID() });
  }
  throw new HttpError(405, 'Storage method not supported by the dev gateway');
}

// ---------------------------------------------------------------- functions
async function functions(req: IncomingMessage, res: ServerResponse, path: string) {
  if (path !== '/generate-validation-report' || req.method !== 'POST') throw new HttpError(404, 'Function not found');
  const { round_id } = await json(req);
  const rows = await asCaller(callerOf(req), (q) => q('select public.request_validation_report(p_round => $1) as id', [round_id]));
  const serviceRpc = async (fn: string, args: Record<string, unknown>) => {
    const keys = Object.keys(args);
    const out = await asCaller({ role: 'service_role' }, (q) => q(`select public.${ident(fn)}(${keys.map((k, i) => `${ident(k)} => $${i + 1}`).join(', ')}) as result`, keys.map((k) => enc(args[k]))));
    return out[0]?.result;
  };
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  void processReport(serviceRpc, rows[0].id, openAiCall(process.env.OPENAI_API_KEY, model), `openai:${model}`);   // background
  return send(res, 200, { report_id: rows[0].id });
}

// ---------------------------------------------------------------- server
createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return send(res, 204);
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const p = url.pathname;
    if (p === '/health') return send(res, 200, { ok: true, mode: 'development gateway' });
    if (p.startsWith('/auth/v1')) return await auth(req, res, p.slice(8), url);
    if (p.startsWith('/rest/v1')) return await rest(req, res, p.slice(8), url);
    if (p.startsWith('/storage/v1')) return await storage(req, res, p.slice(11), url);
    if (p.startsWith('/functions/v1')) return await functions(req, res, p.slice(13));
    throw new HttpError(404, 'Not found');
  } catch (e: any) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(e);
    send(res, status, { message: e.message ?? 'Unexpected error', code: e.code ?? 'DEV', error_description: e.message, msg: e.message });
  }
}).listen(PORT, () => {
  console.log(`[dev gateway] http://localhost:${PORT}  (development substitute for Supabase — see dev/gateway.ts)`);
  console.log(`[dev gateway] EXPO_PUBLIC_SUPABASE_URL=http://localhost:${PORT}`);
  console.log(`[dev gateway] EXPO_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}`);
  console.log(`[dev gateway] AI reports: ${process.env.OPENAI_API_KEY ? 'OpenAI connected' : 'no OPENAI_API_KEY — rule-based engine, labelled as such'}`);
});
