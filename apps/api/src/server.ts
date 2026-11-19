import { buildApp } from './app.js';
import { pool } from './db.js';

const app = buildApp();
await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3001) });

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await app.close();
  await pool.end();
}

process.once('SIGTERM', stop);
process.once('SIGINT', stop);
