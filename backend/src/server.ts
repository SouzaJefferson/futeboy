import { app } from './app.js';
import { env } from './config/env.js';
import { db } from './config/db.js';
await db.$connect();
const server = app.listen(env.PORT, '127.0.0.1', () => console.log(`Futeboy API: http://localhost:${env.PORT}/api/health`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  server.close(() => { void db.$disconnect().then(() => process.exit(0)); });
});
