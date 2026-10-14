import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import {
  FIELDS,
  FIELD_BY_KEY,
  LINE_GROUPS,
  normalizeProposalSet,
  type JobDetailDto,
  type NormalizeResult,
  type ProposalSet,
} from '@formcast/shared';
import { env } from '../env';

// Turns the session transcript into the complete set of pending changes.
// The model always returns the whole desired set, never a delta, so corrections
// ("scrap that", "make that 15") are just a different set.

const HEDGE_AFTER_MS = 2500;
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
const take = (model: string) => calls.get(model)?.push(Date.now()) ?? calls.set(model, [Date.now()]);

/** Primary model first, the fallback as hedge; skip a model that is out of budget. */
function pickModels(): [string, string | undefined] {
  const available = [env.geminiModel, env.geminiFallbackModel].filter((m) => m && used(m) < PER_MINUTE);
  if (!available.length) throw new Error('Gemini rate limit reached');
  return [available[0]!, available[1]];
}

let client: GoogleGenAI | undefined;
const ai = () => (client ??= new GoogleGenAI({ apiKey: env.geminiApiKey }));

const fieldList = FIELDS.map((f) => {
  const opts = f.options ? ` One of: ${f.options.map((o) => o.value).join(', ')}.` : '';
  return `- ${f.key} (${f.type}${f.unit ? `, ${f.unit}` : ''}): ${f.label}. ${f.hint}${opts}`;
}).join('\n');

const groupList = LINE_GROUPS.map(
  (g) => `- ${g.key}: ${g.label}. ${g.hint} Columns: ${g.columns
    .map((c) => `${c.key} (${c.type}${c.options ? `: ${c.options.map((o) => o.value).join('/')}` : ''})`)
    .join(', ')}.`,
).join('\n');

const SYSTEM = `You fill in a boiler maintenance job report from what a field technician says out loud.

You get: today's date, the committed form (saved in the database), the pending changes from earlier, and the transcript of what the technician has said in this session, in order.

Return the COMPLETE set of pending changes that should exist after everything the technician said. Not a delta.

Fields:
${fieldList}

Line groups (repeating rows):
${groupList}

Rules:
- Only propose what the technician actually said. Never invent values.
- Keep pending changes from earlier unless the transcript changes or cancels them.
- Corrections overrule earlier statements: "no scrap that", "forget it", "never mind" remove the change they refer to; "actually it was X", "make that X" replace it.
- Field ops: {op:"set", fieldKey, value} or {op:"clear", fieldKey} to empty a committed value. Do not repeat a value that is already committed unchanged.
- Times as 24h "HH:MM" ("11am" -> "11:00", "half past ten" -> "10:30"). Dates as "YYYY-MM-DD", resolve relative dates against today.
- Numbers as plain numbers in the field's unit, as a string ("42", "12.5").
- Booleans as "true" or "false".
- Multiselect (tags): put the complete resulting list in "values", starting from the committed list. "Remove the follow-up tag" -> the list without it.
- Remarks: value is the complete new text, merging the committed remarks with what was added.
- Lines: {op:"create", groupKey, lineId, values} for a new row. Reuse the lineId of a pending create when it is the same item; a new item gets "tmp_<n>" with n higher than any pending tmp id. Change an item with a new create of the same lineId and updated values.
- To change a committed row use {op:"update", lineId:<its id>, values:<changed columns>}; to remove one use {op:"delete", lineId:<its id>}.
- Dropping a pending create ("forget the screws") means leaving it out of the result.
- "Used twelve meters of cable and forty screws" is two rows: cable 12 m and screws 40 pcs. Counted items use unit "pcs".
- If nothing relevant was said, return the pending changes unchanged.`;

// Kept flat and string-typed: easy for the model, normalized afterwards.
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    fieldOps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['set', 'clear'] },
          fieldKey: { type: 'string', enum: FIELDS.map((f) => f.key) },
          value: { type: 'string' },
          values: { type: 'array', items: { type: 'string' } },
        },
        required: ['op', 'fieldKey'],
      },
    },
    lineOps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          op: { type: 'string', enum: ['create', 'update', 'delete'] },
          groupKey: { type: 'string', enum: LINE_GROUPS.map((g) => g.key) },
          lineId: { type: 'string' },
          values: {
            type: 'object',
            properties: { material: { type: 'string' }, quantity: { type: 'string' }, unit: { type: 'string' } },
          },
        },
        required: ['op', 'groupKey', 'lineId'],
      },
    },
  },
  required: ['fieldOps', 'lineOps'],
};

export interface EngineInput {
  job: Pick<JobDetailDto, 'values' | 'lines'>;
  pending: ProposalSet;
  transcript: string[];
  today: string;
}

/** Model output -> loose op shape: multiselect values move into `value`. */
function toRaw(output: { fieldOps?: unknown[]; lineOps?: unknown[] }) {
  return {
    fieldOps: (output.fieldOps ?? []).map((o) => {
      const op = o as { op: string; fieldKey: string; value?: string; values?: string[] };
      const def = FIELD_BY_KEY.get(op.fieldKey);
      return { op: op.op, fieldKey: op.fieldKey, value: def?.type === 'multiselect' ? op.values ?? [] : op.value };
    }),
    lineOps: output.lineOps ?? [],
  };
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
  const result = normalizeProposalSet(toRaw(output as never), { committedLineIds: new Set(input.job.lines.map((l) => l.id)) });
  return { ...result, ms: Date.now() - started };
}
