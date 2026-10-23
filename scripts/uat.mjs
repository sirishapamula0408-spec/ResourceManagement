#!/usr/bin/env node
/**
 * User acceptance testing (UAT) environment, separate from your development data.
 *
 *   npm run uat:reset  -> recreate the `resource_board_uat` database with the sample data and
 *                         fresh temporary passwords for the UAT accounts
 *   npm run uat:start  -> build the app and serve it on your network for the testers
 *
 * Uses the same local Postgres as development (`npm run db:start`), but its own database,
 * so resetting UAT never touches your working data. Passwords are written to
 * .data/uat-credentials.txt (gitignored); share them with the testers directly.
 */
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = path.join(root, '.data');
const credentialsFile = path.join(dataRoot, 'uat-credentials.txt');
const secretFile = path.join(dataRoot, 'uat-jwt-secret');

const DB = { host: 'localhost', port: 5433, user: 'postgres', password: 'postgres' };
const UAT_DB = 'resource_board_uat';
const UAT_URL = `postgresql://${DB.user}:${DB.password}@${DB.host}:${DB.port}/${UAT_DB}?schema=public`;
const API_PORT = 4200;
const WEB_PORT = 4173;

/** The two PMs run the UAT; admin and oversight roles are for QA and the delivery head. */
const ACCOUNTS = [
  { email: 'priya.sharma@resourceboard.local', who: 'PM tester 1 (owns ATLAS, ORION)' },
  { email: 'daniel.okafor@resourceboard.local', who: 'PM tester 2 (owns NOVA)' },
  { email: 'admin@resourceboard.local', who: 'QA / admin' },
  { email: 'kavya.rao@resourceboard.local', who: 'Delivery head' },
  { email: 'omar.haddad@resourceboard.local', who: 'Resource manager' },
  { email: 'liam.chen@resourceboard.local', who: 'Team member (for assignee checks)' },
];

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const uatEnv = { ...process.env, DATABASE_URL: UAT_URL };

function run(args, env = uatEnv) {
  const res = spawnSync(npm, args, { cwd: root, env, stdio: 'inherit', shell: true });
  if (res.status !== 0) throw new Error(`"npm ${args.join(' ')}" failed`);
}

/** Readable temporary password that meets the app's rule (letters + digits, 10 chars). */
function temporaryPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const bytes = randomBytes(10);
  const word = [...bytes.subarray(0, 6)].map((b) => letters[b % letters.length]).join('');
  const digits = [...bytes.subarray(6)].map((b) => String(b % 10)).join('');
  return word[0].toUpperCase() + word.slice(1) + digits;
}

async function reset() {
  run(['run', 'db:start'], process.env);

  const admin = new pg.Client({ ...DB, database: 'postgres' });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${UAT_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${UAT_DB}`);
  await admin.end();
  console.log(`[uat] Created a fresh "${UAT_DB}" database.`);

  run(['run', 'db:deploy']);
  run(['run', 'db:seed']);

  // Replace the well-known sample passwords with temporary ones that must be changed.
  const client = new pg.Client({ ...DB, database: UAT_DB });
  await client.connect();
  const lines = [];
  for (const account of ACCOUNTS) {
    const password = temporaryPassword();
    const { rowCount } = await client.query(
      'UPDATE "Person" SET "passwordHash" = $1, "mustChangePassword" = true WHERE email = $2',
      [await bcrypt.hash(password, 10), account.email],
    );
    if (rowCount) lines.push(`${account.who.padEnd(34)} ${account.email.padEnd(36)} ${password}`);
  }
  // Nobody else can sign in during UAT with the published sample password.
  await client.query(`UPDATE "Person" SET "passwordHash" = NULL WHERE email <> ALL($1::text[])`, [
    ACCOUNTS.map((a) => a.email),
  ]);
  await client.end();

  mkdirSync(dataRoot, { recursive: true });
  writeFileSync(
    credentialsFile,
    [
      `Resource Board UAT accounts (reset ${new Date().toISOString().slice(0, 16).replace('T', ' ')})`,
      'Each person is asked to choose their own password at first sign-in.',
      '',
      ...lines,
      '',
    ].join('\n'),
  );
  console.log(`\n[uat] Ready. Temporary passwords: ${path.relative(root, credentialsFile)}`);
  console.log('[uat] Next: npm run uat:start');
}

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

async function start() {
  run(['run', 'db:start'], process.env);

  // Stable secret so testers stay signed in across restarts of the UAT server.
  mkdirSync(dataRoot, { recursive: true });
  if (!existsSync(secretFile)) writeFileSync(secretFile, randomBytes(32).toString('hex'));
  const env = {
    ...uatEnv,
    NODE_ENV: 'production',
    JWT_SECRET: readFileSync(secretFile, 'utf8').trim(),
    PORT: String(API_PORT),
    API_PORT: String(API_PORT),
  };

  run(['run', 'db:deploy'], env);
  console.log('[uat] Building the app ...');
  run(['run', 'build'], env);

  const api = spawn('node', ['apps/api/dist/server.js'], { cwd: root, env, stdio: 'inherit' });
  const web = spawn(
    npm,
    ['run', 'preview', '-w', '@rb/web', '--', '--host', '--port', String(WEB_PORT), '--strictPort'],
    { cwd: root, env, stdio: 'inherit', shell: true },
  );

  setTimeout(() => {
    console.log('\n[uat] Resource Board UAT is running:');
    console.log(`[uat]   This computer: http://localhost:${WEB_PORT}`);
    for (const ip of lanAddresses())
      console.log(`[uat]   Office network: http://${ip}:${WEB_PORT}`);
    console.log('[uat] If Windows asks, allow Node.js on private networks so others can connect.');
    console.log('[uat] Stop with Ctrl+C.');
  }, 2500);

  const stopAll = () => {
    api.kill();
    web.kill();
    process.exit(0);
  };
  process.on('SIGINT', stopAll);
  process.on('SIGTERM', stopAll);
  api.on('exit', (code) => code && stopAll());
}

const command = process.argv[2];
const actions = { reset, start };
if (!actions[command]) {
  console.error('Usage: node scripts/uat.mjs reset | start');
  process.exit(1);
}
actions[command]().catch((err) => {
  console.error('[uat]', err.message ?? err);
  process.exit(1);
});
