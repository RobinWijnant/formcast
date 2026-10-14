import {
  EMPTY_PROPOSALS,
  changedKeys,
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
  const committedLineIds = new Set(job.lines.map((l) => l.id));
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
      publish(withoutRejected(set));
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

  const stt = openDeepgram({
    onInterim: (interim) => send({ type: 'transcript', final: transcript.join(' '), interim }),
    onFinal: (text) => {
      transcript.push(text);
      send({ type: 'transcript', final: transcript.join(' '), interim: '' });
      schedule();
    },
    onError: (message) => send({ type: 'error', code: 'stt', message }),
    onClose: () => void finish(),
  });

  async function finish() {
    if (finished) return;
    finished = true;
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
      if (!stopping) stt.send(chunk);
    },
    onMessage(msg: ClientMessage) {
      switch (msg.type) {
        case 'init': {
          // Unsaved changes from an earlier session on this job.
          pending = normalizeProposalSet(msg.pending, { committedLineIds }).set;
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
          stt.finish();
          // Deepgram normally closes within a second; don't wait forever.
          setTimeout(() => void finish(), 4000);
          break;
      }
    },
    onClose() {
      stopping = true;
      finished = true;
      clearTimeout(timer);
      stt.abort();
    },
  };
}
