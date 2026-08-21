import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SourceStructureEntryDto } from '@ai-quality/contracts';
import { LanguageDetector } from './language-detector.js';

describe('LanguageDetector Unit Tests', () => {
  const detector = new LanguageDetector();

  it('should detect TypeScript and JavaScript files and calculate proportions', () => {
    const entries: SourceStructureEntryDto[] = [
      { relativePath: 'src/index.ts', name: 'index.ts', kind: 'FILE', depth: 2 },
      { relativePath: 'src/Button.tsx', name: 'Button.tsx', kind: 'FILE', depth: 2 },
      { relativePath: 'src/types.d.ts', name: 'types.d.ts', kind: 'FILE', depth: 2 },
      { relativePath: 'src/legacy.js', name: 'legacy.js', kind: 'FILE', depth: 2 },
    ];

    const result = detector.detect(entries);

    assert.strictEqual(result.dominantLanguage, 'TypeScript');
    assert.strictEqual(result.totalIncludedFiles, 4);
    assert.strictEqual(result.totalLanguageFiles, 4);
    assert.strictEqual(result.unknownFiles, 0);

    const ts = result.detectedLanguages.find(l => l.language === 'TypeScript');
    assert.ok(ts);
    assert.strictEqual(ts.fileCount, 3);
    assert.strictEqual(ts.percentage, 75);

    const js = result.detectedLanguages.find(l => l.language === 'JavaScript');
    assert.ok(js);
    assert.strictEqual(js.fileCount, 1);
    assert.strictEqual(js.percentage, 25);
  });

  it('should handle multi-language polyglot projects', () => {
    const entries: SourceStructureEntryDto[] = [
      { relativePath: 'src/app.ts', name: 'app.ts', kind: 'FILE', depth: 2 },
      { relativePath: 'scripts/worker.py', name: 'worker.py', kind: 'FILE', depth: 2 },
      { relativePath: 'services/main.go', name: 'main.go', kind: 'FILE', depth: 2 },
      { relativePath: 'db/schema.sql', name: 'schema.sql', kind: 'FILE', depth: 2 },
      { relativePath: 'deploy.sh', name: 'deploy.sh', kind: 'FILE', depth: 1 },
    ];

    const result = detector.detect(entries);

    assert.strictEqual(result.totalIncludedFiles, 5);
    assert.strictEqual(result.totalLanguageFiles, 5);
    assert.strictEqual(result.detectedLanguages.length, 5);
    // All 5 have count 1, so dominant language is null due to 5-way tie
    assert.strictEqual(result.dominantLanguage, null);
  });

  it('should prevent configuration/data formats from dominating programming languages', () => {
    // 50 JSON files + 5 Python files
    const entries: SourceStructureEntryDto[] = [];
    for (let i = 0; i < 50; i++) {
      entries.push({
        relativePath: `data/item-${i}.json`,
        name: `item-${i}.json`,
        kind: 'FILE',
        depth: 2,
      });
    }
    for (let i = 0; i < 5; i++) {
      entries.push({
        relativePath: `src/script-${i}.py`,
        name: `script-${i}.py`,
        kind: 'FILE',
        depth: 2,
      });
    }

    const result = detector.detect(entries);

    assert.strictEqual(result.totalIncludedFiles, 55);
    assert.strictEqual(result.totalLanguageFiles, 55);

    // Python is the dominant PROGRAMMING language despite JSON having higher count
    assert.strictEqual(result.dominantLanguage, 'Python');

    const json = result.detectedLanguages.find(l => l.language === 'JSON');
    assert.ok(json);
    assert.strictEqual(json.category, 'DATA');
    assert.strictEqual(json.fileCount, 50);

    const py = result.detectedLanguages.find(l => l.language === 'Python');
    assert.ok(py);
    assert.strictEqual(py.category, 'PROGRAMMING');
    assert.strictEqual(py.fileCount, 5);
  });

  it('should handle ambiguous extensions conservatively (e.g. .h header files)', () => {
    const entries: SourceStructureEntryDto[] = [
      { relativePath: 'include/common.h', name: 'common.h', kind: 'FILE', depth: 2 },
    ];

    const result = detector.detect(entries);

    const header = result.detectedLanguages.find(l => l.language === 'C/C++ Header');
    assert.ok(header);
    assert.strictEqual(header.confidence, 'LOW');
  });

  it('should track unknown unclassified files honestly without guessing', () => {
    const entries: SourceStructureEntryDto[] = [
      { relativePath: 'custom.xyz', name: 'custom.xyz', kind: 'FILE', depth: 1 },
      { relativePath: 'binary.blob', name: 'binary.blob', kind: 'FILE', depth: 1 },
      { relativePath: 'main.py', name: 'main.py', kind: 'FILE', depth: 1 },
    ];

    const result = detector.detect(entries);

    assert.strictEqual(result.totalIncludedFiles, 3);
    assert.strictEqual(result.totalLanguageFiles, 1);
    assert.strictEqual(result.unknownFiles, 2);
    assert.strictEqual(result.dominantLanguage, 'Python');
  });

  it('should normalize case in extensions safely', () => {
    const entries: SourceStructureEntryDto[] = [
      { relativePath: 'MAIN.PY', name: 'MAIN.PY', kind: 'FILE', depth: 1 },
      { relativePath: 'APP.TS', name: 'APP.TS', kind: 'FILE', depth: 1 },
    ];

    const result = detector.detect(entries);

    assert.strictEqual(result.totalLanguageFiles, 2);
    assert.ok(result.detectedLanguages.some(l => l.language === 'Python'));
    assert.ok(result.detectedLanguages.some(l => l.language === 'TypeScript'));
  });

  it('should handle multi-suffix filenames correctly', () => {
    const entries: SourceStructureEntryDto[] = [
      { relativePath: 'user.test.ts', name: 'user.test.ts', kind: 'FILE', depth: 1 },
      { relativePath: 'card.spec.tsx', name: 'card.spec.tsx', kind: 'FILE', depth: 1 },
      { relativePath: 'global.d.ts', name: 'global.d.ts', kind: 'FILE', depth: 1 },
    ];

    const result = detector.detect(entries);

    assert.strictEqual(result.dominantLanguage, 'TypeScript');
    assert.strictEqual(result.detectedLanguages[0]?.fileCount, 3);
  });
});
