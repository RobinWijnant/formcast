import { and, asc, eq, gte, lt, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { factory } from '../../auth';
import { db, schema } from '../../db/client';
import { TZ, toSummary } from './shared';

const { jobs, clients } = schema;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Jobs scheduled on a calendar day (`?date=YYYY-MM-DD`, Brussels time), in schedule order. */
export const listJobs = factory.createHandlers(async (c) => {
  const day = c.req.query('date') ?? '';
  if (!ISO_DAY.test(day)) throw new HTTPException(400, { message: 'date must be YYYY-MM-DD' });

  const start = sql`(${day}::date)::timestamp at time zone ${TZ}`;
  const end = sql`((${day}::date) + 1)::timestamp at time zone ${TZ}`;
  const rows = await db
    .select({ job: jobs, clientName: clients.name })
    .from(jobs)
    .innerJoin(clients, eq(clients.id, jobs.clientId))
    .where(and(gte(jobs.scheduledStart, start), lt(jobs.scheduledStart, end)))
    .orderBy(asc(jobs.scheduledStart));

  return c.json(rows.map((r) => toSummary(r.job, r.clientName)));
});
