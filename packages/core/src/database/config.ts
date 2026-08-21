/**
 * @file packages/core/src/database/config.ts
 * Database configuration loader and URL sanitizer.
 */

import dotenv from 'dotenv';

// Load .env into process.env if present
dotenv.config();

export interface DatabaseConfig {
  readonly isConfigured: boolean;
  readonly connectionString?: string;
  readonly maskedUrl?: string;
  readonly databaseName?: string;
}

/**
 * Strips password and sensitive credentials from a database URL string.
 * Example: postgresql://user:secret@localhost:5432/mydb -> postgresql://user:***@localhost:5432/mydb
 */
export function maskDatabaseUrl(urlStr: string): string {
  if (!urlStr || typeof urlStr !== 'string') {
    return '';
  }

  try {
    const parsed = new URL(urlStr);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    // If URL parsing fails, mask aggressively via regex
    return urlStr.replace(/(:\/\/[^:]+:)[^@]+(@)/, '$1***$2');
  }
}

/**
 * Validates a PostgreSQL connection URL string.
 */
export function validateDatabaseUrl(urlStr: string): {
  valid: boolean;
  error?: string;
  databaseName?: string;
} {
  if (!urlStr || typeof urlStr !== 'string' || urlStr.trim() === '') {
    return { valid: false, error: 'DATABASE_URL is empty or undefined.' };
  }

  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
      return {
        valid: false,
        error: `Invalid protocol '${parsed.protocol}'. Expected 'postgres:' or 'postgresql:'.`,
      };
    }

    const pathname = parsed.pathname.replace(/^\//, '');
    const databaseName = pathname.length > 0 ? pathname : undefined;

    return { valid: true, databaseName };
  } catch {
    return { valid: false, error: 'Malformed DATABASE_URL string format.' };
  }
}

/**
 * Loads and validates PostgreSQL configuration from process.env.DATABASE_URL.
 */
export function loadDatabaseConfig(): DatabaseConfig {
  const envUrl = process.env['DATABASE_URL'];

  if (!envUrl || envUrl.trim() === '') {
    return {
      isConfigured: false,
    };
  }

  const validation = validateDatabaseUrl(envUrl);
  if (!validation.valid) {
    return {
      isConfigured: false,
      maskedUrl: maskDatabaseUrl(envUrl),
    };
  }

  return {
    isConfigured: true,
    connectionString: envUrl,
    maskedUrl: maskDatabaseUrl(envUrl),
    databaseName: validation.databaseName,
  };
}
