import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { FIXTURE_ROOT } from './paths.js';
import type { LabEvent, MessageView } from '../shared/lesson.js';

export const DEMO_RESULT =
  'Tiny Tasks is a small TypeScript task tracker.\n\nPurpose: add tasks, mark them complete, and list open work.\n\nStructure: README.md describes the project, package.json records its metadata, and src/tasks.ts implements Task, addTask(), completeTask(), and listOpenTasks().\n\nNext learning step: write a test for completing a task ID that does not exist before deciding whether to change that behavior.';

/** Deliberately simulated SDK envelopes. No query(), model, or API billing here. */
export async function* runDemo({
  signal,
  delayMs = 700,
}: {
  signal: AbortSignal;
  delayMs?: number;
}): AsyncGenerator<LabEvent> {
  const readme = await readFile(path.join(FIXTURE_ROOT, 'README.md'), 'utf8');
  const source = await readFile(path.join(FIXTURE_ROOT, 'src/tasks.ts'), 'utf8');
  const messages: MessageView[] = [
    {
      type: 'system',
      subtype: 'init',
      text: 'A simulated session starts with Read available.',
      envelope: { type: 'system', subtype: 'init', tools: ['Read'], session_id: 'demo-session' },
    },
    {
      type: 'assistant',
      toolName: 'Read',
      text: 'I will read the project README.',
      envelope: {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'README.md' } }],
        },
      },
    },
    {
      type: 'user',
      text: readme,
      envelope: { type: 'user', message: { content: [{ type: 'tool_result', content: readme }] } },
    },
    {
      type: 'assistant',
      toolName: 'Read',
      text: 'I will inspect the three task functions.',
      envelope: {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'src/tasks.ts' } }],
        },
      },
    },
    {
      type: 'user',
      text: source,
      envelope: { type: 'user', message: { content: [{ type: 'tool_result', content: source }] } },
    },
    {
      type: 'assistant',
      text: 'The project exposes addTask, completeTask, and listOpenTasks. I can now summarize what I found.',
      envelope: {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'text',
              text: 'The project exposes three task functions. I can now summarize what I found.',
            },
          ],
        },
      },
    },
    {
      type: 'result',
      subtype: 'success',
      text: DEMO_RESULT,
      final: { ok: true, text: DEMO_RESULT },
      envelope: { type: 'result', subtype: 'success', is_error: false, result: DEMO_RESULT },
    },
  ];
  for (const stage of [
    { stage: 'host', text: 'The host supplies the fixed prompt and Tiny Tasks workspace.' },
    { stage: 'agent', text: 'A guided replay illustrates the agent loop; no model is running.' },
  ] as const) {
    signal.throwIfAborted();
    yield { kind: 'stage', ...stage };
    if (delayMs) await wait(delayMs / 2, undefined, { signal });
  }
  for (const message of messages) {
    if (delayMs) await wait(delayMs, undefined, { signal });
    signal.throwIfAborted();
    yield {
      kind: 'stage',
      stage: message.type === 'result' ? 'result' : 'stream',
      text: `Observe message.type = "${message.type}".`,
    };
    yield { kind: 'message', message };
  }
}
