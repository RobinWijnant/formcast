// End-to-end check of the voice pipeline without a phone: speaks the demo script
// with macOS `say`, streams it as 16 kHz PCM over the session WebSocket in real
// time, then commits and checks the database result.
//   API_URL=http://localhost:8787 pnpm --filter @formcast/api e2e:voice
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { JobDetailDto, JobSummaryDto, ProposalSet, ServerMessage } from '@formcast/shared';
import { env } from '../src/env';
import { DEMO_USER } from './demo-user';

const API = process.env.API_URL ?? 'http://localhost:8787';
const dir = mkdtempSync(join(tmpdir(), 'formcast-'));
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s`, ...a);

function speech(text: string): Buffer {
  const file = join(dir, `${Buffer.from(text).toString('hex').slice(0, 24)}.wav`);
  execFileSync('say', ['-v', 'Samantha', '-r', '170', '-o', file, '--file-format=WAVE', '--data-format=LEI16@16000', text]);
  const wav = readFileSync(file);
  const data = wav.indexOf('data');
  return wav.subarray(data + 8);
}

const silence = (ms: number) => Buffer.alloc((16000 * 2 * ms) / 1000);

async function api<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}/v1${path}`, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function session(jobId: string, token: string, pending: ProposalSet, utterances: string[]): Promise<ProposalSet> {
  const ws = new WebSocket(`${API.replace(/^http/, 'ws')}/v1/jobs/${jobId}/session?token=${token}`);
  let set: ProposalSet = pending;

  const done = new Promise<void>((resolve, reject) => {
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(String(e.data)) as ServerMessage;
      if (msg.type === 'proposals') {
        set = msg.set;
        const fields = msg.set.fieldOps.map((o) => `${o.fieldKey}=${JSON.stringify(o.value ?? null)}`);
        const lines = msg.set.lineOps.map((l) => `${l.values?.material} ${l.values?.quantity}${l.values?.unit ?? ''}`);
        log(`proposals #${msg.seq}: ${[...fields, ...lines].join(', ') || '(none)'}  changed=[${msg.changed}] removed=[${msg.removed}]`);
      } else if (msg.type === 'transcript' && !msg.interim) {
        log(`transcript: "${msg.final.split(/(?<=[.?!])\s/).at(-1)}"`);
      } else if (msg.type === 'error') {
        log('ERROR', msg);
      } else if (msg.type === 'done') {
        resolve();
      }
    });

    ws.addEventListener('error', () => reject(new Error('socket error')));
    ws.addEventListener('close', () => resolve());
  });

  await new Promise<void>((r) => ws.addEventListener('open', () => r(), { once: true }));
  ws.send(JSON.stringify({ type: 'init', pending }));

  for (const text of utterances) {
    log(`🗣  "${text}"`);
    const audio = Buffer.concat([speech(text), silence(1800)]);
    for (let i = 0; i < audio.length; i += 3200) {
      ws.send(audio.subarray(i, i + 3200));
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  ws.send(JSON.stringify({ type: 'stop' }));
  await done;

  return set;
}

function assert(cond: unknown, message: string) {
  if (!cond) {
    console.error(`✗ ${message}`);
    process.exitCode = 1;
  } else console.log(`✓ ${message}`);
}

// Sign in against Neon Auth like the app does, then mint an API JWT from the session.
const signIn = await fetch(`${env.authBaseUrl}/sign-in/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: DEMO_USER.email, password: DEMO_USER.password }),
});
const cookie = signIn.headers.getSetCookie().find((c) => c.startsWith('__Secure-neon-auth.session_token='))?.split(';')[0];
if (!cookie) throw new Error(`Neon Auth sign-in failed: ${signIn.status}`);

const auth = (await (await fetch(`${env.authBaseUrl}/token`, { headers: { cookie } })).json()) as { token: string };

const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Brussels' });
const list = await api<JobSummaryDto[]>(`/jobs?date=${today}`, auth.token);
const target = list.find((j) => j.code === 'JOB-1042');
if (!target) throw new Error('JOB-1042 not found, run pnpm db:seed');

let job = await api<JobDetailDto>(`/jobs/${target.id}/start`, auth.token, { method: 'POST' });
log(`started ${job.code}, appliance prefilled from ${job.appliancePrefilledFrom}`);

const round1 = await session(job.id, auth.token, { fieldOps: [], lineOps: [] }, [
  'I arrived at 11am.',
  'No, scrap that.',
  'It was 10am.',
  'Used twelve meters of cable and forty screws.',
  'Actually, make the cable fifteen meters.',
  'Forget the screws.',
]);
let res = await api<{ job: JobDetailDto; skipped: string[] }>(`/jobs/${job.id}/commit`, auth.token, {
  method: 'POST',
  body: JSON.stringify({ baseVersion: job.version, proposals: round1 }),
});
job = res.job;

assert(job.values.arrivalTime === '10:00', `arrival time saved as 10:00 (got ${job.values.arrivalTime})`);
assert(job.lines.length === 1 && /cable/i.test(String(job.lines[0]?.values.material)) && job.lines[0]?.values.quantity === 15, `one material line: cable 15 m (got ${JSON.stringify(job.lines.map((l) => l.values))})`);

const round2 = await session(job.id, auth.token, { fieldOps: [], lineOps: [] }, [
  'Set priority to high.',
  'Tag this as warranty and follow up.',
  'Remove the follow up tag.',
]);
res = await api(`/jobs/${job.id}/commit`, auth.token, { method: 'POST', body: JSON.stringify({ baseVersion: job.version, proposals: round2 }) });
job = res.job;

assert(job.priority === 'high', `priority saved as high (got ${job.priority})`);
assert(JSON.stringify(job.tags) === '["warranty"]', `tags saved as [warranty] (got ${JSON.stringify(job.tags)})`);

const stale = await fetch(`${API}/v1/jobs/${job.id}/commit`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${auth.token}` },
  body: JSON.stringify({ baseVersion: 1, proposals: round2 }),
});
assert(stale.status === 409, `stale commit rejected with 409 (got ${stale.status})`);
