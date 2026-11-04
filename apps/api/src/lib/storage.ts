import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

/**
 * Attachment files on local disk, under UPLOAD_DIR. Each file is stored under a generated key
 * (never the name it was uploaded with), so a file name can't reach outside the folder or
 * overwrite another file.
 */
const KEY = /^[0-9a-f-]{36}$/;

function fileFor(key: string) {
  if (!KEY.test(key)) throw new Error(`Invalid storage key: ${key}`);
  return path.join(config.UPLOAD_DIR, key);
}

/** Store the bytes; returns their storage key. */
export async function saveFile(bytes: Buffer): Promise<string> {
  const key = randomUUID();
  await mkdir(config.UPLOAD_DIR, { recursive: true });
  await writeFile(fileFor(key), bytes, { flag: 'wx' });
  return key;
}

export const openFile = (key: string) => createReadStream(fileFor(key));

/** Delete stored files; ones already gone are ignored, other errors are logged, not thrown. */
export async function removeFiles(keys: string[]) {
  await Promise.all(
    keys.map((key) =>
      rm(fileFor(key), { force: true }).catch((e) =>
        console.error(`Could not delete attachment file ${key}:`, e),
      ),
    ),
  );
}
