import { env } from '../env';

// Free-tier Gemini keys allow 15 requests per minute per model. Track calls per
// model and spread the load so a session never hits a 429.
const PER_MINUTE = 14;
const calls = new Map<string, number[]>();

function used(model: string) {
  const now = Date.now();
  const recent = (calls.get(model) ?? []).filter((t) => now - t < 60_000);
  calls.set(model, recent);
  return recent.length;
}

export const take = (model: string) => calls.get(model)?.push(Date.now()) ?? calls.set(model, [Date.now()]);

/** Primary model first, the fallback as hedge; skip a model that is out of budget. */
export function pickModels(): [string, string | undefined] {
  const available = [env.geminiModel, env.geminiFallbackModel].filter((m) => m && used(m) < PER_MINUTE);
  if (!available.length) throw new Error('Gemini rate limit reached');

  return [available[0]!, available[1]];
}
