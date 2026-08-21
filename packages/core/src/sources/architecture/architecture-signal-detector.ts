/**
 * @file packages/core/src/sources/architecture/architecture-signal-detector.ts
 * Discovers conservative, evidence-backed architectural patterns and structural signals.
 */

import type {
  ArchitectureSignalDto,
  StructuralAreaDto,
  FrameworkProfileDto,
} from '@ai-quality/contracts';

export class ArchitectureSignalDetector {
  /**
   * Identifies conservative structural signals from discovered areas and framework profiles.
   */
  detectSignals(
    areas: readonly StructuralAreaDto[],
    frameworkProfile: FrameworkProfileDto | null,
  ): readonly ArchitectureSignalDto[] {
    const signals: ArchitectureSignalDto[] = [];
    const areaPaths = new Set(areas.map(a => a.relativePath.toLowerCase()));

    const frameworks = new Set((frameworkProfile?.frameworks ?? []).map(f => f.id.toLowerCase()));

    // 1. Monorepo Structure Signal
    const appAreas = areas.filter(
      a => a.relativePath.startsWith('apps/') || a.relativePath.startsWith('packages/'),
    );
    if (appAreas.length >= 2) {
      signals.push({
        kind: 'MONOREPO_STRUCTURE',
        title: 'Monorepo Workspace Structure',
        confidence: 'HIGH',
        description:
          'Repository contains multiple segregated application units or workspace packages.',
        evidence: appAreas.map(a => ({
          kind: 'FILE_PATH',
          source: a.relativePath,
          detail: `Workspace package/unit: ${a.relativePath} (${a.fileCount} files)`,
        })),
      });
    }

    // 2. Frontend / Backend Split Signal
    const hasWebArea =
      areaPaths.has('frontend') ||
      areaPaths.has('client') ||
      areaPaths.has('apps/web') ||
      areaPaths.has('web');
    const hasApiArea =
      areaPaths.has('backend') ||
      areaPaths.has('server') ||
      areaPaths.has('apps/api') ||
      areaPaths.has('api');
    if (
      (hasWebArea && hasApiArea) ||
      (appAreas.some(a => a.name === 'web') && appAreas.some(a => a.name === 'api'))
    ) {
      signals.push({
        kind: 'FRONTEND_BACKEND_SPLIT',
        title: 'Frontend / Backend Segregation',
        confidence: 'HIGH',
        description:
          'Distinct directories or application units separated for frontend client UI and backend services.',
        evidence: [
          {
            kind: 'FILE_PATH',
            source: 'structure',
            detail: 'Separate frontend and backend top-level/workspace directories detected',
          },
        ],
      });
    }

    // 3. Layered Architecture Signal (Controllers + Services + Repositories)
    const hasControllers = areaPaths.has('controllers') || areaPaths.has('src/controllers');
    const hasServices = areaPaths.has('services') || areaPaths.has('src/services');
    const hasRepositories =
      areaPaths.has('repositories') ||
      areaPaths.has('src/repositories') ||
      areaPaths.has('models') ||
      areaPaths.has('src/models');
    if (hasControllers && hasServices && hasRepositories) {
      signals.push({
        kind: 'LAYERED_STRUCTURE',
        title: 'Layered Service/Repository Pattern',
        confidence: 'HIGH',
        description:
          'Organized into controllers, business services, and data persistence/repository layers.',
        evidence: [
          { kind: 'FILE_PATH', source: 'src/controllers', detail: 'Controllers layer present' },
          { kind: 'FILE_PATH', source: 'src/services', detail: 'Services layer present' },
          {
            kind: 'FILE_PATH',
            source: 'src/repositories',
            detail: 'Repositories/models layer present',
          },
        ],
      });
    }

    // 4. MVC-Like Structure Signal (Controllers + Models + Views)
    const hasViews =
      areaPaths.has('views') ||
      areaPaths.has('src/views') ||
      areaPaths.has('components') ||
      areaPaths.has('src/components');
    if (
      hasControllers &&
      hasRepositories &&
      hasViews &&
      !signals.some(s => s.kind === 'LAYERED_STRUCTURE')
    ) {
      signals.push({
        kind: 'MVC_LIKE_STRUCTURE',
        title: 'MVC-Like Structural Pattern',
        confidence: 'MEDIUM',
        description: 'Structural organization matches Model-View-Controller functional separation.',
        evidence: [
          { kind: 'FILE_PATH', source: 'controllers', detail: 'Controllers directory present' },
          { kind: 'FILE_PATH', source: 'models', detail: 'Models directory present' },
          { kind: 'FILE_PATH', source: 'views', detail: 'Views/components directory present' },
        ],
      });
    }

    // 5. Domain-Oriented / Clean-Like Layering Signal (Domain + Infrastructure / Application)
    const hasDomain = areaPaths.has('domain') || areaPaths.has('src/domain');
    const hasInfra =
      areaPaths.has('infrastructure') ||
      areaPaths.has('src/infrastructure') ||
      areaPaths.has('infra');
    const hasAppLayer = areaPaths.has('application') || areaPaths.has('src/application');
    if (hasDomain && (hasInfra || hasAppLayer)) {
      signals.push({
        kind: 'DOMAIN_ORIENTED_STRUCTURE',
        title: 'Domain-Oriented / Clean Layering',
        confidence: 'MEDIUM',
        description: 'Repository adopts domain-driven or clean architecture layer segregation.',
        evidence: [
          { kind: 'FILE_PATH', source: 'domain', detail: 'Core domain directory present' },
          {
            kind: 'FILE_PATH',
            source: 'infrastructure',
            detail: 'Infrastructure/application directory present',
          },
        ],
      });
    }

    // 6. Feature-Based Structure Signal (features/ or modules/ with multiple subdirectories)
    const featureAreas = areas.filter(
      a => a.relativePath.startsWith('features/') || a.relativePath.startsWith('src/features/'),
    );
    if (featureAreas.length >= 2 || areaPaths.has('features') || areaPaths.has('src/features')) {
      signals.push({
        kind: 'FEATURE_BASED_STRUCTURE',
        title: 'Feature-Based Modular Structure',
        confidence: 'MEDIUM',
        description:
          'Codebase organized around vertical feature slices or bounded feature modules.',
        evidence: [
          { kind: 'FILE_PATH', source: 'features', detail: 'Feature directory slices detected' },
        ],
      });
    }

    // 7. Framework Conventional Structure (Next.js, NestJS, etc.)
    if (frameworks.has('nextjs') || frameworks.has('next')) {
      signals.push({
        kind: 'FRAMEWORK_CONVENTIONAL_STRUCTURE',
        title: 'Next.js App/Pages Convention',
        confidence: 'HIGH',
        description: 'Follows official Next.js routing and component conventions.',
        evidence: [
          { kind: 'FRAMEWORK', source: 'Next.js', detail: 'Next.js framework structure verified' },
        ],
      });
    } else if (frameworks.has('nestjs') || frameworks.has('@nestjs/core')) {
      signals.push({
        kind: 'FRAMEWORK_CONVENTIONAL_STRUCTURE',
        title: 'NestJS Modular Architecture',
        confidence: 'HIGH',
        description: 'Structured around NestJS dependency-injected module architecture.',
        evidence: [
          { kind: 'FRAMEWORK', source: 'NestJS', detail: 'NestJS framework structure verified' },
        ],
      });
    }

    return signals;
  }
}
