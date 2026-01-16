import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './server/db/schema.ts',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_PATH || './data/mandu.db',
  },
});
