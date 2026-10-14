import { AUDIO_SAMPLE_RATE } from '@formcast/shared';
import { env } from '../env';

// Thin client for Deepgram's live transcription WebSocket.
// Auth goes through the subprotocol so the platform WebSocket can be used as is.

export interface SttEvents {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onClose: (code: number, reason: string) => void;
}

interface DeepgramResult {
  type: string;
  is_final?: boolean;
  channel?: { alternatives?: { transcript?: string }[] };
}

export function openDeepgram(events: SttEvents, sampleRate = AUDIO_SAMPLE_RATE) {
  const params = new URLSearchParams({
    model: 'nova-3',
    language: 'en',
    encoding: 'linear16',
    sample_rate: String(Math.round(sampleRate)),
    channels: '1',
    interim_results: 'true',
    punctuate: 'true',
    smart_format: 'true',
    endpointing: '300',
  });
  const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, ['token', env.deepgramApiKey]);
  ws.binaryType = 'arraybuffer';

  const queue: ArrayBuffer[] = [];
  let open = false;
  let closing = false;

  // Deepgram closes a stream after ~10 s without data; keep it alive while paused.
  const keepAlive = setInterval(() => {
    if (open) ws.send(JSON.stringify({ type: 'KeepAlive' }));
  }, 5000);

  ws.addEventListener('open', () => {
    open = true;
    for (const chunk of queue.splice(0)) ws.send(chunk);
    if (closing) ws.send(JSON.stringify({ type: 'CloseStream' }));
  });
  ws.addEventListener('message', (event) => {
    let msg: DeepgramResult;
    try {
      msg = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (msg.type !== 'Results') return;
    const text = msg.channel?.alternatives?.[0]?.transcript?.trim() ?? '';
    if (msg.is_final) {
      if (text) events.onFinal(text);
      events.onInterim('');
    } else {
      events.onInterim(text);
    }
  });
  ws.addEventListener('error', () => events.onError('Speech recognition connection failed'));
  ws.addEventListener('close', (event) => {
    clearInterval(keepAlive);
    open = false;
    console.log(`[deepgram] closed code=${event.code} reason=${event.reason || '-'} requested=${closing}`);
    events.onClose(event.code, event.reason);
  });

  return {
    send(chunk: ArrayBuffer) {
      if (closing) return;
      if (open) ws.send(chunk);
      else queue.push(chunk);
    },
    /** Flushes remaining audio; Deepgram sends the last finals, then closes. */
    finish() {
      if (closing) return;
      closing = true;
      if (open) ws.send(JSON.stringify({ type: 'CloseStream' }));
    },
    abort() {
      closing = true;
      clearInterval(keepAlive);
      try {
        ws.close();
      } catch {
        // already closed
      }
    },
  };
}
