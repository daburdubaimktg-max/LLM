// Supabase Edge Function: POST { round_id } -> { report_id }
// 1. Authorises the caller in the database (request_validation_report checks product ownership).
// 2. Returns immediately, then builds the report in the background with the service role.
// The OpenAI key lives only in this server-side environment (OPENAI_API_KEY). Without it the
// report is produced by the deterministic rule-based engine and labelled as such.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { openAiCall, processReport } from '../_shared/report/run.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { round_id } = await req.json();
    const url = Deno.env.get('SUPABASE_URL')!;
    const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: reportId, error } = await asUser.rpc('request_validation_report', { p_round: round_id });
    if (error) return Response.json({ error: error.message }, { status: 403, headers: cors });

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini';
    const rpc = async (fn: string, args: Record<string, unknown>) => {
      const { data, error } = await admin.rpc(fn, args);
      if (error) throw new Error(error.message);
      return data;
    };
    const job = processReport(rpc, reportId, openAiCall(Deno.env.get('OPENAI_API_KEY'), model), `openai:${model}`);
    // deno-lint-ignore no-explicit-any
    const runtime = (globalThis as any).EdgeRuntime;
    if (runtime?.waitUntil) runtime.waitUntil(job); else await job;
    return Response.json({ report_id: reportId }, { headers: cors });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Unexpected error' }, { status: 400, headers: cors });
  }
});
