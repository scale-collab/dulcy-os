import { createPool, migrate } from './pool.js';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL must be set'); process.exit(1); }
const db = createPool(url);
await migrate(db);
await db.end();
console.log('schema up to date');
