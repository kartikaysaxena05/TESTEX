/**
 * @file packages/core/src/sources/indexing/typescript-source-parser.ts
 * Deterministic top-level AST parser for TypeScript, JavaScript, TSX, and JSX using TypeScript compiler API.
 */

import ts from 'typescript';
import path from 'node:path';
import type {
  SourceParser,
  SourceParseInput,
  SourceParseResult,
  ExtractedSymbol,
  ExtractedImport,
  ExtractedExport,
} from './source-parser-types.js';
import { MAX_SYMBOLS_PER_FILE, MAX_IMPORTS_PER_FILE } from './index-types.js';

export class TypeScriptSourceParser implements SourceParser {
  supports(language: string | null, extension: string): boolean {
    const ext = extension.toLowerCase();
    const lang = (language ?? '').toLowerCase();

    return (
      ext === '.ts' ||
      ext === '.tsx' ||
      ext === '.js' ||
      ext === '.jsx' ||
      ext === '.mjs' ||
      ext === '.cjs' ||
      ext === '.mts' ||
      ext === '.cts' ||
      lang === 'typescript' ||
      lang === 'javascript' ||
      lang === 'jsx' ||
      lang === 'tsx'
    );
  }

  parse(input: SourceParseInput): SourceParseResult {
    const ext = path.extname(input.relativePath).toLowerCase();
    const isJsx = ext === '.tsx' || ext === '.jsx';
    const isJs = ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs';

    const scriptKind = isJsx
      ? isJs
        ? ts.ScriptKind.JSX
        : ts.ScriptKind.TSX
      : isJs
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;

    let sourceFile: ts.SourceFile;
    try {
      sourceFile = ts.createSourceFile(
        input.relativePath,
        input.content,
        ts.ScriptTarget.Latest,
        true,
        scriptKind,
      );
    } catch {
      return {
        symbols: [],
        imports: [],
        exports: [],
        isSupported: true,
        warnings: ['Failed to parse source file AST.'],
      };
    }

    const symbols: ExtractedSymbol[] = [];
    const imports: ExtractedImport[] = [];
    const exports: ExtractedExport[] = [];
    const warnings: string[] = [];

    const getLine = (pos: number): number => {
      return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
    };

    const hasExportModifier = (node: ts.Node): boolean => {
      if (!ts.canHaveModifiers(node)) return false;
      const modifiers = ts.getModifiers(node);
      if (!modifiers) return false;
      return modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
    };

    for (const statement of sourceFile.statements) {
      if (symbols.length >= MAX_SYMBOLS_PER_FILE && imports.length >= MAX_IMPORTS_PER_FILE) {
        break;
      }

      // 1. Function Declarations
      if (ts.isFunctionDeclaration(statement) && statement.name) {
        if (symbols.length < MAX_SYMBOLS_PER_FILE) {
          const isExported = hasExportModifier(statement);
          symbols.push({
            name: statement.name.text,
            kind: 'FUNCTION',
            startLine: getLine(statement.getStart(sourceFile)),
            endLine: getLine(statement.getEnd()),
            isExported,
          });
          if (isExported) {
            exports.push({
              name: statement.name.text,
              lineNumber: getLine(statement.getStart(sourceFile)),
            });
          }
        }
      }

      // 2. Class Declarations
      else if (ts.isClassDeclaration(statement) && statement.name) {
        if (symbols.length < MAX_SYMBOLS_PER_FILE) {
          const isExported = hasExportModifier(statement);
          symbols.push({
            name: statement.name.text,
            kind: 'CLASS',
            startLine: getLine(statement.getStart(sourceFile)),
            endLine: getLine(statement.getEnd()),
            isExported,
          });
          if (isExported) {
            exports.push({
              name: statement.name.text,
              lineNumber: getLine(statement.getStart(sourceFile)),
            });
          }
        }
      }

      // 3. Interface Declarations
      else if (ts.isInterfaceDeclaration(statement)) {
        if (symbols.length < MAX_SYMBOLS_PER_FILE) {
          const isExported = hasExportModifier(statement);
          symbols.push({
            name: statement.name.text,
            kind: 'INTERFACE',
            startLine: getLine(statement.getStart(sourceFile)),
            endLine: getLine(statement.getEnd()),
            isExported,
          });
          if (isExported) {
            exports.push({
              name: statement.name.text,
              lineNumber: getLine(statement.getStart(sourceFile)),
            });
          }
        }
      }

      // 4. Type Alias Declarations
      else if (ts.isTypeAliasDeclaration(statement)) {
        if (symbols.length < MAX_SYMBOLS_PER_FILE) {
          const isExported = hasExportModifier(statement);
          symbols.push({
            name: statement.name.text,
            kind: 'TYPE',
            startLine: getLine(statement.getStart(sourceFile)),
            endLine: getLine(statement.getEnd()),
            isExported,
          });
          if (isExported) {
            exports.push({
              name: statement.name.text,
              lineNumber: getLine(statement.getStart(sourceFile)),
            });
          }
        }
      }

      // 5. Enum Declarations
      else if (ts.isEnumDeclaration(statement)) {
        if (symbols.length < MAX_SYMBOLS_PER_FILE) {
          const isExported = hasExportModifier(statement);
          symbols.push({
            name: statement.name.text,
            kind: 'ENUM',
            startLine: getLine(statement.getStart(sourceFile)),
            endLine: getLine(statement.getEnd()),
            isExported,
          });
          if (isExported) {
            exports.push({
              name: statement.name.text,
              lineNumber: getLine(statement.getStart(sourceFile)),
            });
          }
        }
      }

      // 6. Variable Statement Declarations
      else if (ts.isVariableStatement(statement)) {
        const isExported = hasExportModifier(statement);
        const isConst = Boolean(statement.declarationList.flags & ts.NodeFlags.Const);

        for (const decl of statement.declarationList.declarations) {
          if (symbols.length >= MAX_SYMBOLS_PER_FILE) break;
          if (ts.isIdentifier(decl.name)) {
            symbols.push({
              name: decl.name.text,
              kind: isConst ? 'CONSTANT' : 'VARIABLE',
              startLine: getLine(decl.getStart(sourceFile)),
              endLine: getLine(decl.getEnd()),
              isExported,
            });
            if (isExported) {
              exports.push({
                name: decl.name.text,
                lineNumber: getLine(decl.getStart(sourceFile)),
              });
            }
          }
        }
      }

      // 7. Static Import Declarations
      else if (ts.isImportDeclaration(statement)) {
        if (
          imports.length < MAX_IMPORTS_PER_FILE &&
          ts.isStringLiteral(statement.moduleSpecifier)
        ) {
          const specifier = statement.moduleSpecifier.text;
          const isExternal = !specifier.startsWith('.') && !specifier.startsWith('/');
          imports.push({
            specifier,
            importKind: isExternal ? 'EXTERNAL' : 'LOCAL',
            lineNumber: getLine(statement.getStart(sourceFile)),
            isExternal,
          });
        }
      }

      // 8. Export Declarations (export { a, b })
      else if (ts.isExportDeclaration(statement) && statement.exportClause) {
        if (ts.isNamedExports(statement.exportClause)) {
          for (const el of statement.exportClause.elements) {
            exports.push({
              name: el.name.text,
              lineNumber: getLine(statement.getStart(sourceFile)),
            });
          }
        }
      }

      // 9. Default Export Assignments (export default ...)
      else if (ts.isExportAssignment(statement)) {
        exports.push({ name: 'default', lineNumber: getLine(statement.getStart(sourceFile)) });
      }
    }

    // Secondary scan for literal dynamic import('...') or require('...')
    const scanExpressions = (node: ts.Node) => {
      if (imports.length >= MAX_IMPORTS_PER_FILE) return;

      // Dynamic import
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length > 0 &&
        ts.isStringLiteral(node.arguments[0]!)
      ) {
        const specifier = (node.arguments[0] as ts.StringLiteral).text;
        const isExternal = !specifier.startsWith('.') && !specifier.startsWith('/');
        imports.push({
          specifier,
          importKind: 'DYNAMIC',
          lineNumber: getLine(node.getStart(sourceFile)),
          isExternal,
        });
      }

      // CommonJS require
      else if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require' &&
        node.arguments.length > 0 &&
        ts.isStringLiteral(node.arguments[0]!)
      ) {
        const specifier = (node.arguments[0] as ts.StringLiteral).text;
        const isExternal = !specifier.startsWith('.') && !specifier.startsWith('/');
        imports.push({
          specifier,
          importKind: isExternal ? 'EXTERNAL' : 'LOCAL',
          lineNumber: getLine(node.getStart(sourceFile)),
          isExternal,
        });
      }

      ts.forEachChild(node, scanExpressions);
    };

    ts.forEachChild(sourceFile, scanExpressions);

    return {
      symbols,
      imports,
      exports,
      isSupported: true,
      warnings,
    };
  }
}
