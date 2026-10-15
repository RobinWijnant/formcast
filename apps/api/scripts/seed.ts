// Resets the demo data: four clients, today's schedule and some history.
// Jobs are placed relative to today (Brussels time), so re-run before a demo.
//   pnpm db:seed
import { Pool } from 'pg';
import { env } from '../src/env';
import { DEMO_USER } from './demo-user';

const pool = new Pool({ connectionString: (process.env.DATABASE_URL_UNPOOLED ?? env.databaseUrl).replace('sslmode=require', 'sslmode=verify-full') });

async function ensureDemoUser() {
  const res = await fetch(`${env.authBaseUrl}/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:8081' },
    body: JSON.stringify(DEMO_USER),
  });

  if (res.ok) console.log('Created demo user');
  else console.log(`Demo user exists (${res.status})`);
}

const clients = [
  { key: 'peeters', name: 'Peeters', contact: 'Anne Peeters', phone: '+32 9 000 11 11', address: 'Kerkstraat 12', city: '9000 Gent', note: null, lat: 51.0543, lng: 3.7174 },
  { key: 'vandamme', name: 'Van Damme family', contact: 'Marc Van Damme', phone: '+32 9 000 12 34', address: 'Veldstraat 48', city: '9000 Gent', note: 'Boiler is in the attic. Ring the side door, parking in front.', lat: 51.0517, lng: 3.7215 },
  { key: 'janssens', name: 'Janssens', contact: 'Sofie Janssens', phone: '+32 9 000 22 22', address: 'Brugsesteenweg 210', city: '9030 Mariakerke', note: 'Use the back entrance.', lat: 51.07, lng: 3.68 },
  { key: 'desmet', name: 'De Smet', contact: 'Pieter De Smet', phone: '+32 9 000 33 33', address: 'Kortrijksesteenweg 112', city: '9830 Sint-Martens-Latem', note: null, lat: 51.017, lng: 3.637 },
];

interface SeedJob {
  code: string;
  client: string;
  title: string;
  description: string;
  day: number; // days from today
  start: string;
  end: string;
  status: 'scheduled' | 'in_progress' | 'done';
  priority: string;
  tags: string[];
  outcome?: string;
  values?: Record<string, unknown>;
  lines?: Record<string, unknown>[];
}

const vandammeAppliance = { brand: 'Vaillant', model: 'ecoTEC plus', yearBuilt: 2016, serialNumber: '21163500', ratedOutputKw: 25, fuel: 'gas' };

const jobs: SeedJob[] = [
  // History
  { code: 'JOB-0917', client: 'vandamme', title: 'Boiler maintenance', description: 'Yearly maintenance.', day: -369, start: '09:00', end: '10:00', status: 'done', priority: 'medium', tags: [], outcome: 'OK · next before Oct 2026',
    values: { ...vandammeAppliance, status: 'ok', coPpm: 18, co2Percent: 9.1, flueGasTempC: 68, efficiencyPercent: 97, nextMaintenanceBefore: '2026-10-10', arrivalTime: '09:05', endTime: '09:55', jobComplete: true } },
  { code: 'JOB-0634', client: 'vandamme', title: 'Boiler repair', description: 'Pressure drops.', day: -253, start: '13:00', end: '14:00', status: 'done', priority: 'high', tags: ['warranty'], outcome: 'Pressure valve replaced',
    values: { status: 'ok', remarks: 'Pressure valve replaced.' }, lines: [{ material: 'Pressure valve', quantity: 1, unit: 'pcs' }] },
  // Today
  { code: 'JOB-1041', client: 'peeters', title: 'Boiler maintenance', description: 'Yearly maintenance of the gas boiler.', day: 0, start: '08:00', end: '09:15', status: 'done', priority: 'low', tags: [], outcome: 'OK' },
  { code: 'JOB-1042', client: 'vandamme', title: 'Boiler maintenance', description: 'Yearly maintenance of the gas condensing boiler. Customer mentions the pressure drops now and then.', day: 0, start: '10:00', end: '11:30', status: 'scheduled', priority: 'medium', tags: [] },
  { code: 'JOB-1043', client: 'janssens', title: 'Boiler repair', description: 'Boiler shows fault F28 (ignition). Under warranty.', day: 0, start: '12:00', end: '13:00', status: 'scheduled', priority: 'high', tags: ['warranty'] },
  { code: 'JOB-1044', client: 'desmet', title: 'Pellet stove maintenance', description: 'Yearly cleaning and check of the pellet stove.', day: 0, start: '14:00', end: '15:00', status: 'scheduled', priority: 'low', tags: ['follow-up'] },
  // Coming days
  { code: 'JOB-1045', client: 'peeters', title: 'Thermostat replacement', description: 'Replace the room thermostat.', day: 1, start: '09:00', end: '10:00', status: 'scheduled', priority: 'medium', tags: ['parts-needed'] },
  { code: 'JOB-1046', client: 'janssens', title: 'Boiler repair follow-up', description: 'Check the ignition after the repair.', day: 2, start: '11:00', end: '11:45', status: 'scheduled', priority: 'medium', tags: ['follow-up'] },
];

async function main() {
  await ensureDemoUser();

  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query('truncate job_lines, job_values, jobs, appliances, clients cascade');

    const clientIds = new Map<string, string>();
    for (const cl of clients) {
      const { rows } = await c.query(
        `insert into clients (name, contact_name, phone, address, city, access_note, lat, lng) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
        [cl.name, cl.contact, cl.phone, cl.address, cl.city, cl.note, cl.lat, cl.lng],
      );
      clientIds.set(cl.key, rows[0].id);
    }

    const { rows: appl } = await c.query(
      `insert into appliances (client_id, label, year_built) values ($1, 'Vaillant ecoTEC plus', 2016) returning id`,
      [clientIds.get('vandamme')],
    );

    for (const j of jobs) {
      const day = `(now() at time zone 'Europe/Brussels')::date + ${j.day}`;
      const { rows } = await c.query(
        `insert into jobs (code, title, description, client_id, appliance_id, scheduled_start, scheduled_end, status, priority, tags, outcome)
         values ($1,$2,$3,$4,$5, ((${day}) + $6::time) at time zone 'Europe/Brussels', ((${day}) + $7::time) at time zone 'Europe/Brussels', $8,$9,$10,$11)
         returning id`,
        [j.code, j.title, j.description, clientIds.get(j.client), j.client === 'vandamme' ? appl[0].id : null, j.start, j.end, j.status, j.priority, j.tags, j.outcome ?? null],
      );
      const jobId = rows[0].id;

      for (const [key, value] of Object.entries(j.values ?? {})) {
        await c.query('insert into job_values (job_id, field_key, value) values ($1,$2,$3)', [jobId, key, JSON.stringify(value)]);
      }

      for (const [i, line] of (j.lines ?? []).entries()) {
        await c.query('insert into job_lines (job_id, group_key, values, position) values ($1, $2, $3, $4)', [jobId, 'materials', JSON.stringify(line), i]);
      }
    }

    await c.query('commit');
    console.log(`Seeded ${clients.length} clients and ${jobs.length} jobs`);
  } catch (err) {
    await c.query('rollback');
    throw err;
  } finally {
    c.release();
    await pool.end();
  }
}

await main();
