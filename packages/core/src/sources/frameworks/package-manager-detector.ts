/**
 * @file packages/core/src/sources/frameworks/package-manager-detector.ts
 * Evidence-based package manager detection with explicit conflict handling.
 */

import type { SourceStructureEntryDto, PackageManagerDto } from '@ai-quality/contracts';
import { RECOGNIZED_LOCKFILES } from './manifest-allowlist.js';

export class PackageManagerDetector {
  detect(
    entries: readonly SourceStructureEntryDto[],
    packageManagerField?: string,
  ): PackageManagerDto | null {
    const fileEntries = entries.filter(e => e.kind === 'FILE');
    const detectedLockfiles = new Map<string, string[]>(); // packageManager -> lockfile paths

    for (const file of fileEntries) {
      const fileName = file.name;
      for (const spec of RECOGNIZED_LOCKFILES) {
        if (spec.filenamePattern.test(fileName)) {
          const list = detectedLockfiles.get(spec.packageManager) ?? [];
          list.push(file.relativePath);
          detectedLockfiles.set(spec.packageManager, list);
        }
      }
    }

    // Node ecosystem lockfile conflict check
    const nodePMs = ['npm', 'Yarn', 'pnpm'].filter(pm => detectedLockfiles.has(pm));
    if (nodePMs.length > 1) {
      const allEvidence: string[] = [];
      for (const pm of nodePMs) {
        allEvidence.push(...(detectedLockfiles.get(pm) ?? []));
      }
      if (packageManagerField) {
        allEvidence.push(`package.json packageManager: "${packageManagerField}"`);
      }

      return {
        name: 'Ambiguous (Multiple Lockfiles)',
        confidence: 'LOW',
        isAmbiguous: true,
        evidence: allEvidence,
      };
    }

    // If packageManager field is specified in package.json (e.g. "pnpm@9.0.0")
    if (packageManagerField) {
      const pmName = packageManagerField.split('@')[0]!;
      const evidence = [`package.json packageManager: "${packageManagerField}"`];
      const matchingLock = detectedLockfiles.get(pmName);
      if (matchingLock) {
        evidence.push(...matchingLock);
      }

      return {
        name: pmName,
        confidence: 'HIGH',
        isAmbiguous: false,
        evidence,
      };
    }

    // Single lockfile detected
    if (detectedLockfiles.size === 1) {
      const [name, files] = Array.from(detectedLockfiles.entries())[0]!;
      return {
        name,
        confidence: 'HIGH',
        isAmbiguous: false,
        evidence: files,
      };
    }

    // Fallback: infer from ecosystem manifests if no lockfile
    const hasPackageJson = fileEntries.some(f => f.name.toLowerCase() === 'package.json');
    if (hasPackageJson) {
      return {
        name: 'npm',
        confidence: 'MEDIUM',
        isAmbiguous: false,
        evidence: ['package.json (default Node.js package manager)'],
      };
    }

    const hasCargo = fileEntries.some(f => f.name.toLowerCase() === 'cargo.toml');
    if (hasCargo) {
      return {
        name: 'Cargo',
        confidence: 'HIGH',
        isAmbiguous: false,
        evidence: ['Cargo.toml'],
      };
    }

    const hasPom = fileEntries.some(f => f.name.toLowerCase() === 'pom.xml');
    if (hasPom) {
      return {
        name: 'Maven',
        confidence: 'HIGH',
        isAmbiguous: false,
        evidence: ['pom.xml'],
      };
    }

    const hasGradle = fileEntries.some(f => f.name.toLowerCase().startsWith('build.gradle'));
    if (hasGradle) {
      return {
        name: 'Gradle',
        confidence: 'HIGH',
        isAmbiguous: false,
        evidence: ['build.gradle'],
      };
    }

    return null;
  }
}
