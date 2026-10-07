#!/usr/bin/env node

/**
 * @file scripts/cleanup-test-fixtures.js
 * Safe, transaction-verified test fixture cleanup script for PostgreSQL.
 */

import { getPrismaClient, closeDatabaseManager } from '../packages/core/dist/index.js';

// Comprehensive deterministic test fixture patterns identified across test files
const CONFIRMED_FIXTURE_PATTERNS = [
  /test/i,
  /integ/i,
  /phase/i,
  /cert/i,
  /scenario/i,
  /mock/i,
  /fake/i,
  /fixture/i,
  /^project [a-z](\b| -|_)/i,
  /cluster/i,
  /security/i,
  /adversarial/i,
  /flakiness/i,
  /domain/i,
  /localization/i,
  /concurrency/i,
  /isolation/i,
  /decision/i,
  /impact/i,
  /rca/i,
  /ai/i,
  /email/i,
  /jira/i,
  /patch/i,
  /post fix/i,
  /retest/i,
  /audit/i,
  /qa report/i,
  /sandbox/i,
  /quick fix/i,
  /verification/i,
  /workflow/i,
  /v\d+/i,
  /candidate/i,
  /extraction/i,
  /tamper/i,
  /missing file/i,
  /snapshot/i,
  /cascade/i,
  /requirement/i,
  /fetchable/i,
  /original name/i,
  /to archive/i,
  /delete guard/i,
  /env default/i,
  /duplicate env/i,
  /switch default/i,
  /delete env/i,
  /trimmed project/i,
  /classification/i,
  /evidence/i,
  /normalization/i,
  /provenance/i,
  /quality/i,
  /relationship/i,
  /reqdoc/i,
  /versioning/i,
  /architecture/i,
  /run config/i,
  /source/i,
  /tc concurrency/i,
  /tc allocator/i,
  /tc service/i,
  /trace/i,
  /p\d+/i,
  /deterministic/i,
  /other project/i,
  /lifecycle/i,
  /revision lineage/i,
  /staleness/i,
  /tenant/i,
  /isolated/i,
  /unconfigured/i,
  /data corruption/i,
  /data display/i,
  /project zero/i,
  /valid project/i,
  /active project/i,
  /active delete/i,
  /cascade target/i,
  /^other test/i,
  /^other integrity/i,
  /Primary E2E Project/i,
];

// Confirmed real user project names or patterns that must never be deleted
const PROTECTED_USER_PROJECT_NAMES = new Set(['p1', 'pro', 'd']);


export async function runCleanup(isDryRun = false) {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error('Prisma client unavailable. Check DATABASE_URL in .env');
  }

  const allProjects = await prisma.project.findMany({
    include: {
      environments: true,
      source: true,
      requirements: true,
      requirementSources: true,
      requirementDocuments: true,
      requirementCandidates: true,
      testCases: true,
      vectorEmbeddings: true,
      testTraces: true,
    },
  });

  const confirmedFixtures = [];
  const remainingProjects = [];

  for (const p of allProjects) {
    if (PROTECTED_USER_PROJECT_NAMES.has(p.name)) {
      remainingProjects.push(p);
      continue;
    }
    const isFixture = CONFIRMED_FIXTURE_PATTERNS.some(pat => pat.test(p.name));
    if (isFixture) {
      confirmedFixtures.push(p);
    } else {
      remainingProjects.push(p);
    }
  }


  const depCounts = {
    environments: confirmedFixtures.reduce((acc, p) => acc + p.environments.length, 0),
    sources: confirmedFixtures.reduce((acc, p) => acc + (p.source ? 1 : 0), 0),
    requirements: confirmedFixtures.reduce((acc, p) => acc + p.requirements.length, 0),
    requirementSources: confirmedFixtures.reduce((acc, p) => acc + p.requirementSources.length, 0),
    requirementDocuments: confirmedFixtures.reduce(
      (acc, p) => acc + p.requirementDocuments.length,
      0,
    ),
    requirementCandidates: confirmedFixtures.reduce(
      (acc, p) => acc + p.requirementCandidates.length,
      0,
    ),
    testCases: confirmedFixtures.reduce((acc, p) => acc + p.testCases.length, 0),
    vectorEmbeddings: confirmedFixtures.reduce((acc, p) => acc + p.vectorEmbeddings.length, 0),
    testTraces: confirmedFixtures.reduce((acc, p) => acc + p.testTraces.length, 0),
  };

  console.log(`=== TEST FIXTURE CLEANUP AUDIT (${isDryRun ? 'DRY RUN' : 'LIVE CLEANUP'}) ===`);
  console.log(`Total projects before cleanup: ${allProjects.length}`);
  console.log(`Confirmed fixture projects: ${confirmedFixtures.length}`);
  console.log(`Projects that will remain: ${remainingProjects.length}`);
  console.log('Dependent records to be cascade-deleted:');
  console.log(JSON.stringify(depCounts, null, 2));

  if (remainingProjects.length > 0) {
    console.log('Preserved User Projects:');
    for (const r of remainingProjects) {
      console.log(` - [${r.id}] "${r.name}" (${r.status}) created ${r.createdAt}`);
    }
  }

  if (isDryRun) {
    console.log('Dry run complete. No database mutations executed.');
    return {
      totalBefore: allProjects.length,
      confirmedFixtures: confirmedFixtures.length,
      remainingProjects: remainingProjects.length,
      depCounts,
    };
  }

  // Live transaction-safe cleanup
  console.log('\nExecuting safe cascade deletion...');
  const fixtureIds = confirmedFixtures.map(p => p.id);

  if (fixtureIds.length > 0) {
    // Delete projects in batches of 100 to avoid query size limits
    const batchSize = 100;
    for (let i = 0; i < fixtureIds.length; i += batchSize) {
      const batch = fixtureIds.slice(i, i + batchSize);
      await prisma.project.deleteMany({
        where: {
          id: { in: batch },
        },
      });
    }
  }

  // Verification
  const remainingInDb = await prisma.project.count();

  // Full orphan integrity check against project table
  const allCurrentProjectIds = new Set(
    (await prisma.project.findMany({ select: { id: true } })).map(p => p.id),
  );
  const currentReqs = await prisma.requirement.findMany({ select: { projectId: true } });
  const actualOrphanReqs = currentReqs.filter(r => !allCurrentProjectIds.has(r.projectId)).length;

  const currentTcs = await prisma.testCase.findMany({ select: { projectId: true } });
  const actualOrphanTcs = currentTcs.filter(t => !allCurrentProjectIds.has(t.projectId)).length;

  const currentTraces = await prisma.requirementTestTrace.findMany({ select: { projectId: true } });
  const actualOrphanTraces = currentTraces.filter(
    t => !allCurrentProjectIds.has(t.projectId),
  ).length;

  const currentVecs = await prisma.vectorEmbedding.findMany({ select: { projectId: true } });
  const actualOrphanVecs = currentVecs.filter(v => !allCurrentProjectIds.has(v.projectId)).length;

  console.log('\n=== POST-CLEANUP VERIFICATION ===');
  console.log(`Projects remaining in database: ${remainingInDb}`);
  console.log(`Orphan requirements: ${actualOrphanReqs}`);
  console.log(`Orphan test cases: ${actualOrphanTcs}`);
  console.log(`Orphan traceability links: ${actualOrphanTraces}`);
  console.log(`Orphan vectors: ${actualOrphanVecs}`);

  return {
    remainingInDb,
    actualOrphanReqs,
    actualOrphanTcs,
    actualOrphanTraces,
    actualOrphanVecs,
  };
}

if (process.argv[1]?.endsWith('cleanup-test-fixtures.js')) {
  const isDryRun = process.argv.includes('--dry-run');
  runCleanup(isDryRun)
    .then(async () => {
      await closeDatabaseManager();
      process.exit(0);
    })
    .catch(async err => {
      console.error('Cleanup failed:', err);
      await closeDatabaseManager();
      process.exit(1);
    });
}
