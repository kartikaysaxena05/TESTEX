import type { DesktopErrorCode } from '@ai-quality/contracts';
import { AiGatewayError } from '../ai-errors.js';

export class RagError extends AiGatewayError {
  constructor(message: string, code: DesktopErrorCode = 'RAG_RETRIEVAL_FAILED') {
    super(message, code);
    this.name = 'RagError';
  }
}

export class RagProjectMismatchError extends RagError {
  constructor(
    message: string = 'Requested requirement does not belong to the authorized project.',
  ) {
    super(message, 'RAG_PROJECT_MISMATCH');
    this.name = 'RagProjectMismatchError';
  }
}

export class RagRequirementNotFoundError extends RagError {
  constructor(requirementId: string) {
    super(`Requirement with ID "${requirementId}" was not found.`, 'RAG_REQUIREMENT_NOT_FOUND');
    this.name = 'RagRequirementNotFoundError';
  }
}

export class RagInvalidRequestError extends RagError {
  constructor(message: string) {
    super(message, 'RAG_INVALID_REQUEST');
    this.name = 'RagInvalidRequestError';
  }
}

export class RagBudgetExceededError extends RagError {
  constructor(message: string = 'Retrieval context budget exceeded platform limits.') {
    super(message, 'RAG_BUDGET_EXCEEDED');
    this.name = 'RagBudgetExceededError';
  }
}

export class RagRequirementChangedError extends RagError {
  constructor(requirementId: string) {
    super(
      `Requirement "${requirementId}" was modified concurrently during context retrieval.`,
      'RAG_REQUIREMENT_CHANGED_DURING_RETRIEVAL',
    );
    this.name = 'RagRequirementChangedError';
  }
}

export class RagVectorIndexUnavailableError extends RagError {
  constructor(message: string = 'Vector retrieval index is unavailable or not ready.') {
    super(message, 'RAG_VECTOR_INDEX_UNAVAILABLE');
    this.name = 'RagVectorIndexUnavailableError';
  }
}
