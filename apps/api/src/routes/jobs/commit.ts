import { and, eq, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { FIELD_BY_KEY, commitBody, committedLineIds, missingColumns, normalizeProposalSet } from '@formcast/shared';
import { factory } from '../../auth';
import { db, schema } from '../../db/client';
import { ConflictError, NotFoundError } from '../../errors';
import { JOB_COLUMNS, loadJob, parseJobId } from './shared';

const { jobs, jobValues, jobLines } = schema;

/**
 * Writes a proposal set in one transaction. Responds with the saved job and the
 * ops that could not be saved, e.g. a line still missing its unit.
 */
export const commitJob = factory.createHandlers(async (c) => {
  const id = parseJobId(c.req.param('id'));
  const body = commitBody.safeParse(await c.req.json().catch(() => null));
  if (!body.success) throw new HTTPException(400, { message: 'Invalid commit body' });

  const result = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(jobs).where(eq(jobs.id, id)).for('update');
    if (!locked) throw new NotFoundError('Job not found');
    if (locked.version !== body.data.baseVersion) throw new ConflictError('Job changed since it was loaded');

    const existing = await tx.select({ id: jobLines.id }).from(jobLines).where(eq(jobLines.jobId, id));
    const { set, dropped } = normalizeProposalSet(body.data.proposals, { committedLineIds: committedLineIds(existing) });
    const skipped = [...dropped];
    const jobPatch: Partial<typeof jobs.$inferInsert> = {};

    for (const op of set.fieldOps) {
      const column = JOB_COLUMNS[op.fieldKey];
      if (column) {
        Object.assign(jobPatch, column.write(op.op === 'set' ? op.value : undefined));
      } else if (op.op === 'clear') {
        await tx.delete(jobValues).where(and(eq(jobValues.jobId, id), eq(jobValues.fieldKey, op.fieldKey)));
      } else {
        await tx
          .insert(jobValues)
          .values({ jobId: id, fieldKey: op.fieldKey, value: op.value })
          .onConflictDoUpdate({ target: [jobValues.jobId, jobValues.fieldKey], set: { value: op.value, updatedAt: new Date() } });
      }

      if (op.fieldKey === 'jobComplete' && op.op === 'set') jobPatch.status = op.value === true ? 'done' : 'in_progress';
      if (op.fieldKey === 'status' && op.op === 'set') {
        jobPatch.outcome = FIELD_BY_KEY.get('status')?.options?.find((o) => o.value === op.value)?.label ?? null;
      }
    }

    let position = existing.length;
    for (const op of set.lineOps) {
      if (op.op === 'create') {
        const missing = missingColumns(op);
        if (missing.length) { skipped.push(`line ${op.lineId} missing ${missing.join(', ')}`); continue; }

        await tx.insert(jobLines).values({ jobId: id, groupKey: op.groupKey, values: op.values ?? {}, position: position++ });
      } else if (op.op === 'update') {
        await tx
          .update(jobLines)
          .set({ values: sql`${jobLines.values} || ${JSON.stringify(op.values ?? {})}::jsonb` })
          .where(and(eq(jobLines.id, op.lineId), eq(jobLines.jobId, id)));
      } else {
        await tx.delete(jobLines).where(and(eq(jobLines.id, op.lineId), eq(jobLines.jobId, id)));
      }
    }

    await tx
      .update(jobs)
      .set({ ...jobPatch, version: sql`${jobs.version} + 1`, updatedAt: new Date() })
      .where(eq(jobs.id, id));

    return { job: await loadJob(id, tx), skipped };
  });

  return c.json(result);
});
