/** Read this file alongside Lesson 1. The web UI uses the same SDK pattern. */
import { query } from '@anthropic-ai/claude-agent-sdk';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import path from 'node:path';
import { DEFAULT_PROMPT } from '../shared/lesson.js';
import { PROJECT_ROOT } from '../server/paths.js';
import { queryOptions } from '../server/live.js';
import { runDemo } from '../server/demo.js';

if (existsSync(path.join(PROJECT_ROOT, '.env'))) loadEnvFile(path.join(PROJECT_ROOT, '.env'));
const controller = new AbortController();
const stop = () => controller.abort();
process.once('SIGINT', stop);
try {
  if (process.argv.includes('--demo')) {
    console.log('SIMULATED MESSAGE REPLAY — no model API request.\n');
    for await (const event of runDemo({ signal: controller.signal, delayMs: 0 })) {
      if (event.kind === 'message')
        console.log(
          event.message.type,
          event.message.subtype ?? '',
          event.message.final ? `\n${event.message.final.text}` : '',
        );
    }
  } else {
    if (!process.env.ANTHROPIC_API_KEY?.trim())
      throw new Error('Set ANTHROPIC_API_KEY in .env, or run npm run demo:cli.');
    // 1. The host supplies prompt and options. Configuration is nested in options.
    const q = query({ prompt: DEFAULT_PROMPT, options: queryOptions(controller) });
    try {
      // 2. The host observes a stream, not just one final string.
      for await (const message of q) {
        console.log('message.type:', message.type);
        // 3. A result is an outcome; check its subtype before reading .result.
        if (message.type === 'result') {
          if (message.subtype === 'success' && !message.is_error) console.log(message.result);
          else {
            console.error(message.subtype);
            process.exitCode = 1;
          }
          break;
        }
      }
    } finally {
      q.close();
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'The query failed.');
  process.exitCode = 1;
} finally {
  process.off('SIGINT', stop);
}
