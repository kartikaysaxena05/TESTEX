import type {
  SourceParser,
  SourceParseInput,
  SourceParseResult,
  ExtractedSymbol,
  ExtractedImport,
} from './source-parser-types.js';
import { MAX_SYMBOLS_PER_FILE, MAX_IMPORTS_PER_FILE } from './index-types.js';

export class PythonSourceParser implements SourceParser {
  supports(language: string | null, extension: string): boolean {
    const ext = extension.toLowerCase();
    const lang = (language ?? '').toLowerCase();
    return ext === '.py' || lang === 'python';
  }

  parse(input: SourceParseInput): SourceParseResult {
    const lines = input.content.split(/\r?\n/);
    const symbols: ExtractedSymbol[] = [];
    const imports: ExtractedImport[] = [];

    const FUNC_REGEX = /^def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/;
    const ASYNC_FUNC_REGEX = /^async\s+def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/;
    const CLASS_REGEX = /^class\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(\(.*\))?:/;
    const IMPORT_REGEX = /^import\s+([a-zA-Z0-9_., ]+)/;
    const FROM_IMPORT_REGEX = /^from\s+([a-zA-Z0-9_.]+)\s+import\s+/;

    for (let i = 0; i < lines.length; i++) {
      if (symbols.length >= MAX_SYMBOLS_PER_FILE && imports.length >= MAX_IMPORTS_PER_FILE) {
        break;
      }

      const line = lines[i]!;
      const lineNumber = i + 1;

      // Top-level declarations only (no leading whitespace)
      if (line.startsWith(' ') || line.startsWith('\t')) {
        continue;
      }

      // 1. Functions
      const funcMatch = line.match(FUNC_REGEX) || line.match(ASYNC_FUNC_REGEX);
      if (funcMatch && funcMatch[1] && symbols.length < MAX_SYMBOLS_PER_FILE) {
        symbols.push({
          name: funcMatch[1],
          kind: 'FUNCTION',
          startLine: lineNumber,
          endLine: lineNumber,
          isExported: !funcMatch[1].startsWith('_'),
        });
        continue;
      }

      // 2. Classes
      const classMatch = line.match(CLASS_REGEX);
      if (classMatch && classMatch[1] && symbols.length < MAX_SYMBOLS_PER_FILE) {
        symbols.push({
          name: classMatch[1],
          kind: 'CLASS',
          startLine: lineNumber,
          endLine: lineNumber,
          isExported: !classMatch[1].startsWith('_'),
        });
        continue;
      }

      // 3. Imports
      const importMatch = line.match(IMPORT_REGEX);
      if (importMatch && importMatch[1] && imports.length < MAX_IMPORTS_PER_FILE) {
        const modules = importMatch[1].split(',').map(m => m.trim().split(' as ')[0]!.trim());
        for (const mod of modules) {
          if (mod) {
            const isExternal = !mod.startsWith('.');
            imports.push({
              specifier: mod,
              importKind: isExternal ? 'EXTERNAL' : 'LOCAL',
              lineNumber,
              isExternal,
            });
          }
        }
        continue;
      }

      // 4. From ... Import
      const fromMatch = line.match(FROM_IMPORT_REGEX);
      if (fromMatch && fromMatch[1] && imports.length < MAX_IMPORTS_PER_FILE) {
        const mod = fromMatch[1];
        const isExternal = !mod.startsWith('.');
        imports.push({
          specifier: mod,
          importKind: isExternal ? 'EXTERNAL' : 'LOCAL',
          lineNumber,
          isExternal,
        });
        continue;
      }
    }

    return {
      symbols,
      imports,
      exports: [],
      isSupported: true,
      warnings: [],
    };
  }
}
