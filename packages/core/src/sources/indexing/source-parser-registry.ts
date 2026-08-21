/**
 * @file packages/core/src/sources/indexing/source-parser-registry.ts
 * Registry managing language-specific source parsers.
 */

import path from 'node:path';
import type { SourceParser, SourceParseInput, SourceParseResult } from './source-parser-types.js';
import { TypeScriptSourceParser } from './typescript-source-parser.js';
import { PythonSourceParser } from './python-source-parser.js';

export class SourceParserRegistry {
  private readonly parsers: readonly SourceParser[];

  constructor(customParsers?: readonly SourceParser[]) {
    this.parsers = customParsers ?? [new TypeScriptSourceParser(), new PythonSourceParser()];
  }

  getParser(language: string | null, relativePath: string): SourceParser | null {
    const extension = path.posix.extname(relativePath).toLowerCase();
    for (const parser of this.parsers) {
      if (parser.supports(language, extension)) {
        return parser;
      }
    }
    return null;
  }

  parse(input: SourceParseInput): SourceParseResult {
    const parser = this.getParser(input.language, input.relativePath);
    if (!parser) {
      return {
        symbols: [],
        imports: [],
        exports: [],
        isSupported: false,
        warnings: [],
      };
    }

    return parser.parse(input);
  }
}
