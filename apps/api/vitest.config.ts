import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret',
      // Attachment files from the tests go to a temporary folder, not apps/api/uploads.
      UPLOAD_DIR: path.join(os.tmpdir(), 'sedhub-test-uploads'),
      MAX_UPLOAD_MB: '1',
    },
  },
});
