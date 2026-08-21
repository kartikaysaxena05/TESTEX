/**
 * @file packages/core/src/ai/openai-provider-adapter.test.ts
 * Unit tests for the OpenAI provider adapter.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import OpenAI from 'openai';
import { OpenAiProviderAdapter } from './openai-provider-adapter.js';
import {
  AiProviderNotConfiguredError,
  AiAuthenticationError,
  AiPermissionDeniedError,
  AiRateLimitError,
  AiProviderUnavailableError,
  AiNetworkError,
  AiInvalidRequestError,
  AiInvalidProviderResponseError,
} from './ai-errors.js';

describe('OpenAiProviderAdapter', () => {
  it('identifies unconfigured state when no API key is provided', async () => {
    const adapter = new OpenAiProviderAdapter({ apiKey: '' });
    assert.equal(adapter.isConfigured(), false);

    const status = await adapter.healthCheck();
    assert.equal(status.status, 'NOT_CONFIGURED');
    assert.equal(status.configured, false);

    await assert.rejects(
      () =>
        adapter.generate({
          providerId: 'OPENAI',
          model: 'gpt-4o-mini',
          messages: [{ role: 'USER', content: 'test' }],
        }),
      AiProviderNotConfiguredError,
    );
  });

  it('translates messages, parameters, and responses accurately with a mock OpenAI client', async () => {
    let capturedArgs: unknown = null;
    const mockResponse: OpenAI.Chat.Completions.ChatCompletion = {
      id: 'chatcmpl-test-12345',
      object: 'chat.completion',
      created: 1700000000,
      model: 'gpt-4o-mini-2024-07-18',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'Hello! I am a verified AI response.',
            refusal: null,
          },
          finish_reason: 'stop',
          logprobs: null,
        },
      ],
      usage: {
        prompt_tokens: 15,
        completion_tokens: 8,
        total_tokens: 23,
      },
    };

    const mockClient = {
      chat: {
        completions: {
          create: async (args: unknown) => {
            capturedArgs = args;
            return mockResponse;
          },
        },
      },
      models: {
        list: async () => ({ data: [] }),
      },
    } as unknown as OpenAI;

    const adapter = new OpenAiProviderAdapter({ client: mockClient });
    assert.equal(adapter.isConfigured(), true);

    const result = await adapter.generate({
      providerId: 'OPENAI',
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 500,
      messages: [
        { role: 'SYSTEM', content: 'System instruction.' },
        { role: 'USER', content: 'User prompt.' },
        { role: 'ASSISTANT', content: 'Assistant turn.' },
      ],
    });

    assert.equal(result.providerId, 'OPENAI');
    assert.equal(result.text, 'Hello! I am a verified AI response.');
    assert.equal(result.modelRequested, 'gpt-4o-mini');
    assert.equal(result.modelReported, 'gpt-4o-mini-2024-07-18');
    assert.equal(result.finishReason, 'stop');
    assert.equal(result.providerRequestId, 'chatcmpl-test-12345');
    assert.deepEqual(result.usage, {
      inputTokens: 15,
      outputTokens: 8,
      totalTokens: 23,
    });

    assert.deepEqual(capturedArgs, {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'System instruction.' },
        { role: 'user', content: 'User prompt.' },
        { role: 'assistant', content: 'Assistant turn.' },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });
  });

  it('maps SDK error types to domain error hierarchy', async () => {
    const createErrorClient = (errorToThrow: Error) =>
      ({
        chat: {
          completions: {
            create: async () => {
              throw errorToThrow;
            },
          },
        },
      }) as unknown as OpenAI;

    // 401 AuthenticationError
    const authError = new OpenAI.AuthenticationError(
      401,
      { message: 'Invalid API Key' },
      'Invalid API Key',
      new Headers(),
    );
    const authAdapter = new OpenAiProviderAdapter({ client: createErrorClient(authError) });
    await assert.rejects(
      () =>
        authAdapter.generate({
          providerId: 'OPENAI',
          model: 'gpt-4o-mini',
          messages: [{ role: 'USER', content: 'hi' }],
        }),
      (err: unknown) =>
        err instanceof AiAuthenticationError && err.code === 'AUTHENTICATION_FAILED',
    );

    // 403 PermissionDeniedError
    const permError = new OpenAI.PermissionDeniedError(
      403,
      { message: 'Denied' },
      'Denied',
      new Headers(),
    );
    const permAdapter = new OpenAiProviderAdapter({ client: createErrorClient(permError) });
    await assert.rejects(
      () =>
        permAdapter.generate({
          providerId: 'OPENAI',
          model: 'gpt-4o-mini',
          messages: [{ role: 'USER', content: 'hi' }],
        }),
      (err: unknown) => err instanceof AiPermissionDeniedError && err.code === 'PERMISSION_DENIED',
    );

    // 429 RateLimitError
    const rateLimitError = new OpenAI.RateLimitError(
      429,
      { message: 'Quota exceeded' },
      'Quota exceeded',
      new Headers(),
    );
    const rateAdapter = new OpenAiProviderAdapter({ client: createErrorClient(rateLimitError) });
    await assert.rejects(
      () =>
        rateAdapter.generate({
          providerId: 'OPENAI',
          model: 'gpt-4o-mini',
          messages: [{ role: 'USER', content: 'hi' }],
        }),
      (err: unknown) => err instanceof AiRateLimitError && err.code === 'RATE_LIMITED',
    );

    // 500 InternalServerError
    const serverError = new OpenAI.InternalServerError(
      500,
      { message: 'Server error' },
      'Server error',
      new Headers(),
    );
    const serverAdapter = new OpenAiProviderAdapter({ client: createErrorClient(serverError) });
    await assert.rejects(
      () =>
        serverAdapter.generate({
          providerId: 'OPENAI',
          model: 'gpt-4o-mini',
          messages: [{ role: 'USER', content: 'hi' }],
        }),
      (err: unknown) =>
        err instanceof AiProviderUnavailableError && err.code === 'PROVIDER_UNAVAILABLE',
    );

    // 400 BadRequestError
    const badRequestError = new OpenAI.BadRequestError(
      400,
      { message: 'Context window exceeded' },
      'Context window exceeded',
      new Headers(),
    );
    const badRequestAdapter = new OpenAiProviderAdapter({
      client: createErrorClient(badRequestError),
    });
    await assert.rejects(
      () =>
        badRequestAdapter.generate({
          providerId: 'OPENAI',
          model: 'gpt-4o-mini',
          messages: [{ role: 'USER', content: 'hi' }],
        }),
      (err: unknown) => err instanceof AiInvalidRequestError && err.code === 'INVALID_REQUEST',
    );

    // Connection Error
    const connError = new OpenAI.APIConnectionError({ message: 'DNS resolution failed' });
    const connAdapter = new OpenAiProviderAdapter({ client: createErrorClient(connError) });
    await assert.rejects(
      () =>
        connAdapter.generate({
          providerId: 'OPENAI',
          model: 'gpt-4o-mini',
          messages: [{ role: 'USER', content: 'hi' }],
        }),
      (err: unknown) => err instanceof AiNetworkError && err.code === 'NETWORK_ERROR',
    );
  });

  it('rejects responses with empty choices or invalid format', async () => {
    const invalidClient = {
      chat: {
        completions: {
          create: async () => ({
            id: 'bad-response',
            choices: [],
          }),
        },
      },
    } as unknown as OpenAI;

    const adapter = new OpenAiProviderAdapter({ client: invalidClient });
    await assert.rejects(
      () =>
        adapter.generate({
          providerId: 'OPENAI',
          model: 'gpt-4o-mini',
          messages: [{ role: 'USER', content: 'hi' }],
        }),
      AiInvalidProviderResponseError,
    );
  });
});
