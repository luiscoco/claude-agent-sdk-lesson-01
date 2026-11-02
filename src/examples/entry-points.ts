// Compile-checked examples of the three server-side / type imports in Lesson 1.
import { query } from '@anthropic-ai/claude-agent-sdk';
import { query as coreQuery } from '@anthropic-ai/claude-agent-sdk/core';
import type { FileReadInput } from '@anthropic-ai/claude-agent-sdk/sdk-tools';
export const rootQuery: typeof query = query;
export const focusedQuery: typeof coreQuery = coreQuery;
export const sampleRead: FileReadInput = { file_path: '/example/README.md' };
// Merely importing these functions does not start a query or call a model.
