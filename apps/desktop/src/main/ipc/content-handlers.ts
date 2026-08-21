/**
 * @file apps/desktop/src/main/ipc/content-handlers.ts
 * IPC handler functions for secure source file content reading.
 */

import { sourceFileContentInputSchema, type SourceFileContentDto } from '@ai-quality/contracts';
import { SourceContentService } from '@ai-quality/core';

export async function handleGetSourceFileContent(
  rawInput: unknown,
  service: SourceContentService = new SourceContentService(),
): Promise<SourceFileContentDto> {
  const input = sourceFileContentInputSchema.parse(rawInput);
  return await service.readSourceFile(input.projectId, input.relativePath);
}
