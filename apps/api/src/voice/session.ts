import {
  EMPTY_PROPOSALS,
  changedKeys,
  committedLineIds,
  normalizeProposalSet,
  opKey,
  type ClientMessage,
  type JobDetailDto,
  type ProposalSet,
  type ServerMessage,
} from '@formcast/shared';
import { openDeepgram } from './deepgram';
import { proposeChanges } from './engine';

const DEBOUNCE_MS = 300;
const MODEL_TIMEOUT_MS = 10_000;
const RETRY_MS = 2_000;

/**
 * One speaking session: audio in, transcript + proposal snapshots out.
 * The proposal set lives here while the technician talks; nothing touches the
 * database until the app commits it.
 */
export function createVoiceSession(job: JobDetailDto, send: (msg: ServerMessage) => void, close: () => void) {
  const lineIds = committedLineIds(job.lines);
  let pending: ProposalSet = EMPTY_PROPOSALS;
  const transcript: string[] = [];
  const rejected = new Map<string, string>(); // op key -> JSON of the rejected op
  let seq = 0;
  let processedSegments = 0;
  let running: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopping = false;
  let retries = 0;
  let finished = false;

  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Brussels' });

  const publish = (next: ProposalSet) => {
    const { changed, removed } = changedKeys(pending, next);
    pending = next;
    if (changed.length || removed.length) send({ type: 'proposals', seq: ++seq, set: pending, changed, removed });
  };

  // A "change" to the value that is already saved is no change: drop it.
  const committedLines = new Map(job.lines.map((l) => [l.id, l.values]));
  const withoutNoops = (set: ProposalSet): ProposalSet => ({
    fieldOps: set.fieldOps.filter((o) =>
      o.op === 'set' ? JSON.stringify(o.value) !== JSON.stringify(job.values[o.fieldKey]) : job.values[o.fieldKey] !== undefined,
    ),
    lineOps: set.lineOps.filter(
      (o) => o.op !== 'update' || Object.entries(o.values ?? {}).some(([k, v]) => committedLines.get(o.lineId)?.[k] !== v),
    ),
  });

  // A tapped-away proposal stays away until the technician says something different.
  const withoutRejected = (set: ProposalSet): ProposalSet => {
    const keep = (op: ProposalSet['fieldOps'][number] | ProposalSet['lineOps'][number]) => rejected.get(opKey(op)) !== JSON.stringify(op);
    return { fieldOps: set.fieldOps.filter(keep), lineOps: set.lineOps.filter(keep) };
  };

  /** Returns false when the run failed and should be retried later. */
  async function runModel(): Promise<boolean> {
    const upTo = transcript.length;
    if (upTo === processedSegments) return true;
    send({ type: 'status', state: 'updating' });
    try {
      const { set, dropped, ms } = await proposeChanges(
        { job, pending, transcript: transcript.slice(0, upTo), today },
        AbortSignal.timeout(MODEL_TIMEOUT_MS),
      );
      processedSegments = upTo;
      if (dropped.length) console.warn('[engine] dropped ops:', dropped.join('; '));
      console.log(`[engine] ${ms} ms, ${set.fieldOps.length} field ops, ${set.lineOps.length} line ops`);
      publish(withoutRejected(withoutNoops(set)));
    } catch (err) {
      console.error('[engine]', err);
      if (!stopping) send({ type: 'status', state: 'listening' });
      if (retries++ < 3) {
        // Rate limit or a slow model: keep the transcript and try again shortly.
        setTimeout(trigger, RETRY_MS);
      } else {
        send({ type: 'error', code: 'llm', message: 'Could not update the form. Keep talking or try again.' });
        processedSegments = upTo;
      }
      return false;
    }
    retries = 0;
    if (!stopping) send({ type: 'status', state: 'listening' });
    return true;
  }

  // Single flight: if speech arrives while the model runs, run once more after.
  function trigger() {
    if (running) return;
    running = (async () => {
      while (transcript.length > processedSegments) {
        if (!(await runModel())) break;
      }
    })().finally(() => {
      running = null;
    });
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(trigger, DEBOUNCE_MS);
  }

  let stt: ReturnType<typeof openDeepgram> | undefined;
  let sttRate: number | undefined;
  let sttReopens = 0;
  let audioBytes = 0;
  const audioLog = setInterval(() => {
    console.log(`[session] ${job.code} audio ${Math.round(audioBytes / 1024)} KB in 10 s, transcript ${transcript.length} segments`);
    audioBytes = 0;
  }, 10_000);
  console.log(`[session] ${job.code} opened`);

  const openStt = (sampleRate?: number) => (stt ??= openDeepgram({
    onInterim: (interim) => send({ type: 'transcript', final: transcript.join(' '), interim }),
    onFinal: (text) => {
      transcript.push(text);
      send({ type: 'transcript', final: transcript.join(' '), interim: '' });
      schedule();
    },
    onError: (message) => console.warn('[deepgram]', message),
    onClose: (code) => {
      stt = undefined;
      if (stopping || finished) return void finish();
      // Deepgram ended the stream while the technician is still talking (idle
      // timeout, network blip): open a fresh one and keep the session alive.
      if (sttReopens++ < 5) {
        console.warn(`[session] ${job.code} speech stream closed (${code}), reopening`);
        openStt(sttRate);
      } else {
        send({ type: 'error', code: 'stt', message: 'Speech recognition keeps dropping. Stop and try again.' });
        void finish();
      }
    },
  }, (sttRate = sampleRate ?? sttRate)));

  async function finish() {
    if (finished) return;
    finished = true;
    clearInterval(audioLog);
    console.log(`[session] ${job.code} finished (stopping=${stopping})`);
    clearTimeout(timer);
    trigger();
    await running;
    send({ type: 'done' });
    close();
  }

  send({ type: 'ready' });
  send({ type: 'status', state: 'listening' });

  return {
    onAudio(chunk: ArrayBuffer) {
      // An empty binary frame means "close stream" to Deepgram: never forward one.
      if (!chunk.byteLength) return;
      audioBytes += chunk.byteLength;
      if (!stopping) openStt().send(chunk);
    },
    onMessage(msg: ClientMessage) {
      switch (msg.type) {
        case 'init': {
          // Unsaved changes from an earlier session on this job.
          pending = normalizeProposalSet(msg.pending, { committedLineIds: lineIds }).set;
          openStt(msg.sampleRate && msg.sampleRate >= 8000 && msg.sampleRate <= 48000 ? msg.sampleRate : undefined);
          break;
        }
        case 'reject': {
          const op = [...pending.fieldOps, ...pending.lineOps].find((o) => opKey(o) === msg.key);
          if (!op) return;
          rejected.set(msg.key, JSON.stringify(op));
          publish(withoutRejected(pending));
          break;
        }
        case 'stop':
          stopping = true;
          send({ type: 'status', state: 'stopping' });
          if (stt) stt.finish();
          else void finish();
          // Deepgram normally closes within a second; don't wait forever.
          setTimeout(() => void finish(), 4000);
          break;
      }
    },
    onClose(code?: number) {
      if (!finished) console.log(`[session] ${job.code} client closed (${code ?? '-'}) before finishing`);
      clearInterval(audioLog);
      stopping = true;
      finished = true;
      clearTimeout(timer);
      stt?.abort();
    },
  };
}
