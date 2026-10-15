import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { APPLIANCE_KEYS } from '@formcast/shared';
import { factory } from '../../auth';
import { db, schema } from '../../db/client';
import { loadJob, parseJobId } from './shared';

const { jobs, jobValues } = schema;

/**
 * Starts a job. When the client has an earlier visit and the appliance section is
 * still empty, the appliance values are copied from that visit.
 */
export const startJob = factory.createHandlers(async (c) => {
  const id = parseJobId(c.req.param('id'));

  const job = await db.transaction(async (tx) => {
    const current = await loadJob(id, tx);
    if (current.status !== 'scheduled') return current;

    const hasAppliance = APPLIANCE_KEYS.some((k) => current.values[k] !== undefined);
    let prefilledFrom: string | null = null;
    if (!hasAppliance) {
      // Most recent earlier visit of this client that recorded the appliance.
      const [source] = await tx
        .selectDistinct({ jobId: jobs.id, start: jobs.scheduledStart })
        .from(jobs)
        .innerJoin(jobValues, eq(jobValues.jobId, jobs.id))
        .where(and(eq(jobs.clientId, current.client.id), ne(jobs.id, id), inArray(jobValues.fieldKey, APPLIANCE_KEYS)))
        .orderBy(desc(jobs.scheduledStart))
        .limit(1);
      if (source) {
        const previous = await tx
          .select()
          .from(jobValues)
          .where(and(eq(jobValues.jobId, source.jobId), inArray(jobValues.fieldKey, APPLIANCE_KEYS)));
        await tx.insert(jobValues).values(previous.map((p) => ({ jobId: id, fieldKey: p.fieldKey, value: p.value })));
        prefilledFrom = source.start.toISOString().slice(0, 10);
      }
    }
    await tx
      .update(jobs)
      .set({ status: 'in_progress', appliancePrefilledFrom: prefilledFrom, version: sql`${jobs.version} + 1`, updatedAt: new Date() })
      .where(eq(jobs.id, id));
    return loadJob(id, tx);
  });

  return c.json(job);
});
