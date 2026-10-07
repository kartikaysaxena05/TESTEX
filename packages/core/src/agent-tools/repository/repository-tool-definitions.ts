/**
 * @file packages/core/src/agent-tools/repository/repository-tool-definitions.ts
 * RegisteredToolDefinitions for V10 Phase 145 Repository Read / Search Tools.
 *
 * Tools:
 * - repository.list_files
 * - repository.read_file
 * - repository.search_files
 * - repository.find_symbol
 * - repository.get_file_metadata
 *
 * All tools are category: 'REPOSITORY', permissionLevel: 'READ'.
 */

import {
  type RepoListFilesInputDto,
  type RepoListFilesOutputDto,
  type RepoReadFileInputDto,
  type RepoReadFileOutputDto,
  type RepoSearchFilesInputDto,
  type RepoSearchFilesOutputDto,
  type RepoFindSymbolInputDto,
  type RepoFindSymbolOutputDto,
  type RepoGetFileMetadataInputDto,
  type RepoGetFileMetadataOutputDto,
} from '@ai-quality/contracts';
import { type RegisteredToolDefinition, type ToolExecutionContext } from '../agent-tool-definition.js';
import { RepositoryToolService } from './repository-tool-service.js';

export function createRepositoryToolDefinitions(
  service: RepositoryToolService,
): readonly RegisteredToolDefinition<any, any>[] {
  // 1. repository.list_files
  const listFilesTool: RegisteredToolDefinition<RepoListFilesInputDto, RepoListFilesOutputDto> = {
    toolId: 'repository.list_files',
    name: 'repository.list_files',
    description:
      'Lists files and directories contained within the authorized project repository with relative paths and safe bounds.',
    version: '1.0.0',
    category: 'REPOSITORY',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', format: 'uuid' },
        relativeDirectory: { type: 'string', default: '.' },
        recursive: { type: 'boolean', default: false },
        maxFiles: { type: 'number', default: 1000 },
        maxDepth: { type: 'number', default: 10 },
      },
      required: ['projectId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        relativeDirectory: { type: 'string' },
        items: { type: 'array' },
        totalCount: { type: 'number' },
        truncated: { type: 'boolean' },
      },
      required: ['relativeDirectory', 'items', 'totalCount', 'truncated'],
    },
    permissionLevel: 'READ',
    enabled: true,
    handler: async (input: RepoListFilesInputDto, ctx: ToolExecutionContext) => {
      return service.listFiles(input, ctx.userId);
    },
  };

  // 2. repository.read_file
  const readFileTool: RegisteredToolDefinition<RepoReadFileInputDto, RepoReadFileOutputDto> = {
    toolId: 'repository.read_file',
    name: 'repository.read_file',
    description:
      'Reads text content from a specified repository file with line numbers, safe size limits, and containment checks.',
    version: '1.0.0',
    category: 'REPOSITORY',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', format: 'uuid' },
        relativePath: { type: 'string' },
        startLine: { type: 'number' },
        endLine: { type: 'number' },
        maxSizeBytes: { type: 'number' },
        maxOutputChars: { type: 'number' },
      },
      required: ['projectId', 'relativePath'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        relativePath: { type: 'string' },
        content: { type: 'string' },
        lineCount: { type: 'number' },
        startLine: { type: 'number' },
        endLine: { type: 'number' },
        sizeBytes: { type: 'number' },
        truncated: { type: 'boolean' },
        encoding: { type: 'string' },
      },
      required: [
        'relativePath',
        'content',
        'lineCount',
        'startLine',
        'endLine',
        'sizeBytes',
        'truncated',
        'encoding',
      ],
    },
    permissionLevel: 'READ',
    enabled: true,
    handler: async (input: RepoReadFileInputDto, ctx: ToolExecutionContext) => {
      return service.readFile(input, ctx.userId);
    },
  };

  // 3. repository.search_files
  const searchFilesTool: RegisteredToolDefinition<RepoSearchFilesInputDto, RepoSearchFilesOutputDto> = {
    toolId: 'repository.search_files',
    name: 'repository.search_files',
    description:
      'Searches project files by text string or regular expression, returning matching lines and surrounding context.',
    version: '1.0.0',
    category: 'REPOSITORY',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', format: 'uuid' },
        query: { type: 'string' },
        isRegex: { type: 'boolean', default: false },
        caseSensitive: { type: 'boolean', default: false },
        relativeDirectory: { type: 'string', default: '.' },
        maxResults: { type: 'number', default: 50 },
        contextLines: { type: 'number', default: 1 },
      },
      required: ['projectId', 'query'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        isRegex: { type: 'boolean' },
        matches: { type: 'array' },
        totalMatches: { type: 'number' },
        filesScanned: { type: 'number' },
        truncated: { type: 'boolean' },
      },
      required: ['query', 'isRegex', 'matches', 'totalMatches', 'filesScanned', 'truncated'],
    },
    permissionLevel: 'READ',
    enabled: true,
    handler: async (input: RepoSearchFilesInputDto, ctx: ToolExecutionContext) => {
      return service.searchFiles(input, ctx.userId);
    },
  };

  // 4. repository.find_symbol
  const findSymbolTool: RegisteredToolDefinition<RepoFindSymbolInputDto, RepoFindSymbolOutputDto> = {
    toolId: 'repository.find_symbol',
    name: 'repository.find_symbol',
    description:
      'Performs AST-based symbol lookup across TypeScript and JavaScript files, returning declaration locations and snippets.',
    version: '1.0.0',
    category: 'REPOSITORY',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', format: 'uuid' },
        symbolName: { type: 'string' },
        relativePath: { type: 'string' },
        exactMatch: { type: 'boolean', default: true },
        maxResults: { type: 'number', default: 20 },
      },
      required: ['projectId', 'symbolName'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        symbolName: { type: 'string' },
        symbols: { type: 'array' },
        totalFound: { type: 'number' },
        language: { type: 'string' },
        parsedFilesCount: { type: 'number' },
      },
      required: ['symbolName', 'symbols', 'totalFound', 'language', 'parsedFilesCount'],
    },
    permissionLevel: 'READ',
    enabled: true,
    handler: async (input: RepoFindSymbolInputDto, ctx: ToolExecutionContext) => {
      return service.findSymbol(input, ctx.userId);
    },
  };

  // 5. repository.get_file_metadata
  const getFileMetadataTool: RegisteredToolDefinition<
    RepoGetFileMetadataInputDto,
    RepoGetFileMetadataOutputDto
  > = {
    toolId: 'repository.get_file_metadata',
    name: 'repository.get_file_metadata',
    description:
      'Returns safe filesystem metadata including relative path, file extension, size in bytes, and last modified timestamp.',
    version: '1.0.0',
    category: 'REPOSITORY',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', format: 'uuid' },
        relativePath: { type: 'string' },
      },
      required: ['projectId', 'relativePath'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        relativePath: { type: 'string' },
        extension: { type: 'string' },
        sizeBytes: { type: 'number' },
        modifiedAt: { type: 'string' },
        isDirectory: { type: 'boolean' },
        isBinary: { type: 'boolean' },
        lineCount: { type: ['number', 'null'] },
      },
      required: [
        'relativePath',
        'extension',
        'sizeBytes',
        'modifiedAt',
        'isDirectory',
        'isBinary',
      ],
    },
    permissionLevel: 'READ',
    enabled: true,
    handler: async (input: RepoGetFileMetadataInputDto, ctx: ToolExecutionContext) => {
      return service.getFileMetadata(input, ctx.userId);
    },
  };

  return [
    listFilesTool,
    readFileTool,
    searchFilesTool,
    findSymbolTool,
    getFileMetadataTool,
  ];
}
