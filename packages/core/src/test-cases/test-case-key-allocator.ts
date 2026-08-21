import type { Prisma, PrismaClient } from '@prisma/client';
import { TestCaseConcurrencyError } from './test-case-errors.js';

export class TestCaseKeyAllocator {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Allocates the next sequential, human-readable Test Case key for a project (e.g. TC-001).
   * Concurrency-safe via atomic database sequence updates and upsert locking.
   */
  async allocateNextKey(projectId: string, tx?: Prisma.TransactionClient): Promise<string> {
    const execute = async (client: Prisma.TransactionClient): Promise<string> => {
      try {
        const rows = await client.$queryRawUnsafe<Array<{ allocated: number | bigint }>>(
          `INSERT INTO "project_test_case_sequences" ("project_id", "next_value", "updated_at")
           SELECT
             $1::uuid,
             COALESCE(
               (
                 SELECT MAX(
                   CASE
                     WHEN "test_case_key" ~ '^TC-[0-9]+$' THEN SUBSTRING("test_case_key" FROM 4)::integer
                     ELSE 0
                   END
                 ) + 2
                 FROM "test_cases"
                 WHERE "project_id" = $1::uuid
               ),
               2
             ),
             NOW()
           ON CONFLICT ("project_id")
           DO UPDATE SET
             "next_value" = "project_test_case_sequences"."next_value" + 1,
             "updated_at" = NOW()
           RETURNING ("next_value" - 1)::integer AS allocated`,
          projectId,
        );

        if (!rows || rows.length === 0 || rows[0]?.allocated === undefined) {
          throw new TestCaseConcurrencyError('Sequence allocator did not return allocated value.');
        }

        const allocated = Number(rows[0].allocated);
        return `TC-${String(allocated).padStart(3, '0')}`;
      } catch (err) {
        if (err instanceof TestCaseConcurrencyError) {
          throw err;
        }
        throw new TestCaseConcurrencyError(
          `Failed to allocate test case key: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    };

    if (tx) {
      return execute(tx);
    }

    return this.prisma.$transaction(execute);
  }
}
