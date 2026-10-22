import { createApp } from './app.js';
import { config } from './config.js';
import { prisma } from './lib/prisma.js';

const app = createApp();

// Express 5 passes listen errors (e.g. EADDRINUSE) to the callback instead of throwing.
const server = app.listen(config.PORT, (err?: Error) => {
  if (err) {
    console.error(`Failed to start API on port ${config.PORT}: ${err.message}`);
    process.exit(1);
  }
  console.log(`API listening on http://localhost:${config.PORT} (${config.NODE_ENV})`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
