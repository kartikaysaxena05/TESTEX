/**
 * @file packages/core/src/sources/frameworks/framework-registry.ts
 * Centralized, declarative catalog of framework detection rules.
 */

import type {
  FrameworkCategory,
  DependencyDto,
  SourceStructureEntryDto,
  DetectionEvidenceDto,
  LanguageConfidence,
} from '@ai-quality/contracts';

export interface FrameworkRuleMatch {
  readonly matched: boolean;
  readonly declaredVersion: string | null;
  readonly confidence: LanguageConfidence;
  readonly evidence: readonly DetectionEvidenceDto[];
}

export interface FrameworkRule {
  readonly id: string;
  readonly name: string;
  readonly category: FrameworkCategory;
  readonly match: (
    dependencies: readonly DependencyDto[],
    entries: readonly SourceStructureEntryDto[],
  ) => FrameworkRuleMatch;
}

function findDep(deps: readonly DependencyDto[], ...names: string[]): DependencyDto | undefined {
  const lowerNames = names.map(n => n.toLowerCase());
  return deps.find(d => lowerNames.includes(d.name.toLowerCase()));
}

function findConfigFile(
  entries: readonly SourceStructureEntryDto[],
  pattern: RegExp,
): SourceStructureEntryDto | undefined {
  return entries.find(e => e.kind === 'FILE' && pattern.test(e.name));
}

export const FRAMEWORK_RULES: readonly FrameworkRule[] = [
  // --- Frontend Web Frameworks & UI Libraries ---
  {
    id: 'nextjs',
    name: 'Next.js',
    category: 'FRAMEWORK',
    match: (deps, entries) => {
      const nextDep = findDep(deps, 'next');
      const configFile = findConfigFile(entries, /^next\.config\.(js|cjs|mjs|ts)$/i);
      const evidence: DetectionEvidenceDto[] = [];

      if (nextDep) {
        evidence.push({
          kind: nextDep.scope === 'DEVELOPMENT' ? 'DEV_DEPENDENCY' : 'DEPENDENCY',
          source: nextDep.sourceManifest,
          detail: `next: ${nextDep.declaredVersion || 'declared'}`,
        });
      }
      if (configFile) {
        evidence.push({
          kind: 'CONFIG_FILE',
          source: configFile.relativePath,
          detail: 'Next.js configuration file',
        });
      }

      if (nextDep) {
        return {
          matched: true,
          declaredVersion: nextDep.declaredVersion,
          confidence: 'HIGH',
          evidence,
        };
      }
      if (configFile) {
        return { matched: true, declaredVersion: null, confidence: 'MEDIUM', evidence };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },
  {
    id: 'react',
    name: 'React',
    category: 'UI_LIBRARY',
    match: deps => {
      const reactDep = findDep(deps, 'react');
      const domDep = findDep(deps, 'react-dom');
      const evidence: DetectionEvidenceDto[] = [];

      if (reactDep) {
        evidence.push({
          kind: reactDep.scope === 'DEVELOPMENT' ? 'DEV_DEPENDENCY' : 'DEPENDENCY',
          source: reactDep.sourceManifest,
          detail: `react: ${reactDep.declaredVersion || 'declared'}`,
        });
      }
      if (domDep) {
        evidence.push({
          kind: domDep.scope === 'DEVELOPMENT' ? 'DEV_DEPENDENCY' : 'DEPENDENCY',
          source: domDep.sourceManifest,
          detail: `react-dom: ${domDep.declaredVersion || 'declared'}`,
        });
      }

      if (reactDep) {
        return {
          matched: true,
          declaredVersion: reactDep.declaredVersion,
          confidence: 'HIGH',
          evidence,
        };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },
  {
    id: 'angular',
    name: 'Angular',
    category: 'FRAMEWORK',
    match: (deps, entries) => {
      const angularDep = findDep(deps, '@angular/core');
      const configFile = findConfigFile(entries, /^angular\.json$/i);
      const evidence: DetectionEvidenceDto[] = [];

      if (angularDep) {
        evidence.push({
          kind: 'DEPENDENCY',
          source: angularDep.sourceManifest,
          detail: `@angular/core: ${angularDep.declaredVersion || 'declared'}`,
        });
      }
      if (configFile) {
        evidence.push({
          kind: 'CONFIG_FILE',
          source: configFile.relativePath,
          detail: 'Angular CLI workspace configuration',
        });
      }

      if (angularDep) {
        return {
          matched: true,
          declaredVersion: angularDep.declaredVersion,
          confidence: 'HIGH',
          evidence,
        };
      }
      if (configFile) {
        return { matched: true, declaredVersion: null, confidence: 'MEDIUM', evidence };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },
  {
    id: 'vue',
    name: 'Vue.js',
    category: 'FRAMEWORK',
    match: deps => {
      const vueDep = findDep(deps, 'vue');
      if (vueDep) {
        return {
          matched: true,
          declaredVersion: vueDep.declaredVersion,
          confidence: 'HIGH',
          evidence: [
            {
              kind: 'DEPENDENCY',
              source: vueDep.sourceManifest,
              detail: `vue: ${vueDep.declaredVersion || 'declared'}`,
            },
          ],
        };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },
  {
    id: 'nuxt',
    name: 'Nuxt',
    category: 'FRAMEWORK',
    match: (deps, entries) => {
      const nuxtDep = findDep(deps, 'nuxt', 'nuxt3', '@nuxt/kit');
      const configFile = findConfigFile(entries, /^nuxt\.config\.(js|ts|mjs)$/i);
      const evidence: DetectionEvidenceDto[] = [];

      if (nuxtDep) {
        evidence.push({
          kind: 'DEPENDENCY',
          source: nuxtDep.sourceManifest,
          detail: `${nuxtDep.name}: ${nuxtDep.declaredVersion || 'declared'}`,
        });
      }
      if (configFile) {
        evidence.push({
          kind: 'CONFIG_FILE',
          source: configFile.relativePath,
          detail: 'Nuxt configuration file',
        });
      }

      if (nuxtDep) {
        return {
          matched: true,
          declaredVersion: nuxtDep.declaredVersion,
          confidence: 'HIGH',
          evidence,
        };
      }
      if (configFile) {
        return { matched: true, declaredVersion: null, confidence: 'MEDIUM', evidence };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },
  {
    id: 'svelte',
    name: 'Svelte',
    category: 'UI_LIBRARY',
    match: deps => {
      const svelteDep = findDep(deps, 'svelte');
      if (svelteDep) {
        return {
          matched: true,
          declaredVersion: svelteDep.declaredVersion,
          confidence: 'HIGH',
          evidence: [
            {
              kind: 'DEPENDENCY',
              source: svelteDep.sourceManifest,
              detail: `svelte: ${svelteDep.declaredVersion || 'declared'}`,
            },
          ],
        };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },
  {
    id: 'sveltekit',
    name: 'SvelteKit',
    category: 'FRAMEWORK',
    match: (deps, entries) => {
      const kitDep = findDep(deps, '@sveltejs/kit');
      const configFile = findConfigFile(entries, /^svelte\.config\.(js|ts|cjs|mjs)$/i);
      const evidence: DetectionEvidenceDto[] = [];

      if (kitDep) {
        evidence.push({
          kind: 'DEPENDENCY',
          source: kitDep.sourceManifest,
          detail: `@sveltejs/kit: ${kitDep.declaredVersion || 'declared'}`,
        });
      }
      if (configFile) {
        evidence.push({
          kind: 'CONFIG_FILE',
          source: configFile.relativePath,
          detail: 'Svelte configuration file',
        });
      }

      if (kitDep) {
        return {
          matched: true,
          declaredVersion: kitDep.declaredVersion,
          confidence: 'HIGH',
          evidence,
        };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },
  {
    id: 'remix',
    name: 'Remix',
    category: 'FRAMEWORK',
    match: deps => {
      const remixDep = findDep(deps, '@remix-run/react', '@remix-run/node');
      if (remixDep) {
        return {
          matched: true,
          declaredVersion: remixDep.declaredVersion,
          confidence: 'HIGH',
          evidence: [
            {
              kind: 'DEPENDENCY',
              source: remixDep.sourceManifest,
              detail: `${remixDep.name}: ${remixDep.declaredVersion || 'declared'}`,
            },
          ],
        };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },
  {
    id: 'astro',
    name: 'Astro',
    category: 'FRAMEWORK',
    match: (deps, entries) => {
      const astroDep = findDep(deps, 'astro');
      const configFile = findConfigFile(entries, /^astro\.config\.(js|mjs|ts)$/i);
      const evidence: DetectionEvidenceDto[] = [];

      if (astroDep) {
        evidence.push({
          kind: 'DEPENDENCY',
          source: astroDep.sourceManifest,
          detail: `astro: ${astroDep.declaredVersion || 'declared'}`,
        });
      }
      if (configFile) {
        evidence.push({
          kind: 'CONFIG_FILE',
          source: configFile.relativePath,
          detail: 'Astro configuration file',
        });
      }

      if (astroDep) {
        return {
          matched: true,
          declaredVersion: astroDep.declaredVersion,
          confidence: 'HIGH',
          evidence,
        };
      }
      if (configFile) {
        return { matched: true, declaredVersion: null, confidence: 'MEDIUM', evidence };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },

  // --- Backend Web Frameworks ---
  {
    id: 'express',
    name: 'Express',
    category: 'FRAMEWORK',
    match: deps => {
      const dep = findDep(deps, 'express');
      if (dep) {
        return {
          matched: true,
          declaredVersion: dep.declaredVersion,
          confidence: 'HIGH',
          evidence: [
            {
              kind: 'DEPENDENCY',
              source: dep.sourceManifest,
              detail: `express: ${dep.declaredVersion || 'declared'}`,
            },
          ],
        };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },
  {
    id: 'nestjs',
    name: 'NestJS',
    category: 'FRAMEWORK',
    match: deps => {
      const dep = findDep(deps, '@nestjs/core');
      if (dep) {
        return {
          matched: true,
          declaredVersion: dep.declaredVersion,
          confidence: 'HIGH',
          evidence: [
            {
              kind: 'DEPENDENCY',
              source: dep.sourceManifest,
              detail: `@nestjs/core: ${dep.declaredVersion || 'declared'}`,
            },
          ],
        };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },
  {
    id: 'fastify',
    name: 'Fastify',
    category: 'FRAMEWORK',
    match: deps => {
      const dep = findDep(deps, 'fastify');
      if (dep) {
        return {
          matched: true,
          declaredVersion: dep.declaredVersion,
          confidence: 'HIGH',
          evidence: [
            {
              kind: 'DEPENDENCY',
              source: dep.sourceManifest,
              detail: `fastify: ${dep.declaredVersion || 'declared'}`,
            },
          ],
        };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },
  {
    id: 'django',
    name: 'Django',
    category: 'FRAMEWORK',
    match: deps => {
      const dep = findDep(deps, 'django');
      if (dep) {
        return {
          matched: true,
          declaredVersion: dep.declaredVersion,
          confidence: 'HIGH',
          evidence: [
            {
              kind: 'DEPENDENCY',
              source: dep.sourceManifest,
              detail: `django: ${dep.declaredVersion || 'declared'}`,
            },
          ],
        };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },
  {
    id: 'flask',
    name: 'Flask',
    category: 'FRAMEWORK',
    match: deps => {
      const dep = findDep(deps, 'flask');
      if (dep) {
        return {
          matched: true,
          declaredVersion: dep.declaredVersion,
          confidence: 'HIGH',
          evidence: [
            {
              kind: 'DEPENDENCY',
              source: dep.sourceManifest,
              detail: `flask: ${dep.declaredVersion || 'declared'}`,
            },
          ],
        };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },
  {
    id: 'fastapi',
    name: 'FastAPI',
    category: 'FRAMEWORK',
    match: deps => {
      const dep = findDep(deps, 'fastapi');
      if (dep) {
        return {
          matched: true,
          declaredVersion: dep.declaredVersion,
          confidence: 'HIGH',
          evidence: [
            {
              kind: 'DEPENDENCY',
              source: dep.sourceManifest,
              detail: `fastapi: ${dep.declaredVersion || 'declared'}`,
            },
          ],
        };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },
  {
    id: 'spring_boot',
    name: 'Spring Boot',
    category: 'FRAMEWORK',
    match: deps => {
      const dep = findDep(
        deps,
        'spring-boot-starter-web',
        'spring-boot',
        'org.springframework.boot:spring-boot-starter-web',
        'org.springframework.boot:spring-boot',
      );
      if (dep) {
        return {
          matched: true,
          declaredVersion: dep.declaredVersion,
          confidence: 'HIGH',
          evidence: [
            {
              kind: 'DEPENDENCY',
              source: dep.sourceManifest,
              detail: `${dep.name}: ${dep.declaredVersion || 'declared'}`,
            },
          ],
        };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },
  {
    id: 'laravel',
    name: 'Laravel',
    category: 'FRAMEWORK',
    match: deps => {
      const dep = findDep(deps, 'laravel/framework');
      if (dep) {
        return {
          matched: true,
          declaredVersion: dep.declaredVersion,
          confidence: 'HIGH',
          evidence: [
            {
              kind: 'DEPENDENCY',
              source: dep.sourceManifest,
              detail: `laravel/framework: ${dep.declaredVersion || 'declared'}`,
            },
          ],
        };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },
  {
    id: 'rails',
    name: 'Ruby on Rails',
    category: 'FRAMEWORK',
    match: deps => {
      const dep = findDep(deps, 'rails');
      if (dep) {
        return {
          matched: true,
          declaredVersion: dep.declaredVersion,
          confidence: 'HIGH',
          evidence: [
            {
              kind: 'DEPENDENCY',
              source: dep.sourceManifest,
              detail: `rails: ${dep.declaredVersion || 'declared'}`,
            },
          ],
        };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },
  {
    id: 'aspnet',
    name: 'ASP.NET Core',
    category: 'FRAMEWORK',
    match: deps => {
      const dep = findDep(deps, 'Microsoft.AspNetCore.App', 'Microsoft.AspNetCore');
      if (dep) {
        return {
          matched: true,
          declaredVersion: dep.declaredVersion,
          confidence: 'HIGH',
          evidence: [
            {
              kind: 'DEPENDENCY',
              source: dep.sourceManifest,
              detail: `${dep.name}: ${dep.declaredVersion || 'declared'}`,
            },
          ],
        };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },
  {
    id: 'flutter',
    name: 'Flutter',
    category: 'FRAMEWORK',
    match: (deps, entries) => {
      const pubspec = entries.find(e => e.name.toLowerCase() === 'pubspec.yaml');
      const dep = findDep(deps, 'flutter_test');
      const isFlutter =
        pubspec !== undefined &&
        (dep !== undefined || deps.some(d => d.sourceManifest.toLowerCase().includes('pubspec')));

      if (isFlutter) {
        return {
          matched: true,
          declaredVersion: null,
          confidence: 'HIGH',
          evidence: [
            {
              kind: 'MANIFEST',
              source: pubspec?.relativePath || 'pubspec.yaml',
              detail: 'Flutter SDK manifest dependency',
            },
          ],
        };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },

  // --- Testing Frameworks ---
  {
    id: 'vitest',
    name: 'Vitest',
    category: 'TEST_FRAMEWORK',
    match: deps => {
      const dep = findDep(deps, 'vitest');
      if (dep) {
        return {
          matched: true,
          declaredVersion: dep.declaredVersion,
          confidence: 'HIGH',
          evidence: [
            {
              kind: dep.scope === 'DEVELOPMENT' ? 'DEV_DEPENDENCY' : 'DEPENDENCY',
              source: dep.sourceManifest,
              detail: `vitest: ${dep.declaredVersion || 'declared'}`,
            },
          ],
        };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },
  {
    id: 'jest',
    name: 'Jest',
    category: 'TEST_FRAMEWORK',
    match: deps => {
      const dep = findDep(deps, 'jest');
      if (dep) {
        return {
          matched: true,
          declaredVersion: dep.declaredVersion,
          confidence: 'HIGH',
          evidence: [
            {
              kind: dep.scope === 'DEVELOPMENT' ? 'DEV_DEPENDENCY' : 'DEPENDENCY',
              source: dep.sourceManifest,
              detail: `jest: ${dep.declaredVersion || 'declared'}`,
            },
          ],
        };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },
  {
    id: 'playwright',
    name: 'Playwright Test',
    category: 'TEST_FRAMEWORK',
    match: deps => {
      const dep = findDep(deps, '@playwright/test', 'playwright');
      if (dep) {
        return {
          matched: true,
          declaredVersion: dep.declaredVersion,
          confidence: 'HIGH',
          evidence: [
            {
              kind: dep.scope === 'DEVELOPMENT' ? 'DEV_DEPENDENCY' : 'DEPENDENCY',
              source: dep.sourceManifest,
              detail: `${dep.name}: ${dep.declaredVersion || 'declared'}`,
            },
          ],
        };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },
  {
    id: 'pytest',
    name: 'Pytest',
    category: 'TEST_FRAMEWORK',
    match: deps => {
      const dep = findDep(deps, 'pytest');
      if (dep) {
        return {
          matched: true,
          declaredVersion: dep.declaredVersion,
          confidence: 'HIGH',
          evidence: [
            {
              kind: 'DEPENDENCY',
              source: dep.sourceManifest,
              detail: `pytest: ${dep.declaredVersion || 'declared'}`,
            },
          ],
        };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },
  {
    id: 'junit',
    name: 'JUnit',
    category: 'TEST_FRAMEWORK',
    match: deps => {
      const dep = findDep(deps, 'junit', 'org.junit.jupiter:junit-jupiter', 'junit:junit');
      if (dep) {
        return {
          matched: true,
          declaredVersion: dep.declaredVersion,
          confidence: 'HIGH',
          evidence: [
            {
              kind: 'DEPENDENCY',
              source: dep.sourceManifest,
              detail: `${dep.name}: ${dep.declaredVersion || 'declared'}`,
            },
          ],
        };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },

  // --- ORM & Data Layer ---
  {
    id: 'prisma',
    name: 'Prisma',
    category: 'ORM',
    match: (deps, entries) => {
      const clientDep = findDep(deps, '@prisma/client');
      const cliDep = findDep(deps, 'prisma');
      const schemaFile = entries.find(
        e => e.kind === 'FILE' && e.name.toLowerCase() === 'schema.prisma',
      );
      const evidence: DetectionEvidenceDto[] = [];

      if (clientDep) {
        evidence.push({
          kind: 'DEPENDENCY',
          source: clientDep.sourceManifest,
          detail: `@prisma/client: ${clientDep.declaredVersion || 'declared'}`,
        });
      }
      if (cliDep) {
        evidence.push({
          kind: 'DEV_DEPENDENCY',
          source: cliDep.sourceManifest,
          detail: `prisma: ${cliDep.declaredVersion || 'declared'}`,
        });
      }
      if (schemaFile) {
        evidence.push({
          kind: 'CONFIG_FILE',
          source: schemaFile.relativePath,
          detail: 'Prisma schema file',
        });
      }

      if (clientDep || cliDep) {
        return {
          matched: true,
          declaredVersion: clientDep?.declaredVersion || cliDep?.declaredVersion || null,
          confidence: 'HIGH',
          evidence,
        };
      }
      if (schemaFile) {
        return { matched: true, declaredVersion: null, confidence: 'MEDIUM', evidence };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },
  {
    id: 'typeorm',
    name: 'TypeORM',
    category: 'ORM',
    match: deps => {
      const dep = findDep(deps, 'typeorm');
      if (dep) {
        return {
          matched: true,
          declaredVersion: dep.declaredVersion,
          confidence: 'HIGH',
          evidence: [
            {
              kind: 'DEPENDENCY',
              source: dep.sourceManifest,
              detail: `typeorm: ${dep.declaredVersion || 'declared'}`,
            },
          ],
        };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },
  {
    id: 'drizzle',
    name: 'Drizzle ORM',
    category: 'ORM',
    match: deps => {
      const dep = findDep(deps, 'drizzle-orm');
      if (dep) {
        return {
          matched: true,
          declaredVersion: dep.declaredVersion,
          confidence: 'HIGH',
          evidence: [
            {
              kind: 'DEPENDENCY',
              source: dep.sourceManifest,
              detail: `drizzle-orm: ${dep.declaredVersion || 'declared'}`,
            },
          ],
        };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },
  {
    id: 'sqlalchemy',
    name: 'SQLAlchemy',
    category: 'ORM',
    match: deps => {
      const dep = findDep(deps, 'sqlalchemy');
      if (dep) {
        return {
          matched: true,
          declaredVersion: dep.declaredVersion,
          confidence: 'HIGH',
          evidence: [
            {
              kind: 'DEPENDENCY',
              source: dep.sourceManifest,
              detail: `sqlalchemy: ${dep.declaredVersion || 'declared'}`,
            },
          ],
        };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },
  {
    id: 'hibernate',
    name: 'Hibernate',
    category: 'ORM',
    match: deps => {
      const dep = findDep(deps, 'hibernate-core', 'org.hibernate:hibernate-core');
      if (dep) {
        return {
          matched: true,
          declaredVersion: dep.declaredVersion,
          confidence: 'HIGH',
          evidence: [
            {
              kind: 'DEPENDENCY',
              source: dep.sourceManifest,
              detail: `${dep.name}: ${dep.declaredVersion || 'declared'}`,
            },
          ],
        };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },

  // --- Build Tools & UI Frameworks ---
  {
    id: 'vite',
    name: 'Vite',
    category: 'BUILD_TOOL',
    match: (deps, entries) => {
      const dep = findDep(deps, 'vite');
      const configFile = findConfigFile(entries, /^vite\.config\.(js|ts|mjs|cjs)$/i);
      const evidence: DetectionEvidenceDto[] = [];

      if (dep) {
        evidence.push({
          kind: dep.scope === 'DEVELOPMENT' ? 'DEV_DEPENDENCY' : 'DEPENDENCY',
          source: dep.sourceManifest,
          detail: `vite: ${dep.declaredVersion || 'declared'}`,
        });
      }
      if (configFile) {
        evidence.push({
          kind: 'CONFIG_FILE',
          source: configFile.relativePath,
          detail: 'Vite configuration file',
        });
      }

      if (dep) {
        return {
          matched: true,
          declaredVersion: dep.declaredVersion,
          confidence: 'HIGH',
          evidence,
        };
      }
      if (configFile) {
        return { matched: true, declaredVersion: null, confidence: 'MEDIUM', evidence };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },
  {
    id: 'tailwind',
    name: 'Tailwind CSS',
    category: 'UI_LIBRARY',
    match: (deps, entries) => {
      const dep = findDep(deps, 'tailwindcss');
      const configFile = findConfigFile(entries, /^tailwind\.config\.(js|ts|cjs|mjs)$/i);
      const evidence: DetectionEvidenceDto[] = [];

      if (dep) {
        evidence.push({
          kind: dep.scope === 'DEVELOPMENT' ? 'DEV_DEPENDENCY' : 'DEPENDENCY',
          source: dep.sourceManifest,
          detail: `tailwindcss: ${dep.declaredVersion || 'declared'}`,
        });
      }
      if (configFile) {
        evidence.push({
          kind: 'CONFIG_FILE',
          source: configFile.relativePath,
          detail: 'Tailwind CSS configuration file',
        });
      }

      if (dep) {
        return {
          matched: true,
          declaredVersion: dep.declaredVersion,
          confidence: 'HIGH',
          evidence,
        };
      }
      if (configFile) {
        return { matched: true, declaredVersion: null, confidence: 'MEDIUM', evidence };
      }
      return { matched: false, declaredVersion: null, confidence: 'LOW', evidence: [] };
    },
  },
];
