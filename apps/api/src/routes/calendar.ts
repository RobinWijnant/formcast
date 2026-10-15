import { sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { factory } from '../auth';
import { db, schema } from '../db/client';
import { TZ } from './jobs/shared';

const { jobs } = schema;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Days in `?from=..&to=..` that have at least one job, for the week strip. */
export const calendar = factory.createHandlers(async (c) => {
  const from = c.req.query('from') ?? '';
  const to = c.req.query('to') ?? '';
  if (!ISO_DAY.test(from) || !ISO_DAY.test(to)) throw new HTTPException(400, { message: 'from and to must be YYYY-MM-DD' });

  const res = await db.execute<{ day: string }>(sql`
    select distinct to_char(${jobs.scheduledStart} at time zone ${TZ}, 'YYYY-MM-DD') as day
    from ${jobs}
    where (${jobs.scheduledStart} at time zone ${TZ})::date between ${from}::date and ${to}::date`);

  return c.json(res.rows.map((r) => r.day));
});
