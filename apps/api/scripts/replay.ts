// Replays the brief's demo script through the proposal engine, one utterance at
// a time, and checks the expected result after each step. Needs GEMINI_API_KEY.
//   pnpm --filter @formcast/api replay
import { EMPTY_PROPOSALS, type FieldValue, type ProposalSet } from '@formcast/shared';
import { proposeChanges } from '../src/voice/engine';

type Check = (s: ProposalSet) => string | null;

const field = (s: ProposalSet, key: string) => s.fieldOps.find((o) => o.fieldKey === key);
const expectField = (key: string, value: FieldValue | undefined): Check => (s) => {
  const op = field(s, key);
  const got = op?.op === 'set' ? op.value : undefined;
  return JSON.stringify(got) === JSON.stringify(value) ? null : `${key}: expected ${JSON.stringify(value)}, got ${JSON.stringify(got)}`;
};

const expectLines = (expected: Record<string, number>): Check => (s) => {
  const got = Object.fromEntries(s.lineOps.filter((l) => l.op === 'create').map((l) => [String(l.values?.material).toLowerCase(), l.values?.quantity]));
  return JSON.stringify(got) === JSON.stringify(expected) ? null : `lines: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`;
};

const round1: [string, Check[]][] = [
  ['I arrived at 11am', [expectField('arrivalTime', '11:00')]],
  ['No scrap that', [expectField('arrivalTime', undefined)]],
  ['It was 10am', [expectField('arrivalTime', '10:00')]],
  ['Used twelve meters of cable and forty screws', [expectLines({ cable: 12, screws: 40 })]],
  ['Actually make the cable fifteen meters', [expectLines({ cable: 15, screws: 40 })]],
  ['Forget the screws', [expectLines({ cable: 15 }), expectField('arrivalTime', '10:00')]],
];

const round2: [string, Check[]][] = [
  ['Set priority to high', [expectField('priority', 'high')]],
  ['Tag this as warranty and follow-up', [expectField('tags', ['warranty', 'follow-up'])]],
  ['Remove the follow-up tag', [expectField('tags', ['warranty']), expectField('priority', 'high')]],
];

async function run(name: string, steps: [string, Check[]][], job: { values: Record<string, FieldValue>; lines: never[] }) {
  let pending: ProposalSet = EMPTY_PROPOSALS;
  const transcript: string[] = [];
  let failures = 0;

  console.log(`\n${name}`);
  for (const [utterance, checks] of steps) {
    transcript.push(utterance);
    const { set, dropped, ms } = await proposeChanges({ job, pending, transcript, today: '2026-10-14' });
    pending = set;

    const errors = checks.map((c) => c(set)).filter(Boolean);
    failures += errors.length;
    console.log(`${errors.length ? '✗' : '✓'} ${ms.toString().padStart(5)} ms  "${utterance}"${errors.length ? `\n    ${errors.join('\n    ')}` : ''}${dropped.length ? `\n    dropped: ${dropped.join('; ')}` : ''}`);
  }

  return failures;
}

const failures =
  (await run('Round 1', round1, { values: { priority: 'medium', tags: [] }, lines: [] })) +
  (await run('Round 2 (after save)', round2, { values: { priority: 'medium', tags: [], arrivalTime: '10:00' }, lines: [] }));

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
