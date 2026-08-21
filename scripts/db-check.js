#!/usr/bin/env node

/**
 * @file scripts/db-check.js
 * Standalone PostgreSQL Connectivity & Health Check CLI Tool.
 */

import dotenv from 'dotenv';
import {
  getDatabaseManager,
  closeDatabaseManager,
  maskDatabaseUrl,
} from '../packages/core/dist/index.js';

// Load .env
dotenv.config();

async function main() {
  console.log('=== PostgreSQL Database Health Check ===');

  const rawUrl = process.env['DATABASE_URL'];
  if (!rawUrl || rawUrl.trim() === '') {
    console.error('❌ Error: DATABASE_URL is not set in environment or .env file.');
    console.error('   Please configure DATABASE_URL in .env before running db:check.');
    process.exit(1);
  }

  const masked = maskDatabaseUrl(rawUrl);
  console.log(`Target: ${masked}`);

  const dbManager = getDatabaseManager();
  console.log('Connecting to PostgreSQL connection pool...');

  try {
    const status = await dbManager.getStatus();

    if (status.status === 'connected') {
      console.log('✅ PostgreSQL Connection: SUCCESS');
      if (status.databaseName) {
        console.log(`   Database: ${status.databaseName}`);
      }
      if (status.serverVersion) {
        console.log(`   Server Version: PostgreSQL ${status.serverVersion}`);
      }
      if (status.latencyMs !== undefined) {
        console.log(`   Health Query Latency: ${status.latencyMs} ms`);
      }
      await closeDatabaseManager();
      console.log('Clean shutdown completed.');
      process.exit(0);
    } else if (status.status === 'not-configured') {
      console.error('❌ Error: DATABASE_URL is not configured.');
      await closeDatabaseManager();
      process.exit(1);
    } else {
      console.error('❌ Error: PostgreSQL server is unavailable or connection was refused.');
      await closeDatabaseManager();
      process.exit(1);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown database error';
    console.error(`❌ Database Check Failed: ${message}`);
    await closeDatabaseManager();
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Unexpected CLI failure:', err);
  process.exit(1);
});
