import { factory } from '../../auth';
import { loadJob, parseJobId } from './shared';

export const getJob = factory.createHandlers(async (c) => c.json(await loadJob(parseJobId(c.req.param('id')))));
