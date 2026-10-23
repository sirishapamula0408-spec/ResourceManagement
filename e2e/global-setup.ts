import { execSync } from 'node:child_process';
import pg from 'pg';
import { E2E_DATABASE_URL } from '../playwright.config';

/** Recreate the e2e database and load the sample data, so every run starts the same. */
export default async function globalSetup() {
  const url = new URL(E2E_DATABASE_URL);
  const database = url.pathname.slice(1);
  if (!database.endsWith('_e2e')) {
    throw new Error(`Refusing to reset "${database}": the e2e database name must end in _e2e`);
  }

  const server = new URL(url);
  server.pathname = '/postgres';
  server.search = '';
  const client = new pg.Client({ connectionString: server.toString() });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  await client.query(`CREATE DATABASE "${database}"`);
  await client.end();

  const env = { ...process.env, DATABASE_URL: E2E_DATABASE_URL, NODE_ENV: 'development' };
  execSync('npm run db:deploy', { env, stdio: 'inherit' });
  execSync('npm run db:seed', { env, stdio: 'inherit' });
}
