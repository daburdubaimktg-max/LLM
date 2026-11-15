// Report job orchestration, shared by the Supabase Edge Function and the local dev gateway.
// All database work goes through four service-role-only SQL functions, so loading and storing a
// report is transactional and identical in every environment.
import { generateReport, type LlmCall, type RawData } from './engine.ts';

/** Minimal transport: call a Postgres function with named arguments using a privileged connection. */
export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<unknown>;

/** Processes one queued report end-to-end. Never throws: failures are recorded on the report row. */
export async function processReport(rpc: Rpc, reportId: string, llm?: LlmCall, llmName?: string): Promise<void> {
  try {
    const roundId = (await rpc('claim_validation_report', { p_report: reportId })) as string;
    const raw = (await rpc('report_dataset', { p_round: roundId })) as RawData;
    const result = await generateReport(raw, llm, llmName);
    await rpc('store_validation_report', { p_report: reportId, p_result: result });
  } catch (e) {
    try {
      await rpc('fail_validation_report', { p_report: reportId, p_error: e instanceof Error ? e.message : String(e) });
    } catch { /* nothing more we can do */ }
  }
}

/** OpenAI adapter (server-side only). Returns undefined when no key is configured. */
export function openAiCall(apiKey: string | undefined, model: string): LlmCall | undefined {
  if (!apiKey) return undefined;
  return async ({ system, user, schema }) => {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        response_format: { type: 'json_schema', json_schema: { name: 'validation_report', strict: true, schema } },
      }),
    });
    if (!res.ok) throw new Error(`OpenAI responded ${res.status}`);
    const body = await res.json();
    return JSON.parse(body.choices[0].message.content);
  };
}
