import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TypeScriptSourceParser } from './typescript-source-parser.js';
import { PythonSourceParser } from './python-source-parser.js';

describe('Source Parser Unit & Security Tests', () => {
  describe('TypeScriptSourceParser', () => {
    const parser = new TypeScriptSourceParser();

    it('should parse top-level functions, classes, interfaces, types, enums, and variables', () => {
      const code = `
        import { db } from './db';
        import React from 'react';

        export interface User {
          id: string;
          name: string;
        }

        export type UserId = string;

        export enum UserRole {
          ADMIN = 'ADMIN',
          USER = 'USER'
        }

        export const DEFAULT_TIMEOUT = 5000;
        let activeUsersCount = 0;

        export class UserService {
          getUser() {}
        }

        export function createUser(user: User): boolean {
          return true;
        }

        export default UserService;
      `;

      const result = parser.parse({
        relativePath: 'src/user-service.ts',
        content: code,
        language: 'TypeScript',
      });

      assert.strictEqual(result.isSupported, true);

      // Check Symbols
      const symbolNames = result.symbols.map(s => `${s.kind}:${s.name}`);
      assert.ok(symbolNames.includes('INTERFACE:User'), 'Must extract User interface');
      assert.ok(symbolNames.includes('TYPE:UserId'), 'Must extract UserId type');
      assert.ok(symbolNames.includes('ENUM:UserRole'), 'Must extract UserRole enum');
      assert.ok(
        symbolNames.includes('CONSTANT:DEFAULT_TIMEOUT'),
        'Must extract DEFAULT_TIMEOUT constant',
      );
      assert.ok(
        symbolNames.includes('VARIABLE:activeUsersCount'),
        'Must extract activeUsersCount variable',
      );
      assert.ok(symbolNames.includes('CLASS:UserService'), 'Must extract UserService class');
      assert.ok(symbolNames.includes('FUNCTION:createUser'), 'Must extract createUser function');

      // Check Export Status
      const userSym = result.symbols.find(s => s.name === 'User');
      assert.strictEqual(userSym?.isExported, true);

      const activeUsersSym = result.symbols.find(s => s.name === 'activeUsersCount');
      assert.strictEqual(activeUsersSym?.isExported, false);

      // Check Imports
      assert.strictEqual(result.imports.length, 2);
      assert.strictEqual(result.imports[0]?.specifier, './db');
      assert.strictEqual(result.imports[0]?.isExternal, false);
      assert.strictEqual(result.imports[1]?.specifier, 'react');
      assert.strictEqual(result.imports[1]?.isExternal, true);
    });

    it('should parse literal dynamic imports and require calls', () => {
      const code = `
        const helper = require('./helper');
        async function loadPlugin() {
          const plugin = await import('./plugins/custom-plugin');
        }
      `;

      const result = parser.parse({
        relativePath: 'src/loader.js',
        content: code,
        language: 'JavaScript',
      });

      const specifiers = result.imports.map(i => i.specifier);
      assert.ok(specifiers.includes('./helper'), 'Must extract require import');
      assert.ok(specifiers.includes('./plugins/custom-plugin'), 'Must extract dynamic import');
    });

    it('should tolerate malformed source code without crashing', () => {
      const brokenCode = `
        export class Broken {
          const x = ;
        function invalid( {
      `;

      const result = parser.parse({
        relativePath: 'src/broken.ts',
        content: brokenCode,
        language: 'TypeScript',
      });

      assert.strictEqual(result.isSupported, true);
      assert.ok(Array.isArray(result.symbols));
    });

    it('should NEVER execute malicious target source code during parsing', () => {
      (globalThis as unknown as { __MALICIOUS_EXEC_TEST__?: boolean }).__MALICIOUS_EXEC_TEST__ =
        false;

      const maliciousCode = `
        (globalThis as any).__MALICIOUS_EXEC_TEST__ = true;
        throw new Error("Malicious execution payload triggered!");
      `;

      const result = parser.parse({
        relativePath: 'src/malicious.ts',
        content: maliciousCode,
        language: 'TypeScript',
      });

      assert.strictEqual(result.isSupported, true);
      assert.strictEqual(
        (globalThis as unknown as { __MALICIOUS_EXEC_TEST__?: boolean }).__MALICIOUS_EXEC_TEST__,
        false,
      );
    });
  });

  describe('PythonSourceParser', () => {
    const parser = new PythonSourceParser();

    it('should parse top-level Python functions, classes, and imports', () => {
      const code = `
import os, sys
from typing import List, Optional
from .models import User

GLOBAL_CONFIG = {}

class UserService:
    def helper_method(self):
        pass

def create_user(name: str):
    def nested_func():
        pass
    return None

async def fetch_users():
    pass
      `;

      const result = parser.parse({
        relativePath: 'app/service.py',
        content: code,
        language: 'Python',
      });

      assert.strictEqual(result.isSupported, true);

      // Check Symbols (Top-level only, no nested_func or helper_method)
      const symbolNames = result.symbols.map(s => `${s.kind}:${s.name}`);
      assert.ok(symbolNames.includes('CLASS:UserService'), 'Must extract UserService class');
      assert.ok(symbolNames.includes('FUNCTION:create_user'), 'Must extract create_user function');
      assert.ok(symbolNames.includes('FUNCTION:fetch_users'), 'Must extract fetch_users function');
      assert.ok(!symbolNames.includes('FUNCTION:nested_func'), 'Must not extract nested function');
      assert.ok(
        !symbolNames.includes('FUNCTION:helper_method'),
        'Must not extract nested class method',
      );

      // Check Imports
      const specifiers = result.imports.map(i => i.specifier);
      assert.ok(specifiers.includes('os'));
      assert.ok(specifiers.includes('sys'));
      assert.ok(specifiers.includes('typing'));
      assert.ok(specifiers.includes('.models'));
    });
  });
});
