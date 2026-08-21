/**
 * @file packages/core/src/sources/architecture/application-kind-detector.ts
 * Deterministic detection of high-level application kinds and application units.
 */

import type {
  ApplicationKind,
  ArchitectureConfidence,
  ApplicationKindDetectionDto,
  ApplicationUnitDto,
  EntryPointCandidateDto,
  FrameworkProfileDto,
  TechnologyProfileDto,
  StructuralAreaDto,
} from '@ai-quality/contracts';
import { MAX_APPLICATION_UNITS } from './architecture-types.js';

export interface ApplicationKindContext {
  readonly frameworkProfile: FrameworkProfileDto | null;
  readonly technologyProfile: TechnologyProfileDto | null;
  readonly structuralAreas: readonly StructuralAreaDto[];
  readonly entryCandidates: readonly EntryPointCandidateDto[];
}

export class ApplicationKindDetector {
  /**
   * Discovers application units (especially for monorepos or segregated applications).
   */
  detectApplicationUnits(
    areas: readonly StructuralAreaDto[],
    entryCandidates: readonly EntryPointCandidateDto[],
    frameworkProfile: FrameworkProfileDto | null,
  ): readonly ApplicationUnitDto[] {
    const units: ApplicationUnitDto[] = [];
    const appAreas = areas.filter(
      a => a.relativePath.startsWith('apps/') || a.relativePath.startsWith('packages/'),
    );

    for (const area of appAreas) {
      const unitEntries = entryCandidates.filter(e => e.relativePath.startsWith(area.relativePath));
      let unitKind: ApplicationKind = 'UNKNOWN';
      const name = area.name.toLowerCase();

      if (
        name.includes('web') ||
        name.includes('client') ||
        name.includes('frontend') ||
        name.includes('ui')
      ) {
        unitKind = 'WEB_FRONTEND';
      } else if (
        name.includes('api') ||
        name.includes('server') ||
        name.includes('backend') ||
        name.includes('service')
      ) {
        unitKind = 'WEB_BACKEND';
      } else if (area.relativePath.startsWith('packages/')) {
        unitKind = 'LIBRARY';
      }

      units.push({
        id: area.relativePath,
        name: area.name,
        relativeRoot: area.relativePath,
        kind: unitKind,
        primaryFramework: frameworkProfile?.primaryEcosystem ?? null,
        entryPoints: unitEntries,
      });
    }

    return units.slice(0, MAX_APPLICATION_UNITS);
  }

  /**
   * Infers primary application kind and detailed kind detections based on evidence.
   */
  detectKinds(ctx: ApplicationKindContext): {
    primaryKind: ApplicationKind;
    confidence: ArchitectureConfidence;
    applicationKinds: readonly ApplicationKindDetectionDto[];
  } {
    const detections: ApplicationKindDetectionDto[] = [];
    const frameworks = new Set(
      (ctx.frameworkProfile?.frameworks ?? []).map(f => f.id.toLowerCase()),
    );

    const appAreas = ctx.structuralAreas.filter(
      a => a.relativePath.startsWith('apps/') || a.relativePath.startsWith('packages/'),
    );

    const frontendFrameworks = ['react', 'vue', 'angular', 'svelte', 'solid', 'vite'];
    const backendFrameworks = [
      'nestjs',
      '@nestjs/core',
      'express',
      'fastapi',
      'django',
      'flask',
      'spring',
      'springboot',
      'aspnet',
      'gin',
      'rocket',
    ];
    const fullstackFrameworks = ['nextjs', 'next', 'nuxt', 'sveltekit', 'remix', 'astro'];

    const hasFrontend = frontendFrameworks.some(f => frameworks.has(f));
    const hasBackend = backendFrameworks.some(f => frameworks.has(f));
    const hasFullstack = fullstackFrameworks.some(f => frameworks.has(f));
    const isMonorepo = appAreas.length >= 2;

    // 1. Monorepo / Multi-Application
    if (isMonorepo) {
      detections.push({
        kind: 'MULTI_APPLICATION',
        confidence: 'HIGH',
        evidence: appAreas.map(a => ({
          kind: 'FILE_PATH',
          source: a.relativePath,
          detail: `Segregated application/package workspace: ${a.relativePath}`,
        })),
      });
    }

    // 2. Full-Stack Web
    if (hasFullstack || (hasFrontend && hasBackend && !isMonorepo)) {
      detections.push({
        kind: 'FULL_STACK_WEB',
        confidence: 'HIGH',
        evidence: [
          {
            kind: 'FRAMEWORK',
            source: 'framework-profile',
            detail: hasFullstack
              ? 'Full-stack framework detected (e.g. Next.js / Nuxt / Remix)'
              : 'Both client UI framework and server backend framework detected in single repository',
          },
        ],
      });
    }

    // 3. Web Frontend
    if (hasFrontend && !hasBackend && !hasFullstack) {
      detections.push({
        kind: 'WEB_FRONTEND',
        confidence: 'HIGH',
        evidence: [
          {
            kind: 'FRAMEWORK',
            source: 'framework-profile',
            detail: 'Client UI framework detected (React/Vue/Angular/Vite) without backend',
          },
        ],
      });
    }

    // 4. Web Backend
    if (hasBackend && !hasFrontend && !hasFullstack) {
      detections.push({
        kind: 'WEB_BACKEND',
        confidence: 'HIGH',
        evidence: [
          {
            kind: 'FRAMEWORK',
            source: 'framework-profile',
            detail:
              'HTTP server backend framework detected (NestJS/Express/FastAPI/Django/Spring Boot)',
          },
        ],
      });
    }

    // 5. Desktop (Electron / Tauri)
    if (frameworks.has('electron') || frameworks.has('tauri')) {
      detections.push({
        kind: 'DESKTOP',
        confidence: 'HIGH',
        evidence: [
          {
            kind: 'FRAMEWORK',
            source: 'framework-profile',
            detail: 'Desktop application framework detected (Electron / Tauri)',
          },
        ],
      });
    }

    // 6. Mobile (Flutter / React Native)
    if (frameworks.has('flutter') || frameworks.has('react-native')) {
      detections.push({
        kind: 'MOBILE',
        confidence: 'HIGH',
        evidence: [
          {
            kind: 'FRAMEWORK',
            source: 'framework-profile',
            detail: 'Mobile SDK/framework detected (Flutter / React Native)',
          },
        ],
      });
    }

    // 7. Library / Package
    const isLibraryOnly =
      !hasFrontend &&
      !hasBackend &&
      !hasFullstack &&
      ctx.entryCandidates.length > 0 &&
      ctx.entryCandidates.every(e => e.kind === 'LIBRARY');

    if (isLibraryOnly) {
      detections.push({
        kind: 'LIBRARY',
        confidence: 'HIGH',
        evidence: [
          {
            kind: 'FILE_PATH',
            source: 'entry-candidates',
            detail: 'Library/crate root detected without runnable application entry points',
          },
        ],
      });
    }

    // 8. Unknown / Fallback
    if (detections.length === 0) {
      detections.push({
        kind: 'UNKNOWN',
        confidence: 'LOW',
        evidence: [
          {
            kind: 'FILE_PATH',
            source: 'structure',
            detail:
              'Insufficient evidence to categorize application architecture kind with confidence',
          },
        ],
      });
    }

    const primary = detections[0]!;
    return {
      primaryKind: primary.kind,
      confidence: primary.confidence,
      applicationKinds: detections,
    };
  }
}
