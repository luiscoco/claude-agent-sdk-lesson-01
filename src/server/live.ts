import { query, type Options, type Query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { FIXTURE_ROOT } from './paths.js';
import { presentMessage } from './messages.js';
import type { LabEvent } from '../shared/lesson.js';
export const MAX_TURNS = 4;
export const MAX_BUDGET_USD = 0.25;
export type QueryHandle = AsyncIterable<SDKMessage> & Pick<Query, 'close'>;
export type QueryFactory = (request: Parameters<typeof query>[0]) => QueryHandle;

export function queryOptions(controller: AbortController): Options {
  return {
    cwd: FIXTURE_ROOT,
    tools: ['Read', 'Glob', 'Grep'],
    allowedTools: ['Read', 'Glob', 'Grep'],
    permissionMode: 'dontAsk',
    settingSources: [],
    mcpServers: {},
    persistSession: false,
    maxTurns: MAX_TURNS,
    maxBudgetUsd: MAX_BUDGET_USD,
    abortController: controller,
    ...(process.env.ANTHROPIC_MODEL ? { model: process.env.ANTHROPIC_MODEL } : {}),
    systemPrompt:
      'Explain this small learning fixture clearly. Read only files inside the working directory. Do not change files or run commands. Keep the final answer concise.',
  };
}

export async function* runLive({
  prompt,
  signal,
  queryFactory = query,
}: {
  prompt: string;
  signal: AbortSignal;
  queryFactory?: QueryFactory;
}): AsyncGenerator<LabEvent> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  let handle: QueryHandle | undefined;
  let sawResult = false;
  try {
    signal.throwIfAborted();
    yield {
      kind: 'stage',
      stage: 'host',
      text: 'The Node.js host supplies prompt and options to query().',
    };
    handle = queryFactory({ prompt, options: queryOptions(controller) });
    yield {
      kind: 'stage',
      stage: 'agent',
      text: 'The real SDK query is running with read-only built-in tools.',
    };
    for await (const message of handle) {
      signal.throwIfAborted();
      const view = presentMessage(message);
      yield {
        kind: 'stage',
        stage: view.final ? 'result' : 'stream',
        text: `Observe message.type = "${message.type}".`,
      };
      yield { kind: 'message', message: view };
      if (view.final) {
        sawResult = true;
        break;
      }
    }
    if (!sawResult) throw new Error('The stream ended without a result message.');
  } finally {
    // Cleanup also runs on abort, early break, and exceptions.
    controller.abort();
    handle?.close();
    signal.removeEventListener('abort', abort);
  }
}
