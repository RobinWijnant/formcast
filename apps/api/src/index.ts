import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { requireUser, type AppEnv } from './auth';
import { AuthError, ConflictError, NotFoundError } from './errors';
import { calendar } from './routes/calendar';
import { commitJob } from './routes/jobs/commit';
import { getJob } from './routes/jobs/get';
import { listJobs } from './routes/jobs/list';
import { jobSession } from './routes/jobs/session';
import { startJob } from './routes/jobs/start';
import { me } from './routes/me';

const app = new Hono<AppEnv>();

app.get('/', (c) => c.json({ name: 'formcast-api', ok: true }));

// Everything under /v1 needs a signed-in user.
app.use('/v1/*', requireUser);

app.get('/v1/me', ...me);
app.get('/v1/calendar', ...calendar);
app.get('/v1/jobs', ...listJobs);
app.get('/v1/jobs/:id', ...getJob);
app.post('/v1/jobs/:id/start', ...startJob);
app.post('/v1/jobs/:id/commit', ...commitJob);
app.get('/v1/jobs/:id/session', ...jobSession);

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  if (err instanceof AuthError) return c.json({ error: err.message }, 401);
  if (err instanceof NotFoundError) return c.json({ error: err.message }, 404);
  if (err instanceof ConflictError) return c.json({ error: err.message }, 409);
  console.error(err);
  return c.json({ error: 'Something went wrong' }, 500);
});

export default app;
