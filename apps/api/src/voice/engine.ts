import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { committedLineIds, normalizeProposalSet, type JobDetailDto, type NormalizeResult, type ProposalSet } from '@formcast/shared';
import { env } from '../env';
import { pickModels, take } from './budget';
import { RESPONSE_SCHEMA, SYSTEM, toRaw } from './prompt';

// Turns the session transcript into the complete set of pending changes.
// The model always returns the whole desired set, never a delta, so corrections
// ("scrap that", "make that 15") are just a different set.

const HEDGE_AFTER_MS = 2500;

let client: GoogleGenAI | undefined;
const ai = () => (client ??= new GoogleGenAI({ apiKey: env.geminiApiKey }));

export interface EngineInput {
  job: Pick<JobDetailDto, 'values' | 'lines'>;
  pending: ProposalSet;
  transcript: string[];
  today: string;
}

export async function proposeChanges(input: EngineInput, signal?: AbortSignal): Promise<NormalizeResult & { ms: number }> {
  const started = Date.now();
  const prompt = JSON.stringify(
    {
      today: input.today,
      committed: { values: input.job.values, lines: input.job.lines },
      pending: input.pending,
      transcript: input.transcript,
    },
    null,
    1,
  );

  const call = (model: string, abortSignal: AbortSignal) => {
    take(model);
    return ai().models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: 'application/json',
        responseJsonSchema: RESPONSE_SCHEMA,
        temperature: 0,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        abortSignal,
      },
    });
  };

  // Hedged request on a second model (own rate limit): latency of the lite models
  // has a long tail, so if the first call is slow, take whichever answers first.
  const [first, second] = pickModels();
  const controllers = [new AbortController(), new AbortController()];
  const abortAll = () => controllers.forEach((c) => c.abort());
  signal?.addEventListener('abort', abortAll, { once: true });

  let hedge: ReturnType<typeof setTimeout> | undefined;
  const res = await Promise.any([
    call(first, controllers[0]!.signal),
    new Promise<Awaited<ReturnType<typeof call>>>((resolve, reject) => {
      if (!second) return reject(new Error('no hedge model available'));
      hedge = setTimeout(() => call(second, controllers[1]!.signal).then(resolve, reject), HEDGE_AFTER_MS);
    }),
  ]).finally(() => {
    clearTimeout(hedge);
    abortAll();
    signal?.removeEventListener('abort', abortAll);
  });

  let output: unknown;
  try {
    output = JSON.parse(res.text ?? '{}');
  } catch {
    return { set: input.pending, dropped: ['model returned invalid JSON'], ms: Date.now() - started };
  }

  const result = normalizeProposalSet(toRaw(output as never), { committedLineIds: committedLineIds(input.job.lines) });
  return { ...result, ms: Date.now() - started };
}
