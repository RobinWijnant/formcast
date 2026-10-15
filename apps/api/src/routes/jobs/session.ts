import { upgradeWebSocket } from '@neon/functions/hono';
import type { ClientMessage, ServerMessage } from '@formcast/shared';
import { factory } from '../../auth';
import { createVoiceSession } from '../../voice/session';
import { loadJob, parseJobId } from './shared';

/** wss://.../v1/jobs/:id/session?token=<jwt>: audio in, transcript and proposals out. */
export const jobSession = factory.createHandlers(
  upgradeWebSocket(async (c) => {
    // Before the upgrade, so a missing job is a plain 404.
    const job = await loadJob(parseJobId(c.req.param('id')));
    let session: ReturnType<typeof createVoiceSession> | undefined;
    return {
      onOpen(_event, ws) {
        const send = (msg: ServerMessage) => {
          if (ws.readyState === 1) ws.send(JSON.stringify(msg));
        };
        session = createVoiceSession(job, send, () => ws.close(1000, 'done'));
      },
      onMessage(event) {
        if (typeof event.data === 'string') {
          try {
            session?.onMessage(JSON.parse(event.data) as ClientMessage);
          } catch {
            // ignore malformed control frames
          }
        } else if (event.data instanceof ArrayBuffer) {
          session?.onAudio(event.data);
        }
      },
      onClose(event) {
        session?.onClose(event.code);
      },
      onError() {
        console.warn('[session] socket error');
        session?.onClose();
      },
    };
  }),
);
