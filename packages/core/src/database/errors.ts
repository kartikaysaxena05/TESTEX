/**
 * @file packages/core/src/database/errors.ts
 * Domain-specific database error classes and error mapping utilities.
 */

export class DatabaseError extends Error {
  readonly code: string;

  constructor(message: string, code = 'DATABASE_ERROR') {
    super(message);
    this.name = 'DatabaseError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DatabaseNotConfiguredError extends DatabaseError {
  constructor(message = 'DATABASE_URL environment variable is not configured.') {
    super(message, 'DATABASE_NOT_CONFIGURED');
    this.name = 'DatabaseNotConfiguredError';
  }
}

export class DatabaseConnectionError extends DatabaseError {
  constructor(message: string) {
    super(message, 'DATABASE_CONNECTION_FAILED');
    this.name = 'DatabaseConnectionError';
  }
}

export class DatabaseQueryError extends DatabaseError {
  constructor(message: string) {
    super(message, 'DATABASE_QUERY_FAILED');
    this.name = 'DatabaseQueryError';
  }
}

/**
 * Maps raw exceptions and Prisma errors into sanitized, privileged DatabaseError instances.
 */
export function mapPrismaError(err: unknown): DatabaseError {
  if (err instanceof DatabaseError) {
    return err;
  }

  const message = err instanceof Error ? err.message : 'Unknown database error';

  if (message.includes('P1000') || message.includes('Authentication failed')) {
    return new DatabaseConnectionError('Database authentication failed.');
  }

  if (
    message.includes('P1001') ||
    message.includes("Can't reach database server") ||
    message.includes('ECONNREFUSED')
  ) {
    return new DatabaseConnectionError('Cannot reach PostgreSQL database server.');
  }

  if (message.includes('P1003') || message.includes('database does not exist')) {
    return new DatabaseConnectionError('Target database does not exist.');
  }

  return new DatabaseError('Database operation failed.');
}
