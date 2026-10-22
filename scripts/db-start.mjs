#!/usr/bin/env node
/**
 * Local PostgreSQL without Docker or admin rights.
 *
 * Uses the platform binaries shipped by the `embedded-postgres` npm package.
 *   npm run db:start   -> initialise (first run) + start in background + create database
 *   npm run db:stop    -> stop the background server
 *   npm run db:status  -> show whether the server is running
 *
 * Data lives in .data/pg, server log in .data/pg.log. Settings come from .env
 * (DATABASE_URL) and default to postgres:postgres@localhost:5433/resource_board.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = path.join(root, '.data');
const dataDir = path.join(dataRoot, 'pg');
const logFile = path.join(dataRoot, 'pg.log');

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const file of ['.env', path.join('apps', 'api', '.env')]) {
    const full = path.join(root, file);
    if (!existsSync(full)) continue;
    const match = readFileSync(full, 'utf8').match(/^\s*DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
    if (match) return match[1];
  }
  return 'postgresql://postgres:postgres@localhost:5433/resource_board';
}

const url = new URL(loadDatabaseUrl());
const cfg = {
  user: decodeURIComponent(url.username || 'postgres'),
  password: decodeURIComponent(url.password || 'postgres'),
  port: Number(url.port || 5433),
  database: url.pathname.replace(/^\//, '').split('?')[0] || 'resource_board',
};

async function binaries() {
  const os = process.platform === 'win32' ? 'windows' : process.platform;
  const pkg = `@embedded-postgres/${os}-${process.arch}`;
  try {
    return await import(pkg);
  } catch {
    throw new Error(
      `No embedded Postgres binaries for ${process.platform}-${process.arch} (${pkg}).`,
    );
  }
}

function pgCtl(bin, args, opts = {}) {
  return spawnSync(bin.pg_ctl, args, { encoding: 'utf8', ...opts });
}

async function isRunning(bin) {
  if (!existsSync(path.join(dataDir, 'PG_VERSION'))) return false;
  return pgCtl(bin, ['status', '-D', dataDir]).status === 0;
}

async function start() {
  const bin = await binaries();
  mkdirSync(dataRoot, { recursive: true });

  if (!existsSync(path.join(dataDir, 'PG_VERSION'))) {
    console.log(`[db] Initialising new cluster in ${path.relative(root, dataDir)} ...`);
    const embedded = new EmbeddedPostgres({
      databaseDir: dataDir,
      user: cfg.user,
      password: cfg.password,
      port: cfg.port,
      persistent: true,
      initdbFlags: ['--encoding=UTF8', '--locale=C'],
      onLog: () => {},
    });
    await embedded.initialise();
  }

  if (await isRunning(bin)) {
    console.log(`[db] Postgres already running on port ${cfg.port}.`);
  } else {
    console.log(
      `[db] Starting Postgres on port ${cfg.port} (log: ${path.relative(root, logFile)}) ...`,
    );
    const res = pgCtl(
      bin,
      ['start', '-D', dataDir, '-l', logFile, '-w', '-t', '60', '-o', `-p ${cfg.port}`],
      {
        stdio: 'ignore',
        windowsHide: true,
      },
    );
    if (res.status !== 0) {
      throw new Error(`pg_ctl start failed (exit ${res.status}). See ${logFile}`);
    }
  }

  const client = new pg.Client({ ...cfg, host: 'localhost', database: 'postgres' });
  await client.connect();
  const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
    cfg.database,
  ]);
  if (!rowCount) {
    await client.query(`CREATE DATABASE "${cfg.database.replace(/"/g, '""')}"`);
    console.log(`[db] Created database "${cfg.database}".`);
  }
  await client.end();
  console.log(`[db] Ready: postgresql://${cfg.user}:***@localhost:${cfg.port}/${cfg.database}`);
  console.log('[db] Stop with: npm run db:stop');
}

async function stop() {
  const bin = await binaries();
  if (!(await isRunning(bin))) {
    console.log('[db] Postgres is not running.');
    return;
  }
  const res = pgCtl(bin, ['stop', '-D', dataDir, '-m', 'fast', '-w'], { stdio: 'inherit' });
  process.exitCode = res.status ?? 1;
}

async function status() {
  const bin = await binaries();
  const running = await isRunning(bin);
  console.log(`[db] Postgres is ${running ? `running on port ${cfg.port}` : 'not running'}.`);
  process.exitCode = running ? 0 : 3;
}

const command = process.argv[2] ?? 'start';
const actions = { start, stop, status };
if (!actions[command]) {
  console.error(`Unknown command "${command}". Use start | stop | status.`);
  process.exit(1);
}
actions[command]().catch((err) => {
  console.error('[db]', err.message ?? err);
  process.exit(1);
});
