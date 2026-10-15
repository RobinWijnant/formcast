import { factory } from '../auth';

export const me = factory.createHandlers((c) => c.json(c.get('user')));
