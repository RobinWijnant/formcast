import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { upgradeWebSocket } from '@neon/functions/hono';
import { z } from 'zod';
import { commitBody, type ClientMessage, type JobDetailDto, type ServerMessage, type UserDto } from '@formcast/shared';
import { AuthError, refresh, signIn, signOut, verifyToken } from './auth';
import { ConflictError, NotFoundError, commit, daysWithJobs, getJob, listJobs, startJob } from './jobs';
import { createVoiceSession } from './voice/session';

type Env = { Variables: { user: UserDto; job: JobDetailDto } };

const app = new Hono<Env>();

// CORS for the web build of the app only; the upgrade route must stay untouched.
const corsMiddleware = cors({ origin: (o) => o, allowHeaders: ['authorization', 'content-type'] });
app.use('/v1/*', (c, next) => (c.req.path.endsWith('/session') ? next() : corsMiddleware(c, next)));

app.get('/', (c) => c.json({ name: 'formcast-api', ok: true }));

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jobId(c: Context<Env>): string {
  const id = c.req.param('id') ?? '';
  if (!UUID.test(id)) throw new NotFoundError('Job not found');
  return id;
}

async function requireUser(c: Context<Env>, next: () => Promise<void>) {
  const header = c.req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : c.req.query('token');
  if (!token) throw new HTTPException(401, { message: 'Sign in required' });
  c.set('user', await verifyToken(token));
  await next();
}

// --- Auth (Neon Auth behind a JWT handoff, see auth.ts) ---------------------

app.post('/v1/auth/sign-in', async (c) => {
  const body = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw new HTTPException(400, { message: 'Enter your email and password' });
  return c.json(await signIn(body.data.email, body.data.password));
});

app.post('/v1/auth/refresh', async (c) => {
  const body = z.object({ refreshToken: z.string().min(1) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw new HTTPException(400, { message: 'Missing refresh token' });
  return c.json(await refresh(body.data.refreshToken));
});

app.post('/v1/auth/sign-out', async (c) => {
  const body = z.object({ refreshToken: z.string() }).safeParse(await c.req.json().catch(() => null));
  if (body.success) await signOut(body.data.refreshToken).catch(() => undefined);
  return c.json({ ok: true });
});

app.get('/v1/me', requireUser, (c) => c.json(c.get('user')));

// --- Jobs --------------------------------------------------------------------

app.get('/v1/jobs', requireUser, async (c) => {
  const day = c.req.query('date') ?? '';
  if (!ISO_DAY.test(day)) throw new HTTPException(400, { message: 'date must be YYYY-MM-DD' });
  return c.json(await listJobs(day));
});

app.get('/v1/calendar', requireUser, async (c) => {
  const from = c.req.query('from') ?? '';
  const to = c.req.query('to') ?? '';
  if (!ISO_DAY.test(from) || !ISO_DAY.test(to)) throw new HTTPException(400, { message: 'from and to must be YYYY-MM-DD' });
  return c.json(await daysWithJobs(from, to));
});

app.get('/v1/jobs/:id', requireUser, async (c) => c.json(await getJob(jobId(c))));

app.post('/v1/jobs/:id/start', requireUser, async (c) => c.json(await startJob(jobId(c))));

app.post('/v1/jobs/:id/commit', requireUser, async (c) => {
  const body = commitBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw new HTTPException(400, { message: 'Invalid commit body' });
  return c.json(await commit(jobId(c), body.data.baseVersion, body.data.proposals));
});

// --- Voice session -------------------------------------------------------------
// wss://.../v1/jobs/:id/session?token=<jwt>  (native WebSockets can't set headers)

app.get(
  '/v1/jobs/:id/session',
  requireUser,
  async (c, next) => {
    c.set('job', await getJob(jobId(c)));
    await next();
  },
  upgradeWebSocket((c) => {
    const job = c.get('job');
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

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  if (err instanceof AuthError) return c.json({ error: err.message }, err.status);
  if (err instanceof NotFoundError) return c.json({ error: err.message }, 404);
  if (err instanceof ConflictError) return c.json({ error: err.message }, 409);
  console.error(err);
  return c.json({ error: 'Something went wrong' }, 500);
});

export default app;
