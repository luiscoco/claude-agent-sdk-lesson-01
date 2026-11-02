import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { runDemo, DEMO_RESULT } from '../src/server/demo.js';
import { runLive, queryOptions, type QueryHandle } from '../src/server/live.js';
import { presentMessage, safeError } from '../src/server/messages.js';
import { inspectPackage } from '../src/server/package-map.js';
import { createEventParser } from '../src/shared/sse.js';
import { SDK_VERSION, DEFAULT_PROMPT, type LabEvent } from '../src/shared/lesson.js';
const sdkMessage = (value: unknown) => value as SDKMessage;
const success = sdkMessage({
  type: 'result',
  subtype: 'success',
  is_error: false,
  result: 'Done.',
});
async function collect(events: AsyncIterable<LabEvent>) {
  const result: LabEvent[] = [];
  for await (const event of events) result.push(event);
  return result;
}

test('the simulated loop has intermediate activity and exactly one final result', async () => {
  const events = await collect(runDemo({ signal: new AbortController().signal, delayMs: 0 }));
  const messages = events.filter((event) => event.kind === 'message').map((event) => event.message);
  assert.deepEqual(
    messages.map((message) => message.type),
    ['system', 'assistant', 'user', 'assistant', 'user', 'assistant', 'result'],
  );
  assert.equal(messages.filter((message) => message.final).length, 1);
  assert.equal(messages.at(-1)?.final?.text, DEMO_RESULT);
  assert.ok(
    messages.some(
      (message) => message.type === 'user' && message.text.includes('export function addTask'),
    ),
  );
});
test('a cancelled demo stops yielding messages', async () => {
  const controller = new AbortController();
  const stream = runDemo({ signal: controller.signal, delayMs: 50 });
  await stream.next();
  controller.abort();
  await assert.rejects(async () => {
    for await (const _event of stream) {
      /* drain */
    }
  }, /abort/i);
});
test('assistant text is not mistaken for a final result', () => {
  const message = presentMessage(
    sdkMessage({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'I have an observation.' }] },
    }),
  );
  assert.equal(message.final, undefined);
  assert.equal(message.text, 'I have an observation.');
});
test('an error result is a final outcome but never a success', () => {
  const message = presentMessage(
    sdkMessage({
      type: 'result',
      subtype: 'error_max_turns',
      is_error: true,
      errors: ['Turn limit reached.'],
    }),
  );
  assert.deepEqual(message.final, { ok: false, text: 'Turn limit reached.' });
});
test('package map reflects the actual pinned manifest and type-only SDK tools', async () => {
  const pkg = await inspectPackage();
  assert.equal(pkg.version, SDK_VERSION);
  const tools = pkg.entries.find((entry) => entry.path.endsWith('/sdk-tools'));
  assert.equal(tools?.runtime, null);
  assert.equal(tools?.types, './sdk-tools.d.ts');
  assert.ok(
    pkg.entries.some((entry) => entry.label === 'Root package' && entry.runtime === './sdk.mjs'),
  );
  assert.ok(pkg.entries.some((entry) => entry.label === 'Core entry'));
  assert.ok(pkg.entries.some((entry) => entry.label === 'Browser entry'));
});
test('live options distinguish availability from auto-approval and bound the query', () => {
  const options = queryOptions(new AbortController());
  assert.deepEqual(options.tools, ['Read', 'Glob', 'Grep']);
  assert.deepEqual(options.allowedTools, options.tools);
  assert.equal(options.permissionMode, 'dontAsk');
  assert.equal(options.maxTurns, 4);
  assert.equal(options.maxBudgetUsd, 0.25);
  assert.equal(options.persistSession, false);
  assert.deepEqual(options.settingSources, []);
});
test('live runner calls the typed SDK contract and closes its handle after a result', async () => {
  let closed = 0;
  const events = await collect(
    runLive({
      prompt: DEFAULT_PROMPT,
      signal: new AbortController().signal,
      queryFactory(request) {
        assert.equal(request.prompt, DEFAULT_PROMPT);
        assert.ok(request.options?.cwd);
        return Object.assign(
          (async function* () {
            yield success;
          })(),
          {
            close() {
              closed++;
            },
          },
        );
      },
    }),
  );
  assert.equal(closed, 1);
  assert.ok(events.some((event) => event.kind === 'message' && event.message.final?.ok));
});
test('SDK exceptions still close the handle', async () => {
  let closed = 0;
  const handle: QueryHandle = Object.assign(
    (async function* (): AsyncGenerator<SDKMessage> {
      throw new Error('Model unavailable');
    })(),
    {
      close() {
        closed++;
      },
    },
  );
  await assert.rejects(
    collect(
      runLive({
        prompt: DEFAULT_PROMPT,
        signal: new AbortController().signal,
        queryFactory: () => handle,
      }),
    ),
    /Model unavailable/,
  );
  assert.equal(closed, 1);
});
test('a stream ending without a result is not silently marked complete', async () => {
  const handle: QueryHandle = Object.assign(
    (async function* (): AsyncGenerator<SDKMessage> {
      yield sdkMessage({ type: 'system', subtype: 'init' });
    })(),
    { close() {} },
  );
  await assert.rejects(
    collect(
      runLive({
        prompt: DEFAULT_PROMPT,
        signal: new AbortController().signal,
        queryFactory: () => handle,
      }),
    ),
    /without a result/,
  );
});
test('abort is forwarded to the SDK controller and cleanup still runs', async () => {
  const controller = new AbortController();
  let sdkController: AbortController | undefined;
  let closed = 0;
  const stream = runLive({
    prompt: DEFAULT_PROMPT,
    signal: controller.signal,
    queryFactory(request) {
      sdkController = request.options?.abortController;
      return Object.assign(
        (async function* () {
          yield success;
        })(),
        {
          close() {
            closed++;
          },
        },
      );
    },
  });
  await stream.next();
  await stream.next();
  controller.abort();
  await assert.rejects(async () => {
    for await (const _event of stream) {
      /* drain */
    }
  }, /abort/i);
  assert.equal(sdkController?.signal.aborted, true);
  assert.equal(closed, 1);
});
test('SSE parsing handles frames split across chunks and ignores heartbeats', () => {
  const values: unknown[] = [];
  const parse = createEventParser((value) => values.push(value));
  parse(': waiting\n\ndata: {"kind":"sta');
  parse('ge","stage":"host"}\n');
  parse('\ndata: {"kind":"done","status":"success"}\n\n');
  assert.deepEqual(values, [
    { kind: 'stage', stage: 'host' },
    { kind: 'done', status: 'success' },
  ]);
});
test('error messages redact API key-shaped strings', () => {
  assert.equal(safeError(new Error('Bad key sk-ant-test_123-secret')), 'Bad key [redacted]');
});
